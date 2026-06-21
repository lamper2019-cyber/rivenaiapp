import { prisma } from "@/lib/prisma";
import { startOfIsoWeek } from "@/lib/week";

/**
 * Weekly review data — the calorie average + waist measurement that join the
 * weight average in the Sunday ritual and the home "This Week" card.
 *
 * Weight is already covered by daily-weigh-in.ts (getRollingWeeklyAverage +
 * getSundayWrap). This file adds the other two columns of the weekly snapshot.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const centralDateKey = (d: Date): string =>
  d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export type CalorieWeek = {
  /** Avg calories per LOGGED day this week (last 7 days). */
  thisAvg: number;
  /** Same for the prior 7 days, or null if nothing logged then. */
  lastAvg: number | null;
  /** Her cut target — what we coach against. */
  target: number;
  /** thisAvg − target (negative = under target, good for a cut). */
  vsTarget: number;
  /** How many distinct days had logs this week (denominator honesty). */
  daysLogged: number;
  /** RIVEN's read for the adjustment. */
  direction: "none" | "under" | "on" | "over";
};

/**
 * Average daily calories from her MealLogs, this week vs last, against her cut
 * target. Denominator is days-she-actually-logged (not a flat 7) so a 3-day
 * week reads as her real average, not an artificially low one.
 */
export async function getCalorieWeek(
  userId: string,
  target: number,
): Promise<CalorieWeek | null> {
  const since = new Date(Date.now() - 14 * DAY_MS);
  const logs = await prisma.mealLog.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { calories: true, createdAt: true },
  });
  if (logs.length === 0) return null;

  // Bucket calories by Central calendar day.
  const byDay = new Map<string, number>();
  for (const l of logs) {
    const k = centralDateKey(l.createdAt);
    byDay.set(k, (byDay.get(k) ?? 0) + l.calories);
  }

  const todayKey = centralDateKey(new Date());
  const keyNDaysAgo = (n: number) => centralDateKey(new Date(Date.now() - n * DAY_MS));
  const thisWeekKeys = new Set(Array.from({ length: 7 }, (_, i) => keyNDaysAgo(i)));
  const lastWeekKeys = new Set(Array.from({ length: 7 }, (_, i) => keyNDaysAgo(i + 7)));

  const avgFor = (keys: Set<string>): { avg: number | null; days: number } => {
    let sum = 0, days = 0;
    Array.from(byDay.entries()).forEach(([k, cals]) => {
      if (keys.has(k)) { sum += cals; days++; }
    });
    return { avg: days ? Math.round(sum / days) : null, days };
  };

  const thisWeek = avgFor(thisWeekKeys);
  const lastWeek = avgFor(lastWeekKeys);
  if (thisWeek.avg == null) return null;

  const vsTarget = thisWeek.avg - target;
  let direction: CalorieWeek["direction"];
  if (thisWeek.days < 2) direction = "none"; // not enough to call it
  else if (vsTarget <= -100) direction = "under";
  else if (vsTarget >= 100) direction = "over";
  else direction = "on";

  void todayKey; // (kept for clarity that "today" is included in this week)
  return {
    thisAvg: thisWeek.avg,
    lastAvg: lastWeek.avg,
    target,
    vsTarget,
    daysLogged: thisWeek.days,
    direction,
  };
}

export type WaistSnapshot = {
  /** Most recent waist (in), or null if never measured. */
  current: number | null;
  /** The one before that, for the trend. */
  prior: number | null;
  /** current − prior (negative = shrinking). null if no prior. */
  deltaIn: number | null;
  /** Whether she's already logged THIS week's waist. */
  loggedThisWeek: boolean;
  /** What to pre-fill the input with (last value, or a sane default). */
  prefill: number;
};

export async function getWaistSnapshot(userId: string): Promise<WaistSnapshot> {
  const rows = await prisma.waistEntry.findMany({
    where: { userId },
    orderBy: { weekStart: "desc" },
    take: 2,
    select: { waistIn: true, weekStart: true },
  });

  const weekKey = startOfIsoWeek(new Date()).toISOString().slice(0, 10);
  const current = rows[0]?.waistIn ?? null;
  const prior = rows[1]?.waistIn ?? null;
  const loggedThisWeek =
    rows[0] != null && rows[0].weekStart.toISOString().slice(0, 10) === weekKey;

  return {
    current,
    prior,
    deltaIn: current != null && prior != null ? Math.round((current - prior) * 10) / 10 : null,
    loggedThisWeek,
    prefill: current ?? 34,
  };
}

/**
 * Record (or update) this week's waist measurement. One row per ISO week — a
 * re-submit the same week overwrites rather than duplicating.
 */
export async function submitWaist(userId: string, waistIn: number): Promise<void> {
  const weekStart = startOfIsoWeek(new Date());
  const clamped = Math.min(80, Math.max(15, Math.round(waistIn * 10) / 10));
  await prisma.waistEntry.upsert({
    where: { userId_weekStart: { userId, weekStart } },
    update: { waistIn: clamped },
    create: { userId, weekStart, waistIn: clamped },
  });
}
