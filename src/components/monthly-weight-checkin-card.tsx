"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitMonthlyWeightAction } from "@/app/(clerk)/(app)/dashboard/monthly-weight-actions";
import type { MonthlyWeightSnapshot } from "@/lib/monthly-weight-checkin";

/**
 * 30-day weight check-in card — top of /dashboard.
 *
 * Surfaces only when getMonthlyWeightSnapshot returns non-null (the
 * helper enforces the 30-day cadence). Two horizontal sliders:
 *   - Weight: anchored at her last known weight, ±30 lb range,
 *     0.1 lb step granularity so she can land on the precise reading.
 *   - Waist: range 20–60 in, 0.25 in step.
 *
 * Submit writes a WeeklyCheckIn row, updates Profile.currentWeight,
 * and the parent re-renders without the card.
 */
export function MonthlyWeightCheckinCard({
  snapshot,
}: {
  snapshot: MonthlyWeightSnapshot;
}) {
  const router = useRouter();

  // Slider state — start the weight slider on her last known number
  // so a "no-change" submit is literally zero interaction. Waist
  // starts on her last waist if we have one, else the midpoint of
  // the slider range (38").
  const [weight, setWeight] = useState<number>(
    roundTo(snapshot.currentWeight, 1),
  );
  const [waist, setWaist] = useState<number>(
    snapshot.lastWaist != null ? roundTo(snapshot.lastWaist, 1) : 38,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Sliders centered on snapshot.currentWeight let her dial in fine
  // changes without sweeping through 600 lb of useless range. Clamp
  // the min/max to the schema-valid 70-700 in case her current is
  // near the edge.
  const weightMin = Math.max(70, snapshot.currentWeight - 30);
  const weightMax = Math.min(700, snapshot.currentWeight + 30);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const r = await submitMonthlyWeightAction({ weight, waist });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(true);
      // Refresh so the snapshot helper returns null and the card
      // disappears on next render. Wait a beat so she sees the
      // confirmation.
      setTimeout(() => router.refresh(), 700);
    });
  }

  const lbsToGoal = roundTo(weight - snapshot.goalWeight, 1);

  return (
    <section
      aria-label="30-day weight check-in"
      className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-5 shadow-elevation-1 space-y-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Monthly check-in
          </p>
          <p className="font-display text-headline-sm text-charcoal mt-1 leading-snug">
            It&apos;s been {snapshot.daysSinceLast} days. Drop your numbers.
          </p>
        </div>
      </div>

      {/* Weight slider */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="monthly-weight"
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
        <p className="font-display text-display-sm text-charcoal">
          {weight.toFixed(1)}
          <span className="font-body text-headline-sm text-on-surface-variant/70 ml-2">
            lb
          </span>
        </p>
        <input
          id="monthly-weight"
          type="range"
          min={weightMin}
          max={weightMax}
          step={0.1}
          value={weight}
          onChange={(e) => setWeight(parseFloat(e.target.value))}
          disabled={pending || done}
          className="riven-slider w-full"
        />
        <div className="flex justify-between font-body text-label-sm text-on-surface-variant/60">
          <span>{weightMin.toFixed(0)}</span>
          <span>{weightMax.toFixed(0)}</span>
        </div>
      </div>

      {/* Waist slider */}
      <div className="space-y-2">
        <label
          htmlFor="monthly-waist"
          className="font-body text-label-md tracking-wide text-on-surface-variant uppercase"
        >
          Waist
        </label>
        <p className="font-display text-display-sm text-charcoal">
          {waist.toFixed(1)}
          <span className="font-body text-headline-sm text-on-surface-variant/70 ml-2">
            in
          </span>
        </p>
        <input
          id="monthly-waist"
          type="range"
          min={20}
          max={60}
          step={0.25}
          value={waist}
          onChange={(e) => setWaist(parseFloat(e.target.value))}
          disabled={pending || done}
          className="riven-slider w-full"
        />
        <div className="flex justify-between font-body text-label-sm text-on-surface-variant/60">
          <span>20</span>
          <span>60</span>
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

      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}
    </section>
  );
}

function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}
