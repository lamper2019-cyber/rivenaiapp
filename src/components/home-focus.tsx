"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitDailyWeightAction } from "@/app/(clerk)/(app)/dashboard/daily-weight-actions";
import {
  lockDaySlotAction,
  ateDaySlotAction,
} from "@/app/(clerk)/(app)/dashboard/day-plan-actions";
import type { MealSlot } from "@/lib/meal-bank";

/**
 * The home focus — ONE thing at a time. RIVEN picks the single next move and
 * the whole screen is that, breathing. Her numbers sit quiet underneath.
 * Everything else (the full day, the Circle, wins) lives off this screen.
 *
 * The focus rotates through her day, top priority first:
 *   weigh  — she hasn't logged today's number. The day "opens" after.
 *   eat    — tonight's pick is locked but not eaten → "did you eat it?"
 *   plan   — tonight's pick is waiting → "lock it in."
 *   done   — everything's in → a calm close.
 */

export type HomeHero = {
  slot: MealSlot;
  name: string;
  calories: number;
  protein: number;
  locked: boolean;
  eaten: boolean;
};

export type HomeNumbers = {
  calories: number;
  calorieTarget: number;
  protein: number;
  proteinFloor: number;
  steps: number;
  stepGoal: number;
};

const HERO_EYEBROW: Record<MealSlot, string> = {
  breakfast: "this morning",
  lunch: "lunch",
  dinner: "tonight",
  snack: "tonight's snack",
};

export function HomeFocus({
  firstName,
  weighedToday,
  prefillWeight,
  goalWeight,
  hero,
  voiceLine,
  numbers,
}: {
  firstName: string;
  weighedToday: boolean;
  prefillWeight: number;
  goalWeight: number;
  hero: HomeHero | null;
  voiceLine: string;
  numbers: HomeNumbers;
}) {
  const mode: "weigh" | "eat" | "plan" | "done" = !weighedToday
    ? "weigh"
    : hero && !hero.eaten && hero.locked
      ? "eat"
      : hero && !hero.eaten
        ? "plan"
        : "done";

  return (
    <div className="space-y-3">
      {mode === "weigh" && (
        <WeighFocus
          firstName={firstName}
          prefillWeight={prefillWeight}
          goalWeight={goalWeight}
        />
      )}
      {mode === "plan" && hero && (
        <PlanFocus hero={hero} voiceLine={voiceLine} />
      )}
      {mode === "eat" && hero && <EatFocus hero={hero} />}
      {mode === "done" && <DoneFocus firstName={firstName} />}

      <QuietStats numbers={numbers} />
    </div>
  );
}

/* ── The breathing avatar, shared by every focus ─────────────────────── */
function Avatar({ gold }: { gold?: boolean }) {
  return (
    <span
      aria-hidden
      className={`riven-coach-breath mb-4 flex h-11 w-11 items-center justify-center rounded-full font-display text-headline-sm ${
        gold ? "bg-gold text-charcoal" : "bg-cream text-charcoal"
      }`}
    >
      R
    </span>
  );
}

/* ── Weigh: the day opens with one number ────────────────────────────── */
function WeighFocus({
  firstName,
  prefillWeight,
  goalWeight,
}: {
  firstName: string;
  prefillWeight: number;
  goalWeight: number;
}) {
  const router = useRouter();
  const [weight, setWeight] = useState<number>(round1(prefillWeight));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const min = Math.max(70, prefillWeight - 30);
  const max = Math.min(700, prefillWeight + 30);
  const toGoal = round1(weight - goalWeight);

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await submitDailyWeightAction({ weight });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Today's weigh-in"
      className="rounded-2xl bg-charcoal px-gutter py-7 flex flex-col items-center text-center"
    >
      <Avatar />
      <p className="font-display text-headline-md text-cream leading-snug">
        Morning, {firstName}. One number to start.
      </p>

      <p className="font-display text-display-md text-cream mt-4 tabular-nums">
        {weight.toFixed(1)}
        <span className="font-body text-headline-sm text-cream/60 ml-2">lb</span>
      </p>
      <p className="font-body text-label-sm text-cream/60 mt-1">
        {toGoal > 0
          ? `${toGoal} lb to goal`
          : toGoal < 0
            ? `${Math.abs(toGoal)} lb under goal`
            : "at goal"}
      </p>

      <input
        type="range"
        min={min}
        max={max}
        step={0.1}
        value={weight}
        onChange={(e) => setWeight(parseFloat(e.target.value))}
        disabled={pending}
        aria-label="Today's weight"
        className="riven-slider w-full mt-5"
      />

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-6 w-full bg-gold text-charcoal py-4 rounded-full font-body text-label-md tracking-widest uppercase active:scale-95 disabled:opacity-50 transition-all"
      >
        {pending ? "Locking in…" : "Lock in today's weight"}
      </button>

      {error && (
        <p className="font-body text-label-sm text-soft-red mt-3">{error}</p>
      )}
    </section>
  );
}

