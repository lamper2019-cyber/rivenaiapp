import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard";
import { resolveTodayCalorieTarget } from "@/lib/calorie-banking";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { NotificationOptIn } from "@/components/notification-opt-in";
import { TUTORIAL_DONE_STEP } from "@/lib/tutorial";
import { RefreshOnDayChange } from "@/components/refresh-on-day-change";
import { CoachMessageBadge } from "@/components/coach-message-badge";
import { getDailyWeighSnapshot, getSundayWrap } from "@/lib/daily-weigh-in";
import { getOrBuildDayPlan } from "@/lib/day-plan";
import { HomeFocus, type HomeHero } from "@/components/home-focus";
import { SundayWeightWrap } from "@/components/sunday-weight-wrap";
import { getMonthlyRecap, getYearlyRecap } from "@/lib/weight-recaps";
import { MonthlyRecapOverlay } from "@/components/monthly-recap-overlay";
import { YearlyRecapOverlay } from "@/components/yearly-recap-overlay";
import { SubscribedTracker } from "@/components/subscribed-tracker";

// Force a fresh server render on every request. Pairs with <RefreshOnDayChange />
// so the screen re-asks for its one focus the moment the Central day rolls over.
export const dynamic = "force-dynamic";

const STEP_GOAL = 10000;

/**
 * Home — radically simple. RIVEN shows ONE focus at a time (weigh → plan →
 * eat → done), breathing, with her numbers quiet underneath. The full day
 * plan lives at /plan; the community + the daily question live in the Circle.
 * This screen is the coach in her pocket, not a dashboard.
 */
export default async function DashboardPage() {
  const { userId } = auth();

  if (!userId) {
    return (
      <UnauthedPlaceholder>
        {isClerkConfigured
          ? "Please sign in."
          : "Add real Clerk keys to .env.local to view your dashboard."}
      </UnauthedPlaceholder>
    );
  }

  let data;
  try {
    data = await loadDashboardData(userId);
  } catch {
    return (
      <UnauthedPlaceholder>
        Database not connected.
      </UnauthedPlaceholder>
    );
  }

  // redirect() stays OUTSIDE try/catch (NEXT_REDIRECT gotcha).
  if (!data) redirect("/onboarding");
  if (data.profile.tutorialStep < TUTORIAL_DONE_STEP) redirect("/tutorial");

  const { userId: clientUserId, profile, todayTotals, recentCoachMessages } = data;

  const banked = await resolveTodayCalorieTarget(clientUserId, profile);
  const calorieTarget = banked.target;

  // The data the one focus card needs. Best-effort — a slow query never
  // blocks the screen; the focus just falls back to the next state.
  const [weigh, dayPlan, sundayWrap, monthlyRecap, yearlyRecap] =
    await Promise.all([
      getDailyWeighSnapshot(clientUserId).catch(() => null),
      getOrBuildDayPlan(clientUserId, {
        calorieTarget,
        caloriesEaten: todayTotals.calories,
        proteinFloor: profile.proteinFloor,
        proteinEaten: todayTotals.protein,
      }).catch(() => null),
      getSundayWrap(clientUserId).catch(() => null),
      getMonthlyRecap(clientUserId).catch(() => null),
      getYearlyRecap(clientUserId).catch(() => null),
    ]);

  const firstName = profile.name.split(/\s+/)[0] || "there";

  // The hero slot from the plan → the one meal decision the focus shows.
  const heroSlot = dayPlan?.slots.find((s) => s.state === "hero");
  const hero: HomeHero | null = heroSlot
    ? {
        slot: heroSlot.slot,
        name: heroSlot.meal.name,
        calories: heroSlot.meal.calories,
        protein: heroSlot.meal.protein,
        locked: heroSlot.locked,
        eaten: heroSlot.eaten,
      }
    : null;

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-10 space-y-6">
      <RefreshOnDayChange />

      <Suspense fallback={null}>
        <SubscribedTracker />
      </Suspense>

      {/* Full-screen weight wraps, longest horizon wins so they never stack. */}
      {yearlyRecap ? (
        <YearlyRecapOverlay recap={yearlyRecap} />
      ) : monthlyRecap ? (
        <MonthlyRecapOverlay recap={monthlyRecap} />
      ) : sundayWrap ? (
        <SundayWeightWrap wrap={sundayWrap} />
      ) : null}

      {/* Top-right "Message from RIVEN" pill. Self-hides with no history. */}
      <CoachMessageBadge messages={recentCoachMessages} />

      <header>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          {pickGreeting(firstName)}
        </h1>
      </header>

      {/* THE one focus + her quiet numbers. Everything else moved off home. */}
      <HomeFocus
        firstName={firstName}
        weighedToday={weigh?.weighedToday ?? false}
        prefillWeight={weigh?.prefillWeight ?? profile.currentWeight ?? profile.startWeight}
        goalWeight={weigh?.goalWeight ?? profile.goalWeight}
        hero={hero}
        voiceLine={dayPlan?.moment.line ?? "Your day's already mapped. All you do is eat it and log it."}
        numbers={{
          calories: todayTotals.calories,
          calorieTarget,
          protein: todayTotals.protein,
          proteinFloor: profile.proteinFloor,
          steps: todayTotals.steps,
          stepGoal: STEP_GOAL,
        }}
      />

      {/* Self-hide once installed / dismissed / push already on. */}
      <PwaInstallBanner />
      <NotificationOptIn
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
      />

      <div className="fixed top-[10%] right-[-10%] w-[35%] h-[35%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />

      <LogPill />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────── */

function pickGreeting(name: string): string {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10,
  );
  if (hour < 5) return `Up early, ${name}.`;
  if (hour < 12) return `Good morning, ${name}.`;
  if (hour < 18) return `Afternoon, ${name}.`;
  return `Evening, ${name}.`;
}

function UnauthedPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto pt-12">
      <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
        RIVEN
      </h1>
      <p className="font-body text-body-md text-on-surface-variant mt-3">{children}</p>
    </main>
  );
}

function LogPill() {
  return (
    <Link
      href="/log"
      aria-label="Log a meal"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)_+_84px)] left-3 right-3 z-40 inline-flex items-center justify-center gap-2 rounded-full py-3.5 font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-[0.98] transition-all max-w-2xl mx-auto bg-charcoal text-cream border border-charcoal"
    >
      <span className="material-symbols-outlined text-[20px] filled">mic</span>
      Log a meal
    </Link>
  );
}
