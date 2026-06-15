import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard";
import { resolveTodayCalorieTarget } from "@/lib/calorie-banking";
import { getOrBuildDayPlan } from "@/lib/day-plan";
import { DayPlanCard } from "@/components/day-plan-card";

/**
 * /plan — the full day-plan experience. The home screen shows only the one
 * live decision; the deep view (swap, eating out, the whole mapped day, the
 * "how'd it sit?" moment) lives here, one tap from the focus card. Keeps the
 * home dead simple without losing any of the plan.
 */
export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  const data = await loadDashboardData(userId).catch(() => null);
  if (!data) redirect("/onboarding");

  const { userId: clientUserId, profile, todayTotals } = data;
  const banked = await resolveTodayCalorieTarget(clientUserId, profile);
  const dayPlan = await getOrBuildDayPlan(clientUserId, {
    calorieTarget: banked.target,
    caloriesEaten: todayTotals.calories,
    proteinFloor: profile.proteinFloor,
    proteinEaten: todayTotals.protein,
  }).catch(() => null);

  return (
    <main className="px-container-mobile max-w-2xl mx-auto py-8 pb-24 space-y-5">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 font-body text-label-md text-on-surface-variant active:opacity-70"
      >
        <span aria-hidden className="material-symbols-outlined text-[18px]">
          arrow_back
        </span>
        Home
      </Link>

      <header>
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Your day
        </p>
        <h1 className="font-display text-headline-lg text-charcoal">
          Already planned
        </h1>
      </header>

      {dayPlan ? (
        <DayPlanCard plan={dayPlan} />
      ) : (
        <p className="font-body text-body-md text-on-surface-variant py-10 text-center">
          Your plan will be here once your profile&apos;s set. Log a meal to get
          rolling.
        </p>
      )}
    </main>
  );
}
