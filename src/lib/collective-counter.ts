import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import { startOfIsoWeek } from "@/lib/week";

/**
 * Aggregate "RIVEN women, together" stats for the dashboard.
 *
 * Reframes a small community as a powerful collective:
 *   "1,247 meals logged this week"
 *   "47 protein goals hit today"
 *   "312 lbs lost combined"
 *
 * Single pass: all four stats batched in one Promise.all. Limited to
 * CLIENT users with active/trialing/comped status so canceled accounts
 * don't pad the totals.
 */

export type CollectiveStats = {
  mealsThisWeek: number;
  proteinGoalsToday: number;
  poundsLostCombined: number;
  monthlyStepsK: number; // shown as "X.Xk" — thousands
};

const ACTIVE_STATUSES = ["trialing", "active", "comped"];
const ACTIVE_FILTER = {
  role: "CLIENT" as const,
  subscriptionStatus: { in: ACTIVE_STATUSES },
};

export async function getCollectiveStats(): Promise<CollectiveStats> {
  const weekStart = startOfIsoWeek(new Date());
  const today = startOfCentralDay();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [
    mealsThisWeek,
    proteinHitToday,
    profilesForLoss,
    stepsLast30Days,
  ] = await Promise.all([
    prisma.mealLog.count({
      where: {
        createdAt: { gte: weekStart },
        user: ACTIVE_FILTER,
      },
    }),
    // Clients whose total protein today is at or above their floor.
    // Two queries: pull today's totals joined with active profile, count
    // where totalProtein >= profile.proteinFloor.
    prisma.dailyTotals.findMany({
      where: {
        date: today,
        user: { ...ACTIVE_FILTER, profile: { isNot: null } },
      },
      select: {
        totalProtein: true,
        user: { select: { profile: { select: { proteinFloor: true } } } },
      },
    }),
    prisma.profile.findMany({
      where: {
        user: ACTIVE_FILTER,
      },
      select: {
        startWeight: true,
        currentWeight: true,
      },
    }),
    prisma.dailyTotals.aggregate({
      where: {
        date: { gte: monthAgo, lt: tomorrow },
        user: ACTIVE_FILTER,
      },
      _sum: { totalSteps: true },
    }),
  ]);

  const proteinGoalsToday = proteinHitToday.filter((row) => {
    const floor = row.user.profile?.proteinFloor ?? 0;
    return floor > 0 && row.totalProtein >= floor;
  }).length;

  const poundsLostCombined = profilesForLoss.reduce((acc, p) => {
    const delta = p.startWeight - p.currentWeight;
    return delta > 0 ? acc + delta : acc;
  }, 0);

  const totalSteps = stepsLast30Days._sum.totalSteps ?? 0;
  const monthlyStepsK = totalSteps / 1000;

  return {
    mealsThisWeek,
    proteinGoalsToday,
    // Round to whole lbs — half-pound precision reads weird in a "combined"
    // total.
    poundsLostCombined: Math.round(poundsLostCombined),
    monthlyStepsK: Math.round(monthlyStepsK * 10) / 10,
  };
}
