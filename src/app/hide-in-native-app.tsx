"use client";

import { useEffect, useState } from "react";

/**
 * Hides its children when running inside the RIVEN iOS app (the "Netflix model":
 * account creation + payment happen on the web, so in-app signup CTAs are
 * hidden — the app is sign-in only). Detected via the `RIVENApp` tag in the
 * WebView user-agent set in capacitor.config.ts.
 *
 * Kept client-side on purpose: the welcome page (/) is statically edge-cached
 * for fast global TTFB, and reading headers() there would force dynamic
 * rendering and kill that cache (see CLAUDE.md gotcha #5). So we render the CTA
 * for everyone server-side, then drop it on the client only when we detect the
 * native app. Web visitors never see a flicker; in-app users briefly see it
 * before it's removed, which is an acceptable trade for keeping / cacheable.
 */
export function HideInNativeApp({ children }: { children: React.ReactNode }) {
  const [isNativeApp, setIsNativeApp] = useState(false);

  useEffect(() => {
    if (
      typeof navigator !== "undefined" &&
      navigator.userAgent.includes("RIVENApp")
    ) {
      setIsNativeApp(true);
    }
  }, []);

  if (isNativeApp) return null;
  return <>{children}</>;
}
