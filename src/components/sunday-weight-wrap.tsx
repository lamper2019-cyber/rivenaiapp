"use client";

import { useEffect, useState } from "react";
import type { SundayWrap } from "@/lib/daily-weigh-in";

/**
 * Sunday weekly wrap — full-screen, once a week. Shows her 7-day average + the
 * trend line going (hopefully) down. The server only returns wrap data on
 * Sundays; this component handles the "show once" via a per-week localStorage
 * key so it doesn't replay every time she opens the app on Sunday.
 *
 * Mirrors the rose-ceremony overlay pattern: fixed full-screen wash on top of
 * the dashboard, body scroll locked, one calm dismiss button.
 */
export function SundayWeightWrap({ wrap }: { wrap: SundayWrap }) {
  // Per-week key = today's Central date (it's always a Sunday when shown).
  const weekKey =
    "riven_sunday_wrap_" +
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  // Hidden until we've checked localStorage, so a dismissed wrap never flashes.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(weekKey)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [weekKey]);

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
      window.localStorage.setItem(weekKey, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  const read = copyFor(wrap);

  return (
    <div className="fixed inset-0 z-50 bg-cream flex flex-col items-center justify-center px-container-mobile text-center riven-rise-in">
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-6">
        Your week
      </p>

      {/* The average + the trend arrow */}
      <p className="font-display text-display-lg text-charcoal leading-none">
        {wrap.thisAvg.toFixed(1)}
        <span className="font-body text-headline-sm text-on-surface-variant/70 ml-2">
          lb avg
        </span>
      </p>

      {wrap.direction === "down" || wrap.direction === "up" ? (
        <p
          className={`font-body text-body-lg mt-2 ${
            wrap.direction === "down" ? "text-sage" : "text-charcoal"
          }`}
        >
          {wrap.direction === "down" ? "▼" : "▲"} {Math.abs(wrap.deltaLb).toFixed(1)} lb
          <span className="text-on-surface-variant/70"> vs last week</span>
        </p>
      ) : null}

      {/* Trend line — the emotional payoff (the line going down) */}
      <TrendLine series={wrap.series} />

      <p className="font-body text-body-lg text-charcoal max-w-sm mt-8 leading-relaxed">
        {read}
      </p>

      <button
        type="button"
        onClick={dismiss}
        className="mt-10 bg-charcoal text-cream py-4 px-12 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 transition-all"
      >
        Lock it in
      </button>

      <p className="font-display text-headline-sm text-gold mt-10">Steady wins.</p>
    </div>
  );
}

/** RIVEN's read for the week — explicit, in voice, per direction. */
function copyFor(w: SundayWrap): string {
  switch (w.direction) {
    case "building":
      return "Just getting started. Log a few more days this week — next Sunday we'll have your real trend.";
    case "first":
      return `This is your starting line: ${w.thisAvg.toFixed(1)} lb on the 7-day average. The baseline we build from.`;
    case "down":
      return `Down ${Math.abs(w.deltaLb).toFixed(1)} lb on your 7-day average. That's real progress — not water, not luck. Keep stacking the same week.`;
    case "flat":
      return "Held steady this week. Maintenance is a skill — keep your logging clean and accurate so we can see the next move.";
    case "up":
      return `Up ${Math.abs(w.deltaLb).toFixed(1)} on the average — we're good, that's data, not a problem. One thing this week: watch your calories and clamp down a little.`;
  }
}

/** Simple normalized polyline of the recent daily weights. */
function TrendLine({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const W = 280, H = 80, pad = 8;
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
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-64 h-auto mt-6"
      role="img"
      aria-label="Your weight trend"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        className="text-gold"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
