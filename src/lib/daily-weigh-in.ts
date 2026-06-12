import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";

/**
 * Daily weight check-in — the one-number slider RIVEN now asks for every day.
 * Separate from the monthly WeeklyCheckIn (waist + photos), which still runs
 * on its own 30-day cadence. We coach the 7-day ROLLING AVERAGE of these daily
 * numbers, never the day-to-day scale wiggle.
 */

export type DailyWeighSnapshot = {
  /** True once she's logged today's number — render the "locked in" strip. */
  weighedToday: boolean;
  /** Today's logged weight, when weighedToday. */
  todayWeight: number | null;
  /** Pre-fill for the slider — her most recent weight. */
  prefillWeight: number;
  /** Goal weight, for the "X lb to goal" label. */
  goalWeight: number;
};

/**
 * Today's calendar date in Central, as YYYY-MM-DD. The DailyWeighIn.day
 * column is @db.Date — Postgres keeps only the date and Prisma reads it back
 * as midnight UTC, so comparing it to startOfCentralDay() with getTime()
 * NEVER matches (that bug kept the slider card up after she locked in).
 * Calendar-string comparison sidesteps the offset entirely.
 */
function centralDateKey(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/**
 * Daily weigh-in state for /dashboard: the slider when she hasn't logged
 * today, the "locked in for today" strip once she has.
 */
export async function getDailyWeighSnapshot(
  userId: string,
): Promise<DailyWeighSnapshot | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profile: {
        select: { startWeight: true, goalWeight: true, currentWeight: true },
      },
      dailyWeighIns: {
        orderBy: { day: "desc" },
        take: 1,
        select: { day: true, weightLb: true },
      },
    },
  });
  if (!user?.profile) return null;

  const last = user.dailyWeighIns[0] ?? null;
  // The stored @db.Date round-trips as midnight UTC, so its ISO date IS the
  // calendar day she logged. Compare calendars, not instants.
  const weighedToday =
    last != null && last.day.toISOString().slice(0, 10) === centralDateKey();

  return {
    weighedToday,
    todayWeight: weighedToday ? last!.weightLb : null,
    prefillWeight: last?.weightLb ?? user.profile.currentWeight ?? user.profile.startWeight,
    goalWeight: user.profile.goalWeight,
  };
}

/**
 * Upsert today's weigh-in (one row per user per day) and keep
 * Profile.currentWeight fresh so every surface reads the latest number.
 */
export async function submitDailyWeight(args: {
  userId: string;
  weight: number;
}): Promise<void> {
  const today = startOfCentralDay();
  await prisma.dailyWeighIn.upsert({
    where: { userId_day: { userId: args.userId, day: today } },
    update: { weightLb: args.weight },
    create: { userId: args.userId, day: today, weightLb: args.weight },
  });
  await prisma.profile.update({
    where: { userId: args.userId },
    data: { currentWeight: args.weight },
  });
  // Auto-share milestone moments (streaks, comebacks, first weigh-in) to
  // The Circle — behavior only, never her number. Best-effort: a share
  // failure must never break the weigh-in itself.
  const { maybeShareWeighMilestone } = await import("@/lib/circle-auto-share");
  await maybeShareWeighMilestone(args.userId).catch(() => {});
}

export type WeeklyAverage = {
  /** Rounded 7-day average weight. */
  avg: number;
  /** How many daily weigh-ins fed the average (1–7). */
  count: number;
};

/**
 * The 7-day rolling average from her most recent daily weigh-ins — the number
 * we actually coach (Sunday wrap reads this). Returns null with no data yet.
 */
export async function getRollingWeeklyAverage(
  userId: string,
  takeDays = 7,
): Promise<WeeklyAverage | null> {
  const rows = await prisma.dailyWeighIn.findMany({
    where: { userId },
    orderBy: { day: "desc" },
    take: takeDays,
    select: { weightLb: true },
  });
  if (rows.length === 0) return null;
  const sum = rows.reduce((a, r) => a + r.weightLb, 0);
  return { avg: Math.round((sum / rows.length) * 10) / 10, count: rows.length };
}

export type SundayWrap = {
  /** This week's 7-day average. */
  thisAvg: number;
  /** Last week's average, or null on the very first week. */
  lastAvg: number | null;
  /** thisAvg − lastAvg (negative = down). 0 when no last week. */
  deltaLb: number;
  /** Which read RIVEN gives her. */
  direction: "building" | "first" | "down" | "flat" | "up";
  /** Recent daily weights oldest→newest, for the trend line. */
  series: number[];
};

const avgOf = (a: number[]): number | null =>
  a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null;

/**
 * The Sunday full-screen wrap data. Returns null on any day that ISN'T Sunday
 * (Central), or when she has no weigh-ins yet. Compares this week's average to
 * last week's so the wrap can show the trend — the emotional payoff.
 */
export async function getSundayWrap(userId: string): Promise<SundayWrap | null> {
  // Only fires on Sundays (Central time).
  const weekday = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  });
  if (weekday !== "Sun") return null;

  const rows = await prisma.dailyWeighIn.findMany({
    where: { userId },
    orderBy: { day: "desc" },
    take: 14,
    select: { weightLb: true },
  });
  if (rows.length === 0) return null;

  const weights = rows.map((r) => r.weightLb);
  const thisAvg = avgOf(weights.slice(0, 7))!; // non-null: rows.length ≥ 1
  const lastAvg = avgOf(weights.slice(7, 14));

  let direction: SundayWrap["direction"];
  let deltaLb = 0;
  if (weights.slice(0, 7).length < 3) {
    direction = "building"; // not enough data this week to call a trend
  } else if (lastAvg == null) {
    direction = "first"; // first real week — set the baseline
  } else {
    deltaLb = Math.round((thisAvg - lastAvg) * 10) / 10;
    direction = deltaLb <= -0.3 ? "down" : deltaLb >= 0.3 ? "up" : "flat";
  }

  return { thisAvg, lastAvg, deltaLb, direction, series: [...weights].reverse() };
}

