import { prisma } from "@/lib/prisma";
import { startOfIsoWeek } from "@/lib/week";

/**
 * "Together · this week" — the village card on /dashboard.
 *
 * As of the first-names-everywhere refactor, this returns NAMED
 * contributors per stat instead of pure aggregates. Faceless numbers
 * read like a leaderboard; named contributors read like a room.
 *
 *   - protein:        first names who logged any protein this week
 *                     + the total grams for the room
 *   - streakDays:     first names with active streaks + combined day count
 *   - roses:          first names who sent or received cheers this week +
 *                     the rose count
 *   - steps:          first names who walked any steps this week +
 *                     combined step total
 *
 * Privacy: first names only (no full names). Restricted to active
 * clients (trialing/active/comped). The viewer's own name is INCLUDED
 * in the lists so she sees herself in the room.
 */

export type CollectiveStats = {
  proteinGramsThisWeek: number;
  proteinNames: string[];
  streakDaysCombined: number;
  streakNames: string[];
  rosesSentThisWeek: number;
  roseNames: string[];
  stepsThisWeek: number;
  stepsNames: string[];
};

const ACTIVE_STATUSES = ["trialing", "active", "comped"];
const ACTIVE_FILTER = {
  role: "CLIENT" as const,
  subscriptionStatus: { in: ACTIVE_STATUSES },
};

// How far back we look when computing each client's logging streak.
const STREAK_WINDOW_DAYS = 100;

export async function getCollectiveStats(): Promise<CollectiveStats> {
  const weekStart = startOfIsoWeek(new Date());

  const [
    proteinAgg,
    proteinContributors,
    stepsAgg,
    stepsContributors,
    roseRows,
    streakResult,
  ] = await Promise.all([
    prisma.dailyTotals.aggregate({
      where: { date: { gte: weekStart }, user: ACTIVE_FILTER },
      _sum: { totalProtein: true },
    }),
    prisma.dailyTotals.findMany({
      where: {
        date: { gte: weekStart },
        user: ACTIVE_FILTER,
        totalProtein: { gt: 0 },
      },
      select: {
        userId: true,
        user: { select: { profile: { select: { name: true } } } },
      },
      // We dedupe by userId in JS below.
      take: 200,
    }),
    prisma.dailyTotals.aggregate({
      where: { date: { gte: weekStart }, user: ACTIVE_FILTER },
      _sum: { totalSteps: true },
    }),
    prisma.dailyTotals.findMany({
      where: {
        date: { gte: weekStart },
        user: ACTIVE_FILTER,
        totalSteps: { gt: 0 },
      },
      select: {
        userId: true,
        user: { select: { profile: { select: { name: true } } } },
      },
      take: 200,
    }),
    prisma.cheerReaction.findMany({
      where: {
        createdAt: { gte: weekStart },
        recipient: ACTIVE_FILTER,
        sender: ACTIVE_FILTER,
      },
      select: {
        recipient: { select: { profile: { select: { name: true } } } },
        sender: { select: { profile: { select: { name: true } } } },
      },
    }),
    computeStreakDaysCombinedWithNames(),
  ]);

  const proteinNames = dedupeFirstNames(proteinContributors);
  const stepsNames = dedupeFirstNames(stepsContributors);

  // Roses: pool first names of all senders + recipients for the week.
  const roseNameSet = new Set<string>();
  for (const r of roseRows) {
    const sender = firstNameOf(r.sender?.profile?.name);
    if (sender) roseNameSet.add(sender);
    const recipient = firstNameOf(r.recipient?.profile?.name);
    if (recipient) roseNameSet.add(recipient);
  }

  return {
    proteinGramsThisWeek: proteinAgg._sum.totalProtein ?? 0,
    proteinNames,
    stepsThisWeek: stepsAgg._sum.totalSteps ?? 0,
    stepsNames,
    rosesSentThisWeek: roseRows.length,
    roseNames: Array.from(roseNameSet),
    streakDaysCombined: streakResult.combined,
    streakNames: streakResult.names,
  };
}

function dedupeFirstNames(
  rows: Array<{
    userId: string;
    user: { profile: { name: string } | null };
  }>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    const name = firstNameOf(r.user?.profile?.name);
    if (name) out.push(name);
  }
  return out;
}

function firstNameOf(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return first || null;
}

/**
 * Sum every active client's current consecutive-day meal-logging streak
 * AND return the first names of clients with any active streak.
 */
async function computeStreakDaysCombinedWithNames(): Promise<{
  combined: number;
  names: string[];
}> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - STREAK_WINDOW_DAYS);

  const rows = await prisma.mealLog.findMany({
    where: { createdAt: { gte: windowStart }, user: ACTIVE_FILTER },
    select: {
      userId: true,
      createdAt: true,
      user: { select: { profile: { select: { name: true } } } },
    },
  });

  const byUser = new Map<
    string,
    { days: Set<string>; firstName: string | null }
  >();
  for (const r of rows) {
    let bucket = byUser.get(r.userId);
    if (!bucket) {
      bucket = {
        days: new Set<string>(),
        firstName: firstNameOf(r.user?.profile?.name),
      };
      byUser.set(r.userId, bucket);
    }
    bucket.days.add(centralDayKey(r.createdAt));
  }

  const todayKey = centralDayKey(new Date());
  let combined = 0;
  const names: string[] = [];
  for (const bucket of Array.from(byUser.values())) {
    const startedToday = bucket.days.has(todayKey);
    const cursor = new Date();
    if (!startedToday) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
      const key = centralDayKey(cursor);
      if (!bucket.days.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (streak > 0) {
      combined += streak;
      if (bucket.firstName) names.push(bucket.firstName);
    }
  }
  return { combined, names };
}

function centralDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
