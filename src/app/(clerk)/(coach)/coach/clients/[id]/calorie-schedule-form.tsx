"use client";

import { useState, useTransition } from "react";
import { setClientCalorieSchedule } from "@/lib/coach-actions";
import {
  DAY_KEYS,
  type DayKey,
  weeklyAverageOf,
  shiftToAverage,
  MIN_DAY_CAL,
  MAX_DAY_CAL,
} from "@/lib/calorie-schedule";

type DayValues = Record<DayKey, number>;

/**
 * Coach-side per-day calorie schedule editor. Lives on /coach/clients/[id]
 * under the Profile block in the Overview tab. When `initialSchedule` is
 * null, the form prefills every day with the client's flat cutCalories so
 * RIVEN only has to nudge the days that should differ. Save writes the
 * schedule. Clear (only shown when a schedule is active) reverts to flat.
 */
export function CalorieScheduleForm({
  clientUserId,
  defaultCalories,
  initialSchedule,
}: {
  clientUserId: string;
  defaultCalories: number;
  initialSchedule: DayValues | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<null | "set" | "cleared">(null);
  const [values, setValues] = useState<DayValues>(() => {
    if (initialSchedule) return initialSchedule;
    const fallback: Partial<DayValues> = {};
    for (const k of DAY_KEYS) fallback[k] = defaultCalories;
    return fallback as DayValues;
  });
  // Track whether a schedule is currently active on the row — drives the
  // Clear-button visibility. Updated after a save/clear so the UI reflects
  // the new state without a full page refresh.
  const [isActive, setIsActive] = useState(initialSchedule !== null);

  // The weekly average RIVEN is aiming this client at. On a cut the WEEK is
  // what matters, not any single day — she sets the target here, builds a
  // high/low pattern in the day inputs, then snaps the week onto it.
  const [targetAvg, setTargetAvg] = useState<number>(() =>
    initialSchedule ? weeklyAverageOf(initialSchedule) : defaultCalories,
  );

  // Live mean of the seven inputs and how far it sits from the target.
  const currentAvg = weeklyAverageOf(values);
  const diff = currentAvg - targetAvg;
  const onTarget = Math.abs(diff) <= 15;

  function update(day: DayKey, raw: string) {
    setError(null);
    setSaved(null);
    const n = parseInt(raw, 10);
    setValues((v) => ({ ...v, [day]: Number.isFinite(n) ? n : 0 }));
  }

  function updateTarget(raw: string) {
    setSaved(null);
    const n = parseInt(raw, 10);
    setTargetAvg(Number.isFinite(n) ? n : 0);
  }

  // Slide the whole week up/down so its mean lands on targetAvg, keeping the
  // high/low shape the coach already built. Pure client-side preview — she
  // still has to hit Save to persist.
  function snapToAverage() {
    setError(null);
    setSaved(null);
    setValues((v) => shiftToAverage(v, targetAvg));
  }

  function save() {
    setError(null);
    setSaved(null);
    const fd = new FormData();
    fd.set("clientUserId", clientUserId);
    fd.set("action", "set");
    for (const k of DAY_KEYS) fd.set(k, String(values[k]));
    startTransition(async () => {
      const r = await setClientCalorieSchedule(fd);
      if (!r.ok) setError(r.error);
      else {
        setIsActive(true);
        setSaved("set");
      }
    });
  }

  function clearSchedule() {
    setError(null);
    setSaved(null);
    const fd = new FormData();
    fd.set("clientUserId", clientUserId);
    fd.set("action", "clear");
    startTransition(async () => {
      const r = await setClientCalorieSchedule(fd);
      if (!r.ok) setError(r.error);
      else {
        setIsActive(false);
        setSaved("cleared");
        // Reset the form back to flat-cal defaults so the next save is clean.
        const fallback: Partial<DayValues> = {};
        for (const k of DAY_KEYS) fallback[k] = defaultCalories;
        setValues(fallback as DayValues);
      }
    });
  }

  return (
    <div className="mt-6 rounded-md bg-cream/50 border border-outline-variant/40 p-gutter space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="font-display text-headline-sm text-charcoal">
          Calorie cycling
        </h3>
        <p className="font-body text-label-sm text-on-surface-variant">
          {isActive ? "Active schedule" : "Off — flat cut applies"}
        </p>
      </div>
      <p className="font-body text-body-md text-on-surface-variant leading-relaxed">
        Set a per-day-of-week calorie target for clients on a cycling protocol
        (lift / rest / refeed days). Pick the weekly average she should land on,
        build the high/low pattern below, then snap the week onto that average.
        Leave every day at the same number to keep her on a flat cut — or hit
        Clear below.
      </p>

      {/* Weekly-average anchor — the number that actually matters on a cut. */}
      <div className="flex items-end gap-3 flex-wrap rounded-md bg-surface-container-lowest border border-outline-variant/50 p-gutter">
        <label className="flex flex-col gap-1.5">
          <span className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
            Weekly average / day
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_DAY_CAL}
            max={MAX_DAY_CAL}
            step={10}
            value={targetAvg}
            onChange={(e) => updateTarget(e.target.value)}
            className="w-28 rounded-md border border-outline-variant/60 bg-cream/50 px-3 py-2 text-center font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none transition-colors"
          />
        </label>
        <button
          type="button"
          onClick={snapToAverage}
          className="border border-charcoal/60 text-charcoal px-4 py-2 rounded-full font-body text-label-sm tracking-widest uppercase hover:bg-charcoal/5 active:scale-95 transition-all"
        >
          Snap week to average
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {DAY_KEYS.map((day) => (
          <label key={day} className="flex flex-col items-center gap-1.5">
            <span className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
              {day}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={800}
              max={5000}
              step={10}
              value={values[day]}
              onChange={(e) => update(day, e.target.value)}
              className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-2 py-2 text-center font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none transition-colors"
            />
          </label>
        ))}
      </div>

      {/* Live running average vs. the target she set above. */}
      <p
        className={`font-body text-label-sm ${
          onTarget ? "text-sage" : "text-gold"
        }`}
      >
        {onTarget
          ? `Averaging ${currentAvg.toLocaleString()}/day — locked on her ${targetAvg.toLocaleString()} target.`
          : `Averaging ${currentAvg.toLocaleString()}/day — ${Math.abs(
              diff,
            ).toLocaleString()} ${
              diff > 0 ? "over" : "under"
            } her ${targetAvg.toLocaleString()} target.`}
      </p>

      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}
      {saved === "set" && !error && (
        <p className="font-body text-label-sm text-sage">
          Schedule saved. Her dashboard, meal log, and chat all use today&apos;s value now.
        </p>
      )}
      {saved === "cleared" && !error && (
        <p className="font-body text-label-sm text-sage">
          Cleared. She&apos;s back on the flat cut.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-charcoal text-cream px-5 py-2.5 rounded-full font-body text-label-sm tracking-widest uppercase shadow-elevation-1 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save schedule"}
        </button>
        {isActive && (
          <button
            type="button"
            onClick={clearSchedule}
            disabled={pending}
            className="border border-charcoal/60 text-charcoal px-5 py-2.5 rounded-full font-body text-label-sm tracking-widest uppercase hover:bg-charcoal/5 transition-all disabled:opacity-50"
          >
            Clear (flat cut)
          </button>
        )}
      </div>
    </div>
  );
}
