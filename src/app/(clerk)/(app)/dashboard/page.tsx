import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard";
import { TUTORIAL_DONE_STEP } from "@/lib/tutorial";
import { RefreshOnDayChange } from "@/components/refresh-on-day-change";
import { getSundayWrap } from "@/lib/daily-weigh-in";
import { getMonthlyRecap, getYearlyRecap } from "@/lib/weight-recaps";
import { SundayWeightWrap } from "@/components/sunday-weight-wrap";
import { MonthlyRecapOverlay } from "@/components/monthly-recap-overlay";
import { YearlyRecapOverlay } from "@/components/yearly-recap-overlay";
import { SubscribedTracker } from "@/components/subscribed-tracker";
import { RivenHome } from "@/components/riven-home";

// Force a fresh server render each request. Pairs with <RefreshOnDayChange />.
export const dynamic = "force-dynamic";

/**
 * Home — RIVEN as a presence you talk to (the orb). She opens by asking your
 * weight, you log food by telling her, the macro ring moves in real time, and
 * the day's engine (plan/macros/adjustment) is spoken through her, not shown
 * as cards. Spec: docs/design/riven-orb-mockup.html + ...conversations.html.
 *
 * The whole screen is dark — the orb is the light. Weight-wrap overlays
 * (Sunday/monthly/yearly) still fire on top as celebratory full-screens.
 */
export default async function DashboardPage() {
  const { userId } = auth();
  if (!userId) {
    return (
      <main className="min-h-[100dvh] bg-charcoal px-container-mobile pt-16 text-cream">
        <p className="font-display text-headline-lg">RIVEN</p>
        <p className="font-body text-body-md text-cream/60 mt-3">
          {isClerkConfigured ? "Please sign in." : "Add Clerk keys to .env.local."}
        </p>
      </main>
    );
  }

  let data;
  try {
    data = await loadDashboardData(userId);
  } catch {
    return (
      <main className="min-h-[100dvh] bg-charcoal px-container-mobile pt-16 text-cream">
        <p className="font-body text-body-md">Database not connected.</p>
      </main>
    );
  }

  // redirect() stays OUTSIDE try/catch (NEXT_REDIRECT gotcha).
  if (!data) redirect("/onboarding");
  if (data.profile.tutorialStep < TUTORIAL_DONE_STEP) redirect("/tutorial");

  const { userId: clientUserId, profile } = data;
  const firstName = profile.name.split(/\s+/)[0] || "there";

  const [sundayWrap, monthlyRecap, yearlyRecap] = await Promise.all([
    getSundayWrap(clientUserId).catch(() => null),
    getMonthlyRecap(clientUserId).catch(() => null),
    getYearlyRecap(clientUserId).catch(() => null),
  ]);

  return (
    <main
      className="relative px-container-mobile pt-12 pb-28"
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(120% 90% at 50% 0%, #211e1a 0%, #161513 55%, #100f0d 100%)",
      }}
    >
      <RefreshOnDayChange />
      <Suspense fallback={null}>
        <SubscribedTracker />
      </Suspense>

      {/* Celebratory full-screen wraps — longest horizon wins. */}
      {yearlyRecap ? (
        <YearlyRecapOverlay recap={yearlyRecap} />
      ) : monthlyRecap ? (
        <MonthlyRecapOverlay recap={monthlyRecap} />
      ) : sundayWrap ? (
        <SundayWeightWrap wrap={sundayWrap} />
      ) : null}

      <RivenHome initialFirstName={firstName} />
    </main>
  );
}
