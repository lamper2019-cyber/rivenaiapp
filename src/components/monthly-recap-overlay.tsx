"use client";

import { useEffect, useState } from "react";
import type { MonthlyRecap } from "@/lib/weight-recaps";

/**
 * Monthly recap — full-screen "staircase" of monthly averages (where she was
 * each month from the start). Shows once per calendar month via a localStorage
 * key (server only returns data once she has ≥2 months logged).
 */
export function MonthlyRecapOverlay({ recap }: { recap: MonthlyRecap }) {
  const storageKey = `riven_monthly_recap_${recap.periodKey}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(storageKey)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  const min = Math.min(...recap.bars.map((b) => b.avg));
  const max = Math.max(...recap.bars.map((b) => b.avg));
  const span = max - min || 1;
  const down = recap.totalDelta > 0;

  return (
    <div className="fixed inset-0 z-50 bg-cream flex flex-col px-container-mobile py-12 overflow-y-auto riven-rise-in">
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        Month {recap.monthIndex}
      </p>
      <h1 className="font-display text-display-md text-charcoal mt-1 mb-8 leading-tight">
        Where you&apos;ve been
      </h1>

      {/* The staircase — one bar per month, length scaled to its average so the
          bars shrink as the weight comes down. */}
      <div className="space-y-3 flex-1">
        {recap.bars.map((b, i) => {
          const pct = 30 + ((b.avg - min) / span) * 70; // 30–100%
          const isLatest = i === recap.bars.length - 1;
          return (
            <div key={`${b.label}-${i}`} className="flex items-center gap-3">
              <span className="w-10 shrink-0 font-body text-label-md text-on-surface-variant">
                {b.label}
              </span>
              <div className="flex-1 h-9 rounded-lg bg-charcoal/[0.05] overflow-hidden">
                <div
                  className={`h-full rounded-lg flex items-center justify-end pr-3 ${
                    isLatest ? "bg-sage" : "bg-gold/70"
                  }`}
                  style={{ width: `${pct}%` }}
                >
                  <span className="font-display text-body-md text-cream">{b.avg.toFixed(1)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <p className="font-display text-display-sm text-charcoal">
          {down ? "▼" : "▲"} {Math.abs(recap.totalDelta).toFixed(1)} lb
          <span className="font-body text-body-md text-on-surface-variant ml-2">since you started</span>
        </p>
        <p className="font-body text-body-md text-on-surface-variant mt-3 max-w-sm mx-auto">
          {down
            ? `${recap.lbsToGoal > 0 ? `${recap.lbsToGoal.toFixed(1)} lb to your goal. ` : "You're at goal. "}This is what steady looks like.`
            : "The trend ticked up — that's data, not a problem. We clamp down a little this month."}
        </p>
      </div>

      <button
        type="button"
        onClick={dismiss}
        className="mt-8 mx-auto bg-charcoal text-cream py-4 px-12 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 transition-all"
      >
        Lock it in
      </button>
      <p className="font-display text-headline-sm text-gold mt-6 text-center">Steady wins.</p>
    </div>
  );
}
