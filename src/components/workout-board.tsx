"use client";

import { useRef, useState, useTransition } from "react";
import { saveWorkoutSetting } from "@/lib/workout-actions";
import {
  WEIGHT_STEP_LB,
  relativeDayLabel,
  type WorkoutBoard as Board,
  type ExerciseRow,
} from "@/lib/workout";

/**
 * The push/pull/legs board. One day on screen at a time; arrows (or a swipe)
 * rotate through Push → Pull → Legs.
 *
 * Edits are optimistic and debounced: taps update local state instantly and a
 * single save fires ~700ms after the last tap, so holding the + button doesn't
 * fire a write per press.
 */

type LocalValues = { sets: number; reps: number; weightLb: number; touchedWeight: boolean };

const SAVE_DEBOUNCE_MS = 700;
/** How far the thumb must travel sideways before it counts as a swipe. */
const SWIPE_THRESHOLD_PX = 60;
/**
 * ...and it must be that much MORE sideways than vertical. Scrolling a long
 * list drifts horizontally by a surprising amount, which was flipping the day
 * mid-scroll; requiring the gesture to be decisively horizontal fixes it.
 */
const SWIPE_AXIS_RATIO = 1.8;

export function WorkoutBoard({ board }: { board: Board }) {
  const [dayIndex, setDayIndex] = useState(0);
  const [values, setValues] = useState<Record<string, LocalValues>>(() => {
    const seed: Record<string, LocalValues> = {};
    for (const day of board.days) {
      for (const ex of day.exercises) {
        seed[ex.key] = {
          sets: ex.sets,
          reps: ex.reps,
          weightLb: ex.weightLb,
          touchedWeight: false,
        };
      }
    }
    return seed;
  });

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [, startTransition] = useTransition();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const day = board.days[dayIndex];

  function queueSave(key: string, next: LocalValues) {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      startTransition(async () => {
        await saveWorkoutSetting({
          exerciseKey: key,
          sets: next.sets,
          reps: next.reps,
          weightLb: next.weightLb,
        });
      });
    }, SAVE_DEBOUNCE_MS);
  }

  function bump(key: string, field: "sets" | "reps" | "weightLb", delta: number) {
    setValues((prev) => {
      const cur = prev[key];
      // Clamp to the same bounds the server action enforces.
      const limits = { sets: [1, 20], reps: [1, 100], weightLb: [0, 1000] } as const;
      const [min, max] = limits[field];
      const raw = cur[field] + delta;
      const clamped = Math.min(max, Math.max(min, raw));
      if (clamped === cur[field]) return prev;

      const next: LocalValues = {
        ...cur,
        [field]: clamped,
        touchedWeight: cur.touchedWeight || field === "weightLb",
      };
      queueSave(key, next);
      return { ...prev, [key]: next };
    });
  }

  function go(dir: -1 | 1) {
    setDayIndex((i) => (i + dir + board.days.length) % board.days.length);
  }

  return (
    <div
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        // Only a decisively horizontal drag flips the day — otherwise scrolling
        // the list (which always drifts sideways a little) changes it by accident.
        if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
        if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return;
        go(dx < 0 ? 1 : -1);
      }}
    >
      {/* Day switcher — arrows rotate Push → Pull → Legs */}
      <div className="flex items-center justify-between gap-gutter mb-6">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous day"
          className="w-11 h-11 flex items-center justify-center rounded-full border border-outline-variant/60 text-charcoal active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>

        <div className="text-center">
          <h2 className="font-display text-headline-md text-charcoal leading-none">
            {day.label}
          </h2>
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mt-1">
            {day.dayHint} · {day.exercises.length} lifts
          </p>
        </div>

        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next day"
          className="w-11 h-11 flex items-center justify-center rounded-full border border-outline-variant/60 text-charcoal active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {/* Which of the three days you're on */}
      <div className="flex justify-center items-center gap-2 mb-8" aria-hidden>
        {board.days.map((d, i) => (
          <span
            key={d.key}
            className={`block rounded-full transition-all duration-200 ${
              i === dayIndex ? "w-6 h-1.5 bg-charcoal" : "w-1.5 h-1.5 bg-charcoal/25"
            }`}
          />
        ))}
      </div>

      <div className="space-y-4">
        {day.exercises.map((ex) => (
          <ExerciseCard
            key={ex.key}
            ex={ex}
            local={values[ex.key]}
            onBump={(field, delta) => bump(ex.key, field, delta)}
          />
        ))}
      </div>
    </div>
  );
}

function ExerciseCard({
  ex,
  local,
  onBump,
}: {
  ex: ExerciseRow;
  local: LocalValues;
  onBump: (field: "sets" | "reps" | "weightLb", delta: number) => void;
}) {
  // Once the weight is nudged in this session it changed "today" — show that
  // straight away rather than the stale server label.
  const changedLabel = local.touchedWeight ? relativeDayLabel(0) : ex.weightChangedLabel;
  const stale = !local.touchedWeight && ex.isStale;

  return (
    <section
      className={`rounded-2xl border bg-surface-container-lowest px-gutter py-4 ${
        stale ? "border-gold/60" : "border-outline-variant/40"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF; next/image would freeze it */}
        <img
          src={`/exercises/${ex.gif}`}
          alt={`${ex.name} demonstration`}
          width={80}
          height={80}
          className="w-20 h-20 rounded-xl bg-cream object-contain flex-shrink-0"
          loading="lazy"
        />
        <div className="min-w-0">
          <h3 className="font-body text-body-md text-charcoal font-semibold leading-tight">
            {ex.name}
          </h3>
          <p className="font-body text-label-md text-on-surface-variant mt-0.5">
            Target {ex.target}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <Stepper label="Sets" value={local.sets} onUp={() => onBump("sets", 1)} onDown={() => onBump("sets", -1)} />
        <Stepper label="Reps" value={local.reps} onUp={() => onBump("reps", 1)} onDown={() => onBump("reps", -1)} />
        <Stepper
          label="Weight"
          value={local.weightLb}
          suffix="lb"
          onUp={() => onBump("weightLb", WEIGHT_STEP_LB)}
          onDown={() => onBump("weightLb", -WEIGHT_STEP_LB)}
        />
      </div>

      <p
        className={`font-body text-label-md mt-3 ${
          stale ? "text-gold" : "text-on-surface-variant"
        }`}
      >
        {stale ? (
          <>Weight changed {changedLabel} — time to go up.</>
        ) : (
          <>Weight changed {changedLabel}</>
        )}
      </p>
    </section>
  );
}

function Stepper({
  label,
  value,
  suffix,
  onUp,
  onDown,
}: {
  label: string;
  value: number;
  suffix?: string;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-cream py-2">
      <span className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
        {label}
      </span>
      <button
        type="button"
        onClick={onUp}
        aria-label={`Increase ${label.toLowerCase()}`}
        className="w-9 h-7 flex items-center justify-center text-charcoal active:scale-90 transition-transform"
      >
        <span className="material-symbols-outlined text-[20px]">expand_less</span>
      </button>
      <span className="font-display text-headline-sm text-charcoal leading-none tabular-nums">
        {value}
        {suffix ? (
          <span className="font-body text-label-sm text-on-surface-variant ml-0.5">{suffix}</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onDown}
        aria-label={`Decrease ${label.toLowerCase()}`}
        className="w-9 h-7 flex items-center justify-center text-charcoal active:scale-90 transition-transform"
      >
        <span className="material-symbols-outlined text-[20px]">expand_more</span>
      </button>
    </div>
  );
}
