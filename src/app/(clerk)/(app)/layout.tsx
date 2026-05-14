import { redirect } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { auth, isClerkConfigured } from "@/lib/auth";
import { ensureUserExists, type BootstrappedUser } from "@/lib/user-bootstrap";
import { getMealPacing } from "@/lib/meal-pacing";
import { hasActiveSubscription, isStripeConfigured } from "@/lib/stripe";

/**
 * Protected client routes. Bootstraps the User row, then redirects coaches
 * away to /coach so Sean never sees the client-side dashboard/nav by accident.
 *
 * `redirect()` throws a NEXT_REDIRECT control-flow error — the call MUST sit
 * outside try/catch or the catch swallows the redirect and the layout renders
 * the wrong nav.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = auth();

  let user: BootstrappedUser | null = null;
  if (userId && isClerkConfigured) {
    try {
      user = await ensureUserExists(userId);
    } catch {
      /* DB unavailable — render the inner page's placeholder */
    }
  }
  if (user?.role === "COACH") redirect("/coach");

  // Paywall — clients need an active subscription, trial, or comped status
  // to access the app. Coaches bypass (already redirected above). Skips
  // the gate when Stripe isn't configured (e.g. earliest local dev) so the
  // app still boots without billing wired up. The redirect MUST stay
  // outside any try/catch — see CLAUDE.md gotcha #1.
  if (
    isStripeConfigured &&
    user &&
    user.role === "CLIENT" &&
    !hasActiveSubscription(user.subscriptionStatus)
  ) {
    redirect("/pricing");
  }

  // Ambient signal for the bottom nav: gold dot on the Log icon when the
  // client is meaningfully behind on calories for the time of day. Best-
  // effort — if the query fails, the nav just renders without the dot.
  let mealsBehind = false;
  if (user && userId) {
    try {
      const pacing = await getMealPacing(userId);
      mealsBehind = pacing?.isBehind ?? false;
    } catch {
      /* swallow — nav still renders */
    }
  }

  return (
    <div className="relative min-h-screen pt-safe pb-28">
      {children}
      <BottomNav mealsBehind={mealsBehind} />
    </div>
  );
}
