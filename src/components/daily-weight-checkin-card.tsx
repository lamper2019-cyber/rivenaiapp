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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Center the slider on her last weight so a "no change" submit is zero work.
  const weightMin = Math.max(70, snapshot.prefillWeight - 30);
  const weightMax = Math.min(700, snapshot.prefillWeight + 30);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const r = await submitDailyWeightAction({ weight });
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
        <p className="font-display text-display-sm text-charcoal">
          {weight.toFixed(1)}
          <span className="font-body text-headline-sm text-on-surface-variant/70 ml-2">
            lb
          </span>
        </p>
        <input
          id="daily-weight"
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
