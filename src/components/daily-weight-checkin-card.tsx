"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitDailyWeightAction } from "@/app/(clerk)/(app)/dashboard/daily-weight-actions";
import type { DailyWeighSnapshot } from "@/lib/daily-weigh-in";

/**
 * DAILY weight check-in card — top of /dashboard. Shows once a day, until she
 * logs today's number, then self-hides. Weight only (the waist + photos live
 * in the separate monthly check-in). Same slider mechanic as the monthly card.
 */
export function DailyWeightCheckinCard({
  snapshot,
}: {
  snapshot: DailyWeighSnapshot;
}) {
  const router = useRouter();
  const [weight, setWeight] = useState<number>(roundTo(snapshot.prefillWeight, 1));
  // The typed value is kept as a STRING so she can type freely ("20" on the way
  // to "201.5") without it snapping mid-keystroke. `weight` is the source of
  // truth for submit + the slider; this just mirrors it for the text field.
  const [weightText, setWeightText] = useState<string>(
    roundTo(snapshot.prefillWeight, 1).toFixed(1),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Hard bounds (same as the server validates) — typing can go anywhere in
  // range, not just the slider's ±30 window.
  const MIN = 70;
  const MAX = 700;
  // Center the slider on her last weight so a "no change" submit is zero work.
  const weightMin = Math.max(MIN, snapshot.prefillWeight - 30);
  const weightMax = Math.min(MAX, snapshot.prefillWeight + 30);

  // Slider → keep the typed field in lockstep.
  function setFromSlider(v: number) {
    setWeight(v);
    setWeightText(v.toFixed(1));
  }

  // Typing → allow only digits + one dot; update the number live when valid.
  function onTypeWeight(raw: string) {
    if (!/^\d*\.?\d*$/.test(raw)) return; // ignore stray characters
    setWeightText(raw);
    const n = parseFloat(raw);
    if (Number.isFinite(n)) setWeight(n);
  }

  // On blur, tidy up: clamp into range and show one decimal.
  function normalizeWeight() {
    let n = parseFloat(weightText);
    if (!Number.isFinite(n)) n = snapshot.prefillWeight;
    n = Math.min(MAX, Math.max(MIN, roundTo(n, 1)));
    setWeight(n);
    setWeightText(n.toFixed(1));
  }

  function handleSubmit() {
    setError(null);
    // Clamp whatever's typed into range before sending (covers tapping "Lock
    // it in" while the field still holds a half-typed or out-of-range value).
    let value = parseFloat(weightText);
    if (!Number.isFinite(value)) value = weight;
    value = Math.min(MAX, Math.max(MIN, roundTo(value, 1)));
    setWeight(value);
    setWeightText(value.toFixed(1));
    startTransition(async () => {
      const r = await submitDailyWeightAction({ weight: value });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(true);
      // Refresh swaps this card for the persistent "locked in" strip the
      // server renders once weighedToday is true.
      setTimeout(() => router.refresh(), 1200);
    });
  }

  const lbsToGoal = roundTo(weight - snapshot.goalWeight, 1);

  // Just submitted — confirm, then the refresh takes over.
  if (done) {
    return <DailyWeighDone weight={weight} />;
  }

  return (
    <section
      aria-label="Daily weight check-in"
      className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-5 shadow-elevation-1 space-y-5"
    >
      <div>
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Today&apos;s weigh-in
        </p>
        <p className="font-display text-headline-sm text-charcoal mt-1 leading-snug">
          One number. Same time, every day.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="daily-weight"
            className="font-body text-label-md tracking-wide text-on-surface-variant uppercase"
          >
            Weight
          </label>
          <p className="font-body text-label-sm text-on-surface-variant/80">
            {lbsToGoal > 0
              ? `${lbsToGoal} lb to goal`
              : lbsToGoal < 0
              ? `${Math.abs(lbsToGoal)} lb under goal`
              : "at goal"}
          </p>
        </div>
        <div className="flex items-baseline">
          <input
            id="daily-weight-number"
            type="text"
            inputMode="decimal"
            value={weightText}
            onChange={(e) => onTypeWeight(e.target.value)}
            onBlur={normalizeWeight}
            onFocus={(e) => e.target.select()}
            disabled={pending || done}
            aria-label="Type your weight"
            className="font-display text-display-sm text-charcoal bg-transparent w-32 border-b border-dashed border-gold/50 focus:border-gold focus:outline-none disabled:border-transparent"
          />
          <span className="font-body text-headline-sm text-on-surface-variant/70 ml-2">
            lb
          </span>
        </div>
        <p className="font-body text-label-sm text-on-surface-variant/60">
          Tap the number to type it, or drag the slider.
        </p>
        <input
          id="daily-weight"
          type="range"
          min={weightMin}
          max={weightMax}
          step={0.1}
          value={weight}
          onChange={(e) => setFromSlider(parseFloat(e.target.value))}
          disabled={pending || done}
          className="riven-slider w-full"
        />
        <div className="flex justify-between font-body text-label-sm text-on-surface-variant/60">
          <span>{weightMin.toFixed(0)}</span>
          <span>{weightMax.toFixed(0)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending || done}
        className="block w-full bg-charcoal text-cream py-4 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 disabled:opacity-50 transition-all"
      >
        {done ? "Locked in" : pending ? "Saving…" : "Lock it in"}
      </button>

      {error && <p className="font-body text-label-sm text-soft-red">{error}</p>}
    </section>
  );
}

/**
 * The "locked in" strip — shown right after she submits AND on every later
 * visit today (the dashboard renders it when the snapshot says weighedToday).
 * Sage = the brand's "you did it" color.
 */
export function DailyWeighDone({ weight }: { weight: number }) {
  return (
    <section
      aria-label="Daily weigh-in complete"
      className="rounded-md bg-sage/15 border border-sage/50 px-gutter py-4 flex items-center gap-3"
    >
      <span className="material-symbols-outlined text-sage" aria-hidden>
        check_circle
      </span>
      <div>
        <p className="font-body text-body-md text-charcoal">
          You locked it in for today — {weight.toFixed(1)} lb.
        </p>
        <p className="font-body text-label-sm text-on-surface-variant">
          Same time tomorrow. Steady wins.
        </p>
      </div>
    </section>
  );
}

function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}
