import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";

export type MealPacingTier =
  | "early" // before 11am Central — too early to nudge
  | "midday" // 11am–2pm — first nudge if she's at 0 cal
  | "afternoon" // 2pm–6pm — should be ~half-way fed by now
  | "evening" // 6pm–10pm — most of the day's food should be in
  | "late"; // 10pm+ — don't pressure at bedtime

export type MealPacing = {
  isBehind: boolean;
  tier: MealPacingTier;
  caloriesToday: number;
  cutCalories: number;
};

/**
 * Returns whether the client is meaningfully behind on logging for the time
 * of day, plus a tier label so dashboards/cards can pick copy. "Behind" is
 * deliberately conservative — we don't nag before 11am or after 10pm
 * (Central), and the thresholds rise as the day goes on so a slow morning
 * doesn't trigger a red flag at 11:01am.
 *
 * Reads Profile.cutCalories and today's DailyTotals row in two queries; the
 * caller is expected to gate this on auth.
 */
export const getMealPacing = cache(async (userId: string): Promise<MealPacing | null> => {
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, profile: { select: { cutCalories: true } } },
  });
  if (!user?.profile) return null;

  // Canonical Central-time-day key. Writes (log/actions.ts) use the same
  // helper so the values match for upsert/lookup.
  const today = startOfCentralDay();
  const totals = await prisma.dailyTotals.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
    select: { totalCalories: true },
  });

  const caloriesToday = totals?.totalCalories ?? 0;
  const cutCalories = user.profile.cutCalories;
  const tier = tierForNow(new Date());
  const isBehind = computeIsBehind(tier, caloriesToday, cutCalories);

  return { isBehind, tier, caloriesToday, cutCalories };
});

function tierForNow(now: Date): MealPacingTier {
  // Central-time hour. America/Chicago shifts with DST — Intl handles it.
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).format(now);
  const hour = parseInt(hourStr, 10);
  if (hour < 11) return "early";
  if (hour < 14) return "midday";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "late";
}

function computeIsBehind(
  tier: MealPacingTier,
  caloriesToday: number,
  cutCalories: number,
): boolean {
  if (cutCalories <= 0) return false;
  const pct = caloriesToday / cutCalories;
  switch (tier) {
    case "early":
      return false;
    case "midday":
      return pct < 0.2;
    case "afternoon":
      return pct < 0.4;
    case "evening":
      return pct < 0.65;
    case "late":
      return false;
  }
}

