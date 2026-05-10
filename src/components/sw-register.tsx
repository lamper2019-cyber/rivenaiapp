"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in both dev and prod. The service worker is required for
 * Web Push to work, so we can't gate it on NODE_ENV anymore. Caching strategy
 * inside sw.js is network-first for navigations, which is safe in dev.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Silent fail — PWA + push are progressive enhancements. */
    });
  }, []);

  return null;
}
