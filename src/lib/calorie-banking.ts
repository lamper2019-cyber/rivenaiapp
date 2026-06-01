/**
 * Calorie banking ("smooth my week") — the DB-aware half.
 *
 * The pure math lives in src/lib/calorie-schedule.ts (`bankedTargetForToday`).
 * This module reads the week's actual intake from MealLog and feeds it that
 * function, so the rest of the app can ask one question — "what's her target
 * today?" — and get the right answer whether banking is on or off.
 *
 * Banking is a per-client lever (Profile.calorieBankingEnabled, default OFF).
 * When OFF this resolver falls straight back to getTodayCalorieTarget, so the
 * flat-cut and per-day-cycling clients behave exactly as before.
 */

import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import {
  DAY_KEYS,
  centralDayOfWeek,
  getTodayCalorieTarget,
  bankedTargetForToday,
} from "@/lib/calorie-schedule";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calories actually logged on each COMPLETED day this week, Sun-first.
 *
 * Returns an array of length = today's Central day-of-week index (Sun → 0
 * entries, Mon → 1, ... Sat → 6). Today is deliberately excluded: today's
 * banked target depends only on days that are already in the books, so it
 * stays stable no matter what she logs later today.
 *
 * Buckets by each row's Central-time day-of-week — unambiguous because the
 * window is a single week, so no weekday repeats.
 */
export async function getWeekDailyCalories(
  userId: string,
  now: Date = new Date(),
): Promise<number[]> {
  const todayIndex = DAY_KEYS.indexOf(centralDayOfWeek(now));
  if (todayIndex <= 0) return []; // Sunday — clean weekly reset, no prior days.

  const todayStart = startOfCentralDay(now);
  // Step back `todayIndex` days, then re-anchor to Central midnight so a DST
  // boundary inside the week can't shift the start by an hour.
  const weekStart = startOfCentralDay(
    new Date(todayStart.getTime() - todayIndex * MS_PER_DAY),
  );

  const rows = await prisma.mealLog.findMany({
    where: { userId, createdAt: { gte: weekStart, lt: todayStart } },
    select: { calories: true, createdAt: true },
  });

  const buckets = new Array<number>(todayIndex).fill(0);
  for (const r of rows) {
    const idx = DAY_KEYS.indexOf(centralDayOfWeek(r.createdAt));
    if (idx >= 0 && idx < todayIndex) buckets[idx] += r.calories;
  }
  return buckets;
}

export type ResolvedCalorieTarget = {
  /** The number to show her today (banked when on, flat/cycled when off). */
  target: number;
  /** The coach's daily average — cutCalories. */
  base: number;
  /** Net calories banked (+) or owed (−) rolling into today. 0 when off. */
  carryIn: number;
  /** True only when banking actually moved today's number off `base`. */
  banked: boolean;
};

/**
 * The one call every read path should use for "her target today." Honors the
 * banking lever when it's on; otherwise defers to getTodayCalorieTarget (which
 * itself honors per-day cycling, then flat cutCalories). Never throws — a DB
 * hiccup while reading the week falls back to the flat target.
 */
export async function resolveTodayCalorieTarget(
  userId: string,
  profile: {
    cutCalories: number;
    dailyCalorieSchedule: unknown;
    calorieBankingEnabled: boolean;
  },
  now: Date = new Date(),
): Promise<ResolvedCalorieTarget> {
  const base = profile.cutCalories;

  if (!profile.calorieBankingEnabled) {
    return {
      target: getTodayCalorieTarget(profile, now),
      base,
      carryIn: 0,
      banked: false,
    };
  }

  try {
    const priorActuals = await getWeekDailyCalories(userId, now);
    const { target, carryIn, adjusted } = bankedTargetForToday({
      base,
      priorActuals,
    });
    return { target, base, carryIn, banked: adjusted };
  } catch {
    // Reading the week failed — fall back to the flat target rather than
    // showing her a wrong banked number.
    return { target: base, base, carryIn: 0, banked: false };
  }
}
