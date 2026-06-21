"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { SundayWrap } from "@/lib/daily-weigh-in";
import type { CalorieWeek, WaistSnapshot } from "@/lib/weekly-review";
import { submitWaistAction } from "@/app/(clerk)/(app)/dashboard/waist-actions";

/**
 * Count a number up to `target` over `durationMs` once `active` is true.
 * Ease-out so it decelerates into the final figure — the number "lands."
 * Honors prefers-reduced-motion: those users see the final value instantly.
 */
function useCountUp(target: number, active: boolean, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setValue(target * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, active, durationMs]);

  return value;
}

type StepKey = "weight" | "calories" | "waist";

/**
 * The Sunday ritual — full-screen, once a week. A short sequence she taps
 * through: her weekly WEIGHT average (the trend), her weekly CALORIE average
 * (where to adjust), then she measures her WAIST. The server only returns
 * wrap data on Sundays; "show once" is handled via a per-week localStorage key.
 *
 * Mirrors the rose-ceremony overlay: fixed full-screen wash, body scroll
 * locked, one calm action per step.
 */
export function SundayWeightWrap({
  wrap,
  calorie,
  waist,
}: {
  wrap: SundayWrap;
  calorie?: CalorieWeek | null;
  waist?: WaistSnapshot | null;
}) {
  // Per-week key = today's Central date (it's always a Sunday when shown).
  const weekKey =
    "riven_sunday_wrap_" +
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  const [visible, setVisible] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Waist input (the only step she types into).
  const [waistVal, setWaistVal] = useState<number>(waist?.prefill ?? 34);
  const [waistText, setWaistText] = useState<string>((waist?.prefill ?? 34).toFixed(1));

  // Which steps exist this week: weight always, calories if we have data,
  // waist always (it's an input she fills on Sunday).
  const steps: StepKey[] = ["weight"];
  if (calorie) steps.push("calories");
  steps.push("waist");
  const step = steps[Math.min(stepIdx, steps.length - 1)];

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

  // Count-ups, each driven only while its step is on screen.
  const animatedWeight = useCountUp(wrap.thisAvg, visible && step === "weight");
  const animatedCal = useCountUp(calorie?.thisAvg ?? 0, visible && step === "calories");

  if (!visible) return null;

  function close() {
    try {
      window.localStorage.setItem(weekKey, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  function advance() {
    if (stepIdx < steps.length - 1) setStepIdx((i) => i + 1);
    else close();
  }

  function saveWaist() {
    setError(null);
    let v = parseFloat(waistText);
    if (!Number.isFinite(v)) v = waistVal;
    v = Math.min(80, Math.max(15, Math.round(v * 10) / 10));
    setWaistVal(v);
    setWaistText(v.toFixed(1));
    startTransition(async () => {
      const r = await submitWaistAction({ waistIn: v });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-cream flex flex-col items-center justify-center px-container-mobile text-center riven-rise-in">
      {/* tiny step dots so she knows there's a short sequence */}
      <div className="flex gap-2 mb-6" aria-hidden>
        {steps.map((s, i) => (
          <span
            key={s}
            className={`h-1.5 rounded-full transition-all ${
              i === stepIdx ? "w-6 bg-gold" : "w-1.5 bg-on-surface-variant/30"
            }`}
          />
        ))}
      </div>

      {step === "weight" && (
        <>
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-6">
            Your week · weight
          </p>
          <p className="font-display text-display-lg text-charcoal leading-none tabular-nums">
            {animatedWeight.toFixed(1)}
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
          <TrendLine series={wrap.series} />
          <p className="font-body text-body-lg text-charcoal max-w-sm mt-8 leading-relaxed">
            {weightCopy(wrap)}
          </p>
          <ActionButton onClick={advance} label="Okay, I got it" />
        </>
      )}

      {step === "calories" && calorie && (
        <>
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-6">
            Your week · fuel
          </p>
          <p className="font-display text-display-lg text-charcoal leading-none tabular-nums">
            {Math.round(animatedCal).toLocaleString()}
            <span className="font-body text-headline-sm text-on-surface-variant/70 ml-2">
              cal/day avg
            </span>
          </p>
          <p className="font-body text-body-md text-on-surface-variant mt-2">
            Target {calorie.target.toLocaleString()} ·{" "}
            {calorie.vsTarget === 0
              ? "right on it"
              : `${Math.abs(calorie.vsTarget).toLocaleString()} ${calorie.vsTarget < 0 ? "under" : "over"}`}
          </p>
          <p className="font-body text-body-lg text-charcoal max-w-sm mt-8 leading-relaxed">
            {calorieCopy(calorie)}
          </p>
          <ActionButton onClick={advance} label="Got it" />
        </>
      )}

      {step === "waist" && (
        <>
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-6">
            Your week · waist
          </p>
          <p className="font-body text-body-md text-on-surface-variant max-w-xs mb-6">
            Grab a tape — around the belly button, relaxed. One number.
          </p>
          <div className="flex items-baseline">
            <input
              type="text"
              inputMode="decimal"
              value={waistText}
              onChange={(e) => {
                const raw = e.target.value;
                if (!/^\d*\.?\d*$/.test(raw)) return;
                setWaistText(raw);
                const n = parseFloat(raw);
                if (Number.isFinite(n)) setWaistVal(n);
              }}
              onBlur={() => {
                let n = parseFloat(waistText);
                if (!Number.isFinite(n)) n = waistVal;
                n = Math.min(80, Math.max(15, Math.round(n * 10) / 10));
                setWaistVal(n);
                setWaistText(n.toFixed(1));
              }}
              onFocus={(e) => e.target.select()}
              disabled={pending}
              aria-label="Type your waist measurement in inches"
              className="font-display text-display-lg text-charcoal bg-transparent w-40 text-center border-b border-dashed border-gold/50 focus:border-gold focus:outline-none tabular-nums"
            />
            <span className="font-body text-headline-sm text-on-surface-variant/70 ml-2">
              in
            </span>
          </div>
          <input
            type="range"
            min={20}
            max={60}
            step={0.1}
            value={Math.min(60, Math.max(20, waistVal))}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setWaistVal(v);
              setWaistText(v.toFixed(1));
            }}
            disabled={pending}
            className="riven-slider w-64 mt-6"
            aria-label="Waist measurement slider"
          />
          {waist?.current != null ? (
            <p className="font-body text-body-md text-on-surface-variant mt-4">
              Last time: {waist.current.toFixed(1)} in
              {waist.deltaIn != null && waist.deltaIn !== 0 ? (
                <span className={waist.deltaIn < 0 ? "text-sage" : "text-charcoal"}>
                  {" "}
                  ({waist.deltaIn < 0 ? "▼" : "▲"} {Math.abs(waist.deltaIn).toFixed(1)})
                </span>
              ) : null}
            </p>
          ) : (
            <p className="font-body text-body-md text-on-surface-variant mt-4">
              First measurement — this is your baseline.
            </p>
          )}
          {error && <p className="font-body text-label-sm text-soft-red mt-3">{error}</p>}
          <ActionButton
            onClick={saveWaist}
            label={pending ? "Saving…" : "Lock in my week"}
            disabled={pending}
          />
        </>
      )}

      <p className="font-display text-headline-sm text-gold mt-10">Steady wins.</p>
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-10 bg-charcoal text-cream py-4 px-12 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 transition-all disabled:opacity-50"
    >
      {label}
    </button>
  );
}

/** RIVEN's read on the weight trend — explicit, in voice, per direction. */
function weightCopy(w: SundayWrap): string {
  switch (w.direction) {
    case "building":
      return "Just getting started. Log a few more days this week — next Sunday we'll have your real trend.";
    case "first":
      return `This is your starting line: ${w.thisAvg.toFixed(1)} lb on the 7-day average. The baseline we build from.`;
    case "down":
      return `Down ${Math.abs(w.deltaLb).toFixed(1)} lb on your 7-day average. That's real progress — not water, not luck. Keep stacking the same week.`;
    case "flat":
      return "Held steady this week. Maintenance is a skill — keep your logging clean so we can see the next move.";
    case "up":
      return `Up ${Math.abs(w.deltaLb).toFixed(1)} on the average — that's data, not a problem. We'll clamp down a little this week.`;
  }
}

/** RIVEN's read on the calorie average — where to adjust. */
function calorieCopy(c: CalorieWeek): string {
  switch (c.direction) {
    case "none":
      return `Only ${c.daysLogged} day${c.daysLogged === 1 ? "" : "s"} logged this week. Log more and we'll have your real average to coach from.`;
    case "under":
      return `Averaging ${c.thisAvg.toLocaleString()} a day — ${Math.abs(c.vsTarget).toLocaleString()} under your ${c.target.toLocaleString()} target. Right where a cut lives. Hold it.`;
    case "on":
      return `Averaging ${c.thisAvg.toLocaleString()} a day — right on your ${c.target.toLocaleString()} target. Clean week. Keep it boring.`;
    case "over":
      return `Averaging ${c.thisAvg.toLocaleString()} a day — ${c.vsTarget.toLocaleString()} over your ${c.target.toLocaleString()} target. Real talk: we clamp down a little this week.`;
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
