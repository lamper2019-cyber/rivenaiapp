import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";

/**
 * Daily weight check-in — the one-number slider RIVEN now asks for every day.
 * Separate from the monthly WeeklyCheckIn (waist + photos), which still runs
 * on its own 30-day cadence. We coach the 7-day ROLLING AVERAGE of these daily
 * numbers, never the day-to-day scale wiggle.
 */

export type DailyWeighSnapshot = {
  /** Pre-fill for the slider — her most recent weight. */
  prefillWeight: number;
  /** Goal weight, for the "X lb to goal" label. */
  goalWeight: number;
};

/**
 * Show the daily weight slider on /dashboard only if she HASN'T weighed today.
 * Returns null once she's logged today's number so the card self-hides.
 */
export async function getDailyWeighSnapshot(
  userId: string,
): Promise<DailyWeighSnapshot | null> {
  const today = startOfCentralDay();
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
  // Already weighed today → hide the card.
  if (last && last.day.getTime() === today.getTime()) return null;

  return {
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
