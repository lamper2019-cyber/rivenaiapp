/**
 * Wins generation + check-in history aggregation. Pure functions over
 * already-loaded data — load DB rows in the page, pipe them through here.
 */

import type { Profile, WeeklyCheckIn } from "@prisma/client";

export type Win = {
  id: string;
  headline: string;
  detail: string;
  tone: "neutral" | "sage" | "gold";
};

/**
 * Compute "wins" cards based on profile + check-in history.
 * checkIns must be sorted ascending by weekStart.
 */
export function computeWins(profile: Profile, checkIns: WeeklyCheckIn[]): Win[] {
  const wins: Win[] = [];

  // 1. Total weight lost since start.
  const lost = profile.startWeight - profile.currentWeight;
  if (lost >= 0.5) {
    wins.push({
      id: "lost-since-start",
      headline: `Down ${lost.toFixed(1)} lbs`,
      detail: `Since you started at ${profile.startWeight} lbs.`,
      tone: "sage",
    });
  } else if (lost <= -1.5) {
    // Real gain (not just water) — report neutrally, no shame.
    wins.push({
      id: "up-since-start",
      headline: `Up ${Math.abs(lost).toFixed(1)} lbs`,
      detail: `Could be cycle, sleep, or stress. RIVEN reads the trend, not the number.`,
      tone: "neutral",
    });
  }

  // 2. Waist change vs first check-in.
  if (checkIns.length >= 2) {
    const first = checkIns[0];
    const latest = checkIns[checkIns.length - 1];
    const waistDelta = first.waist - latest.waist;
    if (Math.abs(waistDelta) >= 0.5) {
      const down = waistDelta > 0;
      wins.push({
        id: "waist-change",
        headline: `Waist ${down ? "−" : "+"}${Math.abs(waistDelta).toFixed(1)}″`,
        detail: down
          ? `Inches off the tape since your first check-in.`
          : `Recomposition has phases. Trust the protein floor.`,
        tone: down ? "gold" : "neutral",
      });
    }
  }

  // 3. Months consistent: count of consecutive monthly check-ins ending
  // with the latest. (The cadence used to be weekly — historical weekly
  // rows still get counted by the gap-based detector because the slop
  // window is generous.)
  const consecutive = countConsecutiveMonths(checkIns);
  if (consecutive >= 2) {
    wins.push({
      id: "months-consistent",
      headline: `${consecutive} months consistent`,
      detail: `Check-ins ${consecutive === 2 ? "two" : "in a row"} — the engine is built on this.`,
      tone: "sage",
    });
  }

  // 4. Goal progress percentage.
  const totalToLose = profile.startWeight - profile.goalWeight;
  if (totalToLose > 0 && lost > 0) {
    const pct = Math.min(100, Math.round((lost / totalToLose) * 100));
    if (pct >= 10) {
      wins.push({
        id: "goal-progress",
        headline: `${pct}% of the way to goal`,
        detail: `${(profile.currentWeight - profile.goalWeight).toFixed(1)} lbs to your goal weight.`,
        tone: "gold",
      });
    }
  }

  return wins;
}

/**
 * Number of consecutive months (counted backward from the latest check-in)
 * with no missing month. Tolerates the historical weekly cadence too — if
 * any check-in landed inside a calendar month, that month counts. The
 * counter walks back month-by-month from the latest check-in's month.
 */
function countConsecutiveMonths(checkIns: WeeklyCheckIn[]): number {
  if (checkIns.length === 0) return 0;
  const sorted = [...checkIns].sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
  );
  // Reduce to the set of unique (year, month) keys her check-ins covered.
  const monthsSet = new Set<string>();
  for (const c of sorted) {
    const key = c.weekStart.toLocaleDateString("en-US", {
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Chicago",
    });
    monthsSet.add(key);
  }
  // Walk back from the latest month, stop on the first gap.
  const latest = sorted[sorted.length - 1].weekStart;
  // Build a "month cursor" in Central wall time.
  let cursor = new Date(
    Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth(), 15, 12),
  );
  let streak = 0;
  while (true) {
    const key = cursor.toLocaleDateString("en-US", {
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Chicago",
    });
    if (monthsSet.has(key)) {
      streak++;
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 15, 12),
      );
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Reduce check-ins to {x, y} points for a sparkline.
 */
export type SeriesPoint = { x: number; y: number; label: string };

export function toWeightSeries(checkIns: WeeklyCheckIn[]): SeriesPoint[] {
  return checkIns.map((c, i) => ({
    x: i,
    y: c.weight,
    label: c.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));
}

export function toWaistSeries(checkIns: WeeklyCheckIn[]): SeriesPoint[] {
  return checkIns.map((c, i) => ({
    x: i,
    y: c.waist,
    label: c.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));
}
