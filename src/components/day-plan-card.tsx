"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  lockDaySlotAction,
  swapDaySlotAction,
} from "@/app/(clerk)/(app)/dashboard/day-plan-actions";
import type { DayPlanView, PlanSlotView } from "@/lib/day-plan";
import type { MealSlot } from "@/lib/meal-bank";

/**
 * The day-plan card — "RIVEN already picked your day." Sits on /dashboard
 * between the daily weigh-in and the Today targets.
 *
 * Two depths, one component:
 *   collapsed — ONE decision: the hero slot (tonight, usually) with RIVEN's
 *               one-liner, Lock it in, and Swap. Peaceful discipline.
 *   expanded  — the full mapped day (B): passed slots muted, hero held in
 *               gold, upcoming slots swappable. Her call which depth she sees.
 */

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/** Eyebrow over the hero pick — time-aware, lowercase, wide tracking. */
const HERO_EYEBROW: Record<MealSlot, string> = {
  breakfast: "This morning",
  lunch: "Lunch",
  dinner: "Tonight",
  snack: "Tonight's snack",
};

export function DayPlanCard({ plan }: { plan: DayPlanView }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hero = plan.slots.find((s) => s.state === "hero") ?? plan.slots[0];

  function lock(slot: MealSlot) {
    setError(null);
    startTransition(async () => {
      const r = await lockDaySlotAction({ slot });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function swap(slot: MealSlot) {
    setError(null);
    startTransition(async () => {
      const r = await swapDaySlotAction({ slot });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Your day, already planned"
      className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-5 shadow-elevation-1 space-y-4"
    >
      {/* RIVEN's line — the "a coach looked at your data" moment. */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-charcoal font-display text-body-md text-cream"
        >
          R
        </span>
        <p className="font-body text-body-md text-charcoal/90 leading-snug pt-0.5">
          {plan.voiceLine}
        </p>
      </div>

      {/* The hero decision. */}
      <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-4 space-y-3">
        <p className="font-body text-label-md tracking-widest uppercase text-gold">
          {HERO_EYEBROW[hero.slot]}
        </p>
        <div>
          <p className="font-display text-headline-sm text-charcoal leading-snug">
            {hero.meal.name}
          </p>
          <p className="font-body text-label-sm text-on-surface-variant mt-1">
            {hero.meal.detail}
          </p>
          <p className="font-body text-label-sm text-on-surface-variant/80 mt-1">
            {hero.meal.calories} cal · {hero.meal.protein}g protein · fits your
            day
          </p>
        </div>

        {hero.locked ? (
          <p className="flex items-center gap-2 font-body text-body-md text-sage">
            <span aria-hidden className="material-symbols-outlined text-sage">
              check_circle
            </span>
            Locked in. Make it, log it.
          </p>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => lock(hero.slot)}
              disabled={pending}
              className="block w-full bg-charcoal text-cream py-3.5 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 disabled:opacity-50 transition-all"
            >
              {pending ? "One sec…" : "Lock it in"}
            </button>
            <button
              type="button"
              onClick={() => swap(hero.slot)}
              disabled={pending}
              className="block w-full bg-transparent text-charcoal border border-charcoal/70 py-3 rounded-full font-body text-label-md tracking-widest uppercase active:scale-95 disabled:opacity-50 transition-all"
            >
              Swap for something else
            </button>
          </div>
        )}
      </div>

      {/* Quiet adjustment note — only when the flat-week trim is on. */}
      {plan.trimmed && (
        <p className="rounded-md bg-sage/15 border border-sage/40 px-4 py-2.5 font-body text-label-sm text-charcoal/80">
          Today&apos;s plan runs 100 lighter. That&apos;s data, not a problem.
        </p>
      )}

      {/* The expander — A's footer, B's door. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between border-t border-outline-variant/50 pt-3 font-body text-label-md text-charcoal"
      >
        <span>{expanded ? "Just tonight" : "See your full day"}</span>
        <span className="flex items-center gap-2 text-on-surface-variant">
          <span className="text-label-sm">
            {plan.planCalories.toLocaleString()} cal · {plan.planProtein}g
          </span>
          <span aria-hidden className="material-symbols-outlined text-[20px]">
            {expanded ? "expand_less" : "expand_more"}
          </span>
        </span>
      </button>

      {/* B — the full mapped day. */}
      {expanded && (
        <ul className="space-y-1">
          {plan.slots.map((s) => (
            <DaySlotRow
              key={s.slot}
              row={s}
              isHero={s.slot === hero.slot}
              pending={pending}
              onLock={() => lock(s.slot)}
              onSwap={() => swap(s.slot)}
            />
          ))}
        </ul>
      )}

      {error && <p className="font-body text-label-sm text-soft-red">{error}</p>}
    </section>
  );
}

function DaySlotRow({
  row,
  isHero,
  pending,
  onLock,
  onSwap,
}: {
  row: PlanSlotView;
  isHero: boolean;
  pending: boolean;
  onLock: () => void;
  onSwap: () => void;
}) {
  const passed = row.state === "passed";

  // The hero already has the big treatment above — in the list it just gets
  // the gold edge so the eye lands on the live decision.
  return (
    <li
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${
        isHero ? "border border-gold/60 bg-gold/10" : ""
      }`}
    >
      <span
        aria-hidden
        className={`material-symbols-outlined text-[20px] ${
          row.logged || row.locked
            ? "text-sage"
            : passed
              ? "text-on-surface-variant/40"
              : "text-on-surface-variant/70"
        }`}
      >
        {row.logged ? "check_circle" : row.locked ? "lock" : "radio_button_unchecked"}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`font-body text-body-md truncate ${
            passed && !row.logged
              ? "text-on-surface-variant/60"
              : "text-charcoal"
          }`}
        >
          <span className="text-on-surface-variant">
            {SLOT_LABEL[row.slot]} ·{" "}
          </span>
          {row.meal.name}
        </p>
        <p className="font-body text-label-sm text-on-surface-variant/70">
          {row.meal.calories} cal · {row.meal.protein}g
          {row.logged ? " · logged" : row.locked ? " · locked in" : ""}
        </p>
      </div>

      {/* Upcoming, unlocked slots stay swappable; hero locks from up top. */}
      {!passed && !row.logged && !row.locked && (
        <div className="flex shrink-0 items-center gap-1">
          {!isHero && (
            <button
              type="button"
              onClick={onLock}
              disabled={pending}
              aria-label={`Lock in ${row.meal.name}`}
              className="rounded-full p-1.5 text-charcoal/70 active:scale-90 disabled:opacity-40 transition-all"
            >
              <span aria-hidden className="material-symbols-outlined text-[20px]">
                check
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onSwap}
            disabled={pending}
            aria-label={`Swap ${row.meal.name}`}
            className="rounded-full p-1.5 text-gold active:scale-90 disabled:opacity-40 transition-all"
          >
            <span aria-hidden className="material-symbols-outlined text-[20px]">
              sync
            </span>
          </button>
        </div>
      )}
    </li>
  );
}
