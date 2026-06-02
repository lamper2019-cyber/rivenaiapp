"use client";

import { useEffect, useRef, useState } from "react";
import type { PulseEvent } from "@/lib/pulse";

/**
 * Spontaneous activity toast pop-ups. One event at a time, fades in,
 * holds, fades out, waits, picks the next event from the bank, repeats.
 *
 * Replaces the persistent "Right Now in RIVEN" PulseStrip per RIVEN —
 * the strip read like a leaderboard. This reads like the Shopify
 * "someone just ordered" trick: ambient proof that other women are in
 * here moving, surfacing one at a time so it stays alive without ever
 * taking over the screen.
 *
 * Cadence:
 *   - First toast appears ~5s after mount (let her settle on the page)
 *   - Visible for ~5s
 *   - Next toast picks a different event after a 60-120s gap
 *   - Loops as long as the dashboard is mounted
 *
 * The events array is the server-rendered pulse list (last 24h). When
 * we run out of unseen events, we loop back to the start — the
 * randomness in pickNext keeps it from feeling cyclical.
 */
export function PulseToasts({ events }: { events: PulseEvent[] }) {
  // Stable shuffled order — picked once per mount, so the same client
  // doesn't see the same toast twice in a row.
  const orderRef = useRef<PulseEvent[]>(shuffled(events));
  const cursorRef = useRef(0);

  // currentEvent is the event being shown right now; null between shows.
  const [currentEvent, setCurrentEvent] = useState<PulseEvent | null>(null);
  // Drives the opacity transition. visible=true → fade in, false → fade out.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // If no events at all (quiet morning), don't schedule anything.
    if (orderRef.current.length === 0) return;

    let cancelled = false;

    /** Pull the next event off the shuffled queue; reshuffle when we
     *  reach the end so the same client doesn't see identical order
     *  twice in a long session. */
    function pickNext(): PulseEvent | null {
      const order = orderRef.current;
      if (order.length === 0) return null;
      if (cursorRef.current >= order.length) {
        orderRef.current = shuffled(events);
        cursorRef.current = 0;
      }
      const e = orderRef.current[cursorRef.current];
      cursorRef.current += 1;
      return e;
    }

    function scheduleNext(delayMs: number) {
      window.setTimeout(() => {
        if (cancelled) return;
        const e = pickNext();
        if (!e) return;
        setCurrentEvent(e);
        // Tiny defer so React commits the new event mounted at
        // opacity-0 before flipping visible=true (otherwise the
        // transition skips).
        window.setTimeout(() => {
          if (!cancelled) setVisible(true);
        }, 30);
        // Hold visible, then fade out + unmount + schedule next.
        window.setTimeout(() => {
          if (cancelled) return;
          setVisible(false);
        }, 5_000);
        window.setTimeout(() => {
          if (cancelled) return;
          setCurrentEvent(null);
          // Next toast in 60-120s.
          scheduleNext(60_000 + Math.random() * 60_000);
        }, 5_600);
      }, delayMs);
    }

    // First toast lands ~5s after dashboard load — gives her a beat
    // to take in the page before anything pops.
    scheduleNext(5_000);

    return () => {
      cancelled = true;
    };
    // events.length is enough for re-init; events identity doesn't
    // need to invalidate the queue (the shuffled snapshot is captured).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  if (!currentEvent) return null;

  return (
    <div
      // Top-center, below any header chrome. Fixed so it stays in view
      // as she scrolls. High z-index but below the cheer ceremony (z-50).
      aria-live="polite"
      className={`fixed left-1/2 -translate-x-1/2 top-[max(env(safe-area-inset-top),12px)] z-40 max-w-[min(92vw,28rem)] transition-all duration-500 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-2 pointer-events-none"
      }`}
    >
      <div
        role="status"
        className="flex items-center gap-3 rounded-full bg-cream/95 backdrop-blur-md border border-gold/50 shadow-elevation-2 pl-3 pr-4 py-2"
      >
        <span
          className="shrink-0 w-1.5 h-1.5 rounded-full bg-gold riven-pulse-soft"
          aria-hidden
        />
        <p className="font-body text-label-md text-charcoal leading-tight truncate">
          {currentEvent.copy}
        </p>
      </div>
    </div>
  );
}

/** Fisher-Yates shuffle, pure function, returns a new array. */
function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