/* ── Plan: tonight's one decision ────────────────────────────────────── */
function PlanFocus({ hero, voiceLine }: { hero: HomeHero; voiceLine: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function lock() {
    startTransition(async () => {
      await lockDaySlotAction({ slot: hero.slot });
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Tonight's plan"
      className="rounded-2xl bg-charcoal px-gutter py-7 flex flex-col items-center text-center"
    >
      <Avatar />
      <p className="font-body text-label-sm text-cream/70 leading-snug max-w-xs">
        {voiceLine}
      </p>

      <p className="font-body text-[10px] tracking-widest uppercase text-gold mt-5">
        {HERO_EYEBROW[hero.slot]}
      </p>
      <p className="font-display text-headline-md text-cream leading-snug mt-1">
        {hero.name}
      </p>
      <p className="font-body text-label-sm text-cream/60 mt-1">
        {hero.calories} cal · {hero.protein}g · fits your day
      </p>

      <button
        type="button"
        onClick={lock}
        disabled={pending}
        className="mt-6 w-full bg-gold text-charcoal py-4 rounded-full font-body text-label-md tracking-widest uppercase active:scale-95 disabled:opacity-50 transition-all"
      >
        {pending ? "One sec…" : "Lock it in"}
      </button>

      <Link
        href="/plan"
        className="mt-3 font-body text-label-sm text-cream/70 active:opacity-70"
      >
        Swap · Eating out · See full day
      </Link>
    </section>
  );
}

/* ── Eat: close the loop ─────────────────────────────────────────────── */
function EatFocus({ hero }: { hero: HomeHero }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function ate() {
    startTransition(async () => {
      await ateDaySlotAction({ slot: hero.slot });
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Did you eat it"
      className="rounded-2xl bg-charcoal px-gutter py-7 flex flex-col items-center text-center"
    >
      <Avatar />
      <p className="font-display text-headline-md text-cream leading-snug max-w-xs">
        You locked in {hero.name.toLowerCase()}. Did you eat it?
      </p>

      <button
        type="button"
        onClick={ate}
        disabled={pending}
        className="mt-6 w-full bg-gold text-charcoal py-4 rounded-full font-body text-label-md tracking-widest uppercase active:scale-95 disabled:opacity-50 transition-all"
      >
        {pending ? "Logging…" : "I ate it — log it"}
      </button>

      <Link
        href="/log"
        className="mt-3 font-body text-label-sm text-cream/70 active:opacity-70"
      >
        Ate something else
      </Link>
    </section>
  );
}

/* ── Done: a calm close ──────────────────────────────────────────────── */
function DoneFocus({ firstName }: { firstName: string }) {
  return (
    <section
      aria-label="Done for today"
      className="rounded-2xl bg-tertiary-container/70 px-gutter py-8 flex flex-col items-center text-center"
    >
      <Avatar gold />
      <p className="font-display text-headline-md text-charcoal leading-snug max-w-xs">
        You&apos;re done for today, {firstName}. Everything&apos;s in.
      </p>
      <p className="font-body text-body-md text-on-surface-variant mt-2">
        Same time tomorrow. Steady wins.
      </p>
    </section>
  );
}

/* ── Quiet numbers — always there, never shouting ────────────────────── */
function QuietStats({ numbers }: { numbers: HomeNumbers }) {
  const [open, setOpen] = useState(false);
  const n = numbers;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full rounded-xl bg-surface-container-lowest border border-outline-variant/50 px-4 py-3 flex items-center justify-between active:scale-[0.99] transition-transform"
      >
        <span className="flex gap-4 font-body text-label-md text-charcoal">
          <span>
            <span className="text-on-surface-variant">cal </span>
            {n.calories.toLocaleString()}
          </span>
          <span>
            <span className="text-on-surface-variant">protein </span>
            {n.protein}g
          </span>
          <span>
            <span className="text-on-surface-variant">steps </span>
            {formatK(n.steps)}
          </span>
        </span>
        <span
          aria-hidden
          className="material-symbols-outlined text-[20px] text-on-surface-variant/70"
        >
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <Bar label="Calories" value={n.calories} target={n.calorieTarget} />
          <Bar label="Protein" value={n.protein} target={n.proteinFloor} unit="g" requireHit />
          <Bar label="Steps" value={n.steps} target={n.stepGoal} />
          <Link
            href="/log"
            className="block w-full text-center bg-transparent text-charcoal border border-charcoal/70 py-2.5 rounded-full font-body text-label-sm tracking-widest uppercase active:scale-95 transition-all"
          >
            Log a meal
          </Link>
        </div>
      )}
    </div>
  );
}

function Bar({
  label,
  value,
  target,
  unit = "",
  requireHit,
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
  requireHit?: boolean;
}) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const over = !requireHit && value > target;
  const met = requireHit && value >= target;
  const fill = over ? "bg-soft-red" : met ? "bg-sage" : "bg-charcoal";
  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/50 px-4 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="font-body text-label-sm tracking-wide uppercase text-on-surface-variant">
          {label}
        </span>
        <span className="font-body text-label-sm text-charcoal">
          {value.toLocaleString()}
          {unit} / {target.toLocaleString()}
          {unit}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function formatK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
