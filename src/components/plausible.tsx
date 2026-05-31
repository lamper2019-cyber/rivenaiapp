"use client";

import { useEffect } from "react";

/**
 * Plausible Analytics — privacy-friendly, cookie-less, GDPR/CCPA compliant.
 *
 * Drops into the root layout once. Auto-captures pageviews including
 * Next.js client-side route changes (the tracker patches `history.pushState`
 * so /dashboard → /log navigations get logged without us listening to the
 * router). Outbound link clicks are also tracked.
 *
 * Domain comes from `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`. When the env var is
 * absent — local dev, preview deploys, forks without the secret — the
 * component is a silent no-op so nothing leaks to the wrong dashboard.
 *
 * The tracker package touches `location` at module load. To keep the
 * Vercel prerender (`/`, `/quiz`, `/quiz/vsl`, `/_not-found`) happy, we
 * dynamic-import inside useEffect — the import resolves only on the
 * client, never during server build.
 *
 * Custom events: import `trackEvent` from this file and call it from any
 * client component. E.g., on the pricing CTA tap:
 *   `trackEvent("Pricing CTA tap", { tier: "$50/mo" })`
 *
 * See https://plausible.io/docs/custom-event-goals for setting up goals
 * matching these event names in the Plausible dashboard.
 */
export function Plausible() {
  useEffect(() => {
    const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
    if (!domain) return;
    void (async () => {
      try {
        const mod = await import("@plausible-analytics/tracker");
        mod.init({
          domain,
          // SPA-style route changes get tracked automatically because the
          // tracker patches pushState. No router listener needed.
          autoCapturePageviews: true,
          // Tap-through to social, the freebie, etc. — shows up in the
          // dashboard's outbound-links report.
          outboundLinks: true,
        });
      } catch {
        /* tracker load failure should never break the app */
      }
    })();
  }, []);

  return null;
}

/**
 * Type-safe wrapper around Plausible's `track()` so call sites stay
 * tidy and so any future swap (e.g., add a second analytics sink) only
 * touches this one helper.
 *
 * Coerces props to strings at the boundary because Plausible's
 * CustomProperties type rejects numbers and booleans.
 *
 * The async import is cheap on the second+ call thanks to module
 * caching — first call after init pays one network round trip, all
 * subsequent calls are synchronous module lookups.
 */
export async function trackEvent(
  eventName: string,
  props?: Record<string, string | number | boolean>,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN) return;
  try {
    const mod = await import("@plausible-analytics/tracker");
    const stringProps: Record<string, string> | undefined = props
      ? Object.fromEntries(
          Object.entries(props).map(([k, v]) => [k, String(v)]),
        )
      : undefined;
    mod.track(eventName, stringProps ? { props: stringProps } : {});
  } catch {
    /* tracker errors should never break the app */
  }
}
