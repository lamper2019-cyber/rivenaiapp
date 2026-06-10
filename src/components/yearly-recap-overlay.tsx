"use client";

import { useEffect, useState } from "react";
import type { YearlyRecap } from "@/lib/weight-recaps";

/**
 * Yearly recap — the full-year story: the line over 12 months, her longest log
 * streak, and milestones crossed. Full-screen, once a year (localStorage).
 */
export function YearlyRecapOverlay({ recap }: { recap: YearlyRecap }) {
  const storageKey = `riven_yearly_recap_${recap.periodKey}`;
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

  const down = recap.totalDelta > 0;

  return (
    <div className="fixed inset-0 z-50 bg-charcoal text-cream flex flex-col items-center justify-center px-container-mobile py-12 text-center overflow-y-auto riven-rise-in">
      <p className="font-body text-label-md tracking-widest uppercase text-gold mb-6">
        Your year
      </p>

      <p className="font-display text-display-lg leading-none">
        {down ? "▼" : "▲"} {Math.abs(recap.totalDelta).toFixed(1)}
        <span className="font-body text-headline-sm text-cream/70 ml-2">lb</span>
      </p>
      <p className="font-body text-body-md text-cream/70 mt-2">
        {recap.startAvg.toFixed(1)} → {recap.currentAvg.toFixed(1)} lb
      </p>

      {/* Full-year line */}
      <YearLine series={recap.series} />

      <div className="flex gap-8 mt-8">
        <Stat value={`${recap.logStreak}`} label="day log streak" />
        <Stat value={`${recap.milestones}`} label="milestones crossed" />
      </div>

      <p className="font-body text-body-md text-cream/80 max-w-sm mt-8 leading-relaxed">
        {down
          ? "A whole year, steady. Not a crash, not a rebound — a line that went where you pointed it."
          : "A whole year of showing up. The number's a story, not a verdict — and you're still writing it."}
      </p>

      <button
        type="button"
        onClick={dismiss}
        className="mt-8 bg-cream text-charcoal py-4 px-12 rounded-full font-body text-label-md tracking-widest uppercase active:scale-95 transition-all"
      >
        Lock it in
      </button>
      <p className="font-display text-headline-sm text-gold mt-6">Steady wins.</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-headline-md text-cream">{value}</p>
      <p className="font-body text-label-sm text-cream/60">{label}</p>
    </div>
  );
}

function YearLine({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const W = 300, H = 90, pad = 10;
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const path = series
    .map((v, i) => {
      const x = pad + (i / (series.length - 1)) * (W - pad * 2);
      const y = pad + (1 - (v - min) / span) * (H - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-72 h-auto mt-8" role="img" aria-label="Your year trend">
      <path d={path} fill="none" stroke="currentColor" className="text-gold" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
