"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Triggers a soft router.refresh() in two scenarios:
 *
 *  1. The tab becomes visible after being hidden (the user backgrounded the
 *     PWA and just came back). Without this, a dashboard rendered yesterday
 *     evening would still show yesterday's totals when she opens the app
 *     in the morning — fresh server render only happens on navigation.
 *
 *  2. The Central-time calendar day silently rolls over while the page sits
 *     open. A polling interval checks every 60s; on date change it refreshes
 *     so meal counts reset to 0 right after midnight.
 *
 * router.refresh() is the App Router primitive for "re-run the server
 * component tree for this route without a hard reload." Cheap; doesn't
 * blow away client state, only re-fetches the server data.
 */
export function RefreshOnDayChange() {
  const router = useRouter();
  const lastCentralDayRef = useRef<string | null>(null);

  useEffect(() => {
    lastCentralDayRef.current = centralDayKey(new Date());

    function maybeRefresh() {
      const now = centralDayKey(new Date());
      if (lastCentralDayRef.current && now !== lastCentralDayRef.current) {
        lastCentralDayRef.current = now;
        router.refresh();
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        // Always refresh on tab focus — the page might be hours stale even
        // if the date hasn't rolled over (new meals from another device,
        // etc). Cheap network round-trip; better than stale numbers.
        router.refresh();
        lastCentralDayRef.current = centralDayKey(new Date());
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    const interval = setInterval(maybeRefresh, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
  }, [router]);

  return null;
}

function centralDayKey(d: Date): string {
  // Just need a stable string per Central-time calendar day. "en-CA" gives
  // YYYY-MM-DD which sorts and compares naturally.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
