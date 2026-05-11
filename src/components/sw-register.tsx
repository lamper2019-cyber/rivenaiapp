"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in both dev and prod. The service worker is required for
 * Web Push to work, so we can't gate it on NODE_ENV anymore. Caching strategy
 * inside sw.js is network-first for navigations, which is safe in dev.
 *
 * Registration is deferred to requestIdleCallback (fallback: setTimeout)
 * so it never competes with the critical render path. The user gets first
 * paint sooner; SW becomes active a few hundred ms later, which is fine
 * because the SW only matters for repeat visits and push notifications.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Silent fail — PWA + push are progressive enhancements. */
      });
    };

    const idle =
      "requestIdleCallback" in window
        ? (cb: () => void) =>
            (
              window as Window & {
                requestIdleCallback: (
                  cb: () => void,
                  opts?: { timeout: number }
                ) => number;
              }
            ).requestIdleCallback(cb, { timeout: 4000 })
        : (cb: () => void) => window.setTimeout(cb, 2000);

    const handle = idle(register);
    return () => {
      if (
        typeof handle === "number" &&
        "cancelIdleCallback" in window &&
        typeof (window as Window & { cancelIdleCallback?: (h: number) => void })
          .cancelIdleCallback === "function"
      ) {
        (
          window as Window & { cancelIdleCallback: (h: number) => void }
        ).cancelIdleCallback(handle);
      } else if (typeof handle === "number") {
        window.clearTimeout(handle);
      }
    };
  }, []);

  return null;
}
