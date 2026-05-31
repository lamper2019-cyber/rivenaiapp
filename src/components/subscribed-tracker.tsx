"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { captureEvent } from "@/components/posthog";

/**
 * Fires the PostHog "subscription_started" event — the bottom of the sales
 * funnel — when a fresh subscriber lands on /dashboard?subscribed=1, which
 * is the success_url Stripe Checkout redirects to (see pricing/actions.ts).
 *
 * By the time this runs PostHog is already identified (PostHogIdentify in
 * the clerk layout), so the event lands on the same person as their
 * anonymous landing → quiz → VSL → pricing journey and the funnel connects
 * end to end.
 *
 * After firing we strip the ?subscribed=1 param so a manual refresh of
 * /dashboard can't double-count. The ref guards against React strict-mode's
 * double-invoke in dev.
 *
 * Must be wrapped in <Suspense> at the mount site — useSearchParams()
 * requires it.
 */
export function SubscribedTracker() {
  const router = useRouter();
  const params = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (params.get("subscribed") !== "1") return;
    fired.current = true;
    void captureEvent("subscription_started", { plan: "monthly_50" });
    // Clean the URL so refreshing /dashboard doesn't re-fire the event.
    router.replace("/dashboard");
  }, [params, router]);

  return null;
}
