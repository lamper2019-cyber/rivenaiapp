import { prisma } from "@/lib/prisma";
import { startOfIsoWeek } from "@/lib/week";

/**
 * "Together · this week" — collective stats for the dashboard.
 *
 * Four process-oriented metrics, none of them scale-based. The whole point
 * is that a small community (~8 clients today) can still hit BIG numbers
 * on cumulative process metrics, which feels good without leaning on
 * before/after comparisons.
 *
 *   - proteinGramsThisWeek   — sum of DailyTotals.totalProtein, Mon→now
 *   - streakDaysCombined     — sum of each active client's current logging streak
 *   - rosesSentThisWeek      — count of CheerReaction rows, Mon→now
 *   - stepsThisWeek          — sum of DailyTotals.totalSteps, Mon→now
 *
 * Restricted to CLIENT users with trialing / active / comped status so
 * canceled accounts don't pad the totals.
 */

export type CollectiveStats = {
  proteinGramsThisWeek: number;
  streakDaysCombined: number;
  rosesSentThisWeek: number;
  stepsThisWeek: number;
};

const ACTIVE_STATUSES = ["trialing", "active", "comped"];
const ACTIVE_FILTER = {
  role: "CLIENT" as const,
  subscriptionStatus: { in: ACTIVE_STATUSES },
};

// How far back we look when computing each client's logging streak.
// 100 days covers anything we'd want to celebrate; anything older is too
// stale to matter for the "today" feeling.
const STREAK_WINDOW_DAYS = 100;

export async function getCollectiveStats(): Promise<CollectiveStats> {
  const weekStart = startOfIsoWeek(new Date());

  const [
    proteinAgg,
    stepsAgg,
    rosesSent,
    streakDaysCombined,
  ] = await Promise.all([
    prisma.dailyTotals.aggregate({
      where: {
        date: { gte: weekStart },
        user: ACTIVE_FILTER,
      },
      _sum: { totalProtein: true },
    }),
    prisma.dailyTotals.aggregate({
      where: {
        date: { gte: weekStart },
        user: ACTIVE_FILTER,
      },
      _sum: { totalSteps: true },
    }),
    prisma.cheerReaction.count({
      where: {
        createdAt: { gte: weekStart },
        // Both ends must be active so we don't count cheers TO canceled
        // accounts (they wouldn't see them anyway) or cheers FROM canceled
        // accounts (shouldn't be possible, but defense in depth).
        recipient: ACTIVE_FILTER,
        sender: ACTIVE_FILTER,
      },
    }),
    computeStreakDaysCombined(),
  ]);

  return {
    proteinGramsThisWeek: proteinAgg._sum.totalProtein ?? 0,
    stepsThisWeek: stepsAgg._sum.totalSteps ?? 0,
    rosesSentThisWeek: rosesSent,
    streakDaysCombined,
  };
}

/**
 * Sum every active client's current consecutive-day meal-logging streak.
 *
 * Strategy: one batched query pulling 100 days of meal logs for every
 * active client (date column only — we don't need food data), then walk
 * each client's day-set backward from today/yesterday to find their streak.
 *
 * "Streak ends today" is allowed if she's already logged today. Otherwise
 * we walk back from yesterday — same convention as src/lib/sean-messages.ts
 * so we don't punish someone for not having logged at 7 AM yet.
 */
async function computeStreakDaysCombined(): Promise<number> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - STREAK_WINDOW_DAYS);

  const rows = await prisma.mealLog.findMany({
    where: {
      createdAt: { gte: windowStart },
      user: ACTIVE_FILTER,
    },
    select: { userId: true, createdAt: true },
  });

  // Group by user → set of Central-day keys.
  const byUser = new Map<string, Set<string>>();
  for (const r of rows) {
    let set = byUser.get(r.userId);
    if (!set) {
      set = new Set<string>();
      byUser.set(r.userId, set);
    }
    set.add(centralDayKey(r.createdAt));
  }

  const todayKey = centralDayKey(new Date());
  // Walk back day-by-day for each client. The seed cursor is "today" if
  // she's already logged today, otherwise "yesterday" (so we don't break
  // her streak just because she hasn't logged before this query ran).
  let combined = 0;
  for (const set of Array.from(byUser.values())) {
    const startedToday = set.has(todayKey);
    const cursor = new Date();
    if (!startedToday) {
      cursor.setDate(cursor.getDate() - 1);
    }
    let streak = 0;
    for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
      const key = centralDayKey(cursor);
      if (!set.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    combined += streak;
  }
  return combined;
}

function centralDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
