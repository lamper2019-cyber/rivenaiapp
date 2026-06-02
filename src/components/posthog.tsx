"use client";

import { useEffect } from "react";

// Module-level guard so we don't double-init across HMR refreshes or
// strict-mode double-render. `posthog.init` will warn but not crash on
// re-init; this just keeps the console quiet.
let posthogInitialized = false;

/**
 * PostHog — product analytics + session replay + feature flags.
 *
 * Lives next to Plausible (Plausible = lightweight privacy-first
 * aggregate views; PostHog = deep user-level analysis, replays,
 * funnels). Both can run together; they don't fight.
 *
 * Env-gated on `NEXT_PUBLIC_POSTHOG_KEY` so dev/preview/forks no-op.
 * Optionally accepts `NEXT_PUBLIC_POSTHOG_HOST` to point at the EU
 * region or a self-hosted proxy. Defaults to us.i.posthog.com.
 *
 * Pageviews:
 *   `capture_pageview: "history_change"` lets posthog-js auto-track
 *   client-side Next.js navigations without a router listener. The
 *   library patches history.pushState the same way Plausible does.
 *
 * Person profiles:
 *   `identified_only` — anonymous visitors don't get profile rows
 *   until we call posthog.identify(userId). Saves quota; matches
 *   how the funnel actually works (identity = paid client after
 *   Clerk sign-in).
 *
 * Why dynamic import: posthog-js touches `window` and `document` at
 * module load. Static import breaks the Vercel prerender on /, /quiz,
 * /quiz/vsl, /_not-found. Same fix we used for Plausible.
 */
export function PostHogInit() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    void (async () => {
      try {
        if (posthogInitialized) return;
        const { default: posthog } = await import("posthog-js");
        posthog.init(key, {
          api_host:
            process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
          // History-change handles Next.js App Router client-side nav
          // automatically — no usePathname listener needed.
          capture_pageview: "history_change",
          // Anonymous visitors stay anonymous until we identify them
          // (PostHogIdentify in the clerk layout calls identify() on
          // sign-in, which also merges the anonymous pre-signup journey
          // — landing → quiz → VSL → pricing — onto the real person so
          // the sales funnel connects across the sign-up boundary).
          person_profiles: "identified_only",
          // Session replay is ON by default — RIVEN wants to watch real
          // sessions of people moving through the quiz/pricing. If it
          // ever eats too much monthly quota, set NEXT_PUBLIC_POSTHOG_REPLAY=0
          // to kill it without a code change.
          disable_session_recording:
            process.env.NEXT_PUBLIC_POSTHOG_REPLAY === "0",
          session_recording: {
            // Never record what someone types — weights, food notes,
            // emails, anything in an input or textarea is masked to dots.
            // We still capture taps, scrolls, and navigation, which is
            // all the funnel/UX analysis actually needs.
            maskAllInputs: true,
          },
        });
        posthogInitialized = true;
      } catch {
        /* loader failure should never break the app */
      }
    })();
  }, []);

  return null;
}

/**
 * Identify the current user on PostHog. Call this after Clerk hands
 * us a real signed-in user — typically from a client component that
 * has access to `useUser()`.
 *
 * Wire-up example for later (don't add until we want it):
 *   const { user } = useUser();
 *   useEffect(() => {
 *     if (user) {
 *       identifyUser(user.id, {
 *         email: user.primaryEmailAddress?.emailAddress,
 *         name: user.fullName,
 *       });
 *     }
 *   }, [user]);
 */
export async function identifyUser(
  distinctId: string,
  props?: Record<string, string | number | boolean>,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.identify(distinctId, props);
  } catch {
    /* swallow */
  }
}

/**
 * Track a custom event in PostHog. Parallel to Plausible's
 * `trackEvent` — call both from any user-action handler that matters
 * (signup, purchase, key feature use). They don't conflict.
 */
export async function captureEvent(
  eventName: string,
  props?: Record<string, string | number | boolean>,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.capture(eventName, props);
  } catch {
    /* swallow */
  }
}

/**
 * Reset PostHog identity. Call on sign-out so the next visitor on
 * the same device doesn't get bucketed under the previous user.
 */
export async function resetPostHog(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.reset();
  } catch {
    /* swallow */
  }
}
