import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";

/**
 * Weight check-in — the one-number slider, on a Sun/Wed/Fri cadence
 * (2026-06-18, Sean: weigh-ins only Sunday, Wednesday, and Friday morning).
 * Three anchor days beat daily: less scale anxiety, same trend quality. We
 * coach the WEEKLY AVERAGE of those numbers, never a single reading.
 * Separate from the monthly WeeklyCheckIn (waist + photos).
 */

/** Central weekdays she weighs in: Sunday, Wednesday, Friday. */
const WEIGH_DAY_NAMES = new Set(["Sun", "Wed", "Fri"]);

/** Is the given instant a weigh-in day in Central time? */
export function isWeighDay(d: Date = new Date()): boolean {
  const wd = d.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  });
  return WEIGH_DAY_NAMES.has(wd);
}

export type DailyWeighSnapshot = {
  /** True when today is a Sun/Wed/Fri weigh day — the card only renders then. */
  isWeighDay: boolean;
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
    isWeighDay: isWeighDay(),
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
  // (Milestone moments used to auto-share to The Circle here. The community
  // tab was retired 2026-08-04 — nothing to broadcast to now.)
}

export type WeighHistoryRow = {
  /** YYYY-MM-DD (Central calendar day) — the stable key edits/deletes use. */
  day: string;
  weightLb: number;
  /** True for today's row — UI labels it "Today". */
  isToday: boolean;
};

/**
 * Her full weigh-in history, newest first, for the account editor. Default
 * 90 days is plenty to scroll; she can correct any of them.
 */
export async function getWeighHistory(
  userId: string,
  take = 90,
): Promise<WeighHistoryRow[]> {
  const rows = await prisma.dailyWeighIn.findMany({
    where: { userId },
    orderBy: { day: "desc" },
    take,
    select: { day: true, weightLb: true },
  });
  const todayKey = centralDateKey();
  return rows.map((r) => {
    const day = r.day.toISOString().slice(0, 10);
    return { day, weightLb: r.weightLb, isToday: day === todayKey };
  });
}

/** UTC instant that stores as the given YYYY-MM-DD in a @db.Date column.
 *  Noon UTC keeps the date portion stable in every timezone. */
function dateColFromKey(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00Z`);
}

/** Re-sync Profile.currentWeight to her most recent remaining weigh-in.
 *  Called after any edit/delete so downstream surfaces never read a stale
 *  number (e.g. after deleting today's row). */
async function resyncCurrentWeight(userId: string): Promise<void> {
  const latest = await prisma.dailyWeighIn.findFirst({
    where: { userId },
    orderBy: { day: "desc" },
    select: { weightLb: true },
  });
  if (latest) {
    await prisma.profile.update({
      where: { userId },
      data: { currentWeight: latest.weightLb },
    });
  }
}

/**
 * Add or correct one day's weight (the account editor — re-log a typo, or
 * backfill a day she missed). Upsert by (user, day). Deliberately does NOT
 * fire the Circle auto-share: corrections and backfills aren't live "I just
 * weighed in" moments. Re-syncs currentWeight after.
 */
export async function setWeighForDay(args: {
  userId: string;
  dayKey: string;
  weight: number;
}): Promise<void> {
  const day = dateColFromKey(args.dayKey);
  await prisma.dailyWeighIn.upsert({
    where: { userId_day: { userId: args.userId, day } },
    update: { weightLb: args.weight },
    create: { userId: args.userId, day, weightLb: args.weight },
  });
  await resyncCurrentWeight(args.userId);
}

/** Delete one day's weigh-in (logged it by mistake). Re-syncs currentWeight. */
export async function deleteWeighForDay(args: {
  userId: string;
  dayKey: string;
}): Promise<void> {
  const day = dateColFromKey(args.dayKey);
  await prisma.dailyWeighIn
    .delete({ where: { userId_day: { userId: args.userId, day } } })
    .catch(() => {}); // already gone → fine
  await resyncCurrentWeight(args.userId);
}

export type WeeklyAverage = {
  /** Rounded weekly average weight. */
  avg: number;
  /** How many weigh-ins fed the average (1–3 on the Sun/Wed/Fri cadence). */
  count: number;
};

/** YYYY-MM-DD key for the Central calendar day n days before today. */
function centralKeyDaysAgo(n: number): string {
  return centralDateKey(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}

/**
 * The weekly average from weigh-ins inside the LAST 7 CALENDAR DAYS — the
 * number we actually coach. Date-windowed (not last-N-rows) because on the
 * Sun/Wed/Fri cadence "last 7 rows" would span multiple weeks and smear the
 * trend. Returns null when nothing was logged in the window.
 */
export async function getRollingWeeklyAverage(
  userId: string,
  windowDays = 7,
): Promise<WeeklyAverage | null> {
  const rows = await prisma.dailyWeighIn.findMany({
    where: { userId },
    orderBy: { day: "desc" },
    take: 14, // plenty to cover any 7-day window on a 3-a-week cadence
    select: { day: true, weightLb: true },
  });
  const cutoff = centralKeyDaysAgo(windowDays - 1);
  const inWindow = rows.filter((r) => r.day.toISOString().slice(0, 10) >= cutoff);
  if (inWindow.length === 0) return null;
  const sum = inWindow.reduce((a, r) => a + r.weightLb, 0);
  return { avg: Math.round((sum / inWindow.length) * 10) / 10, count: inWindow.length };
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
    take: 30,
    select: { day: true, weightLb: true },
  });
  if (rows.length === 0) return null;

  // Date-windowed weeks (this week = last 7 calendar days, last week = the 7
  // before that). On the Sun/Wed/Fri cadence each window holds up to 3 rows —
  // slicing by row count would smear weeks together.
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const thisCut = centralKeyDaysAgo(6);
  const lastCut = centralKeyDaysAgo(13);
  const thisWeek = rows.filter((r) => key(r.day) >= thisCut).map((r) => r.weightLb);
  const lastWeek = rows
    .filter((r) => key(r.day) >= lastCut && key(r.day) < thisCut)
    .map((r) => r.weightLb);

  // If she skipped this week entirely, still show her most recent numbers
  // rather than a blank — but call it "building", not a trend.
  const thisAvg =
    avgOf(thisWeek) ?? avgOf(rows.slice(0, 3).map((r) => r.weightLb))!;
  const lastAvg = avgOf(lastWeek);

  let direction: SundayWrap["direction"];
  let deltaLb = 0;
  if (thisWeek.length < 2) {
    direction = "building"; // fewer than 2 of her 3 weigh days — no trend call
  } else if (lastAvg == null) {
    direction = "first"; // first real week — set the baseline
  } else {
    deltaLb = Math.round((thisAvg - lastAvg) * 10) / 10;
    direction = deltaLb <= -0.3 ? "down" : deltaLb >= 0.3 ? "up" : "flat";
  }

  const series = rows.slice(0, 14).map((r) => r.weightLb).reverse();
  return { thisAvg, lastAvg, deltaLb, direction, series };
}

