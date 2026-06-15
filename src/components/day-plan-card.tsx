"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  lockDaySlotAction,
  swapDaySlotAction,
  ateDaySlotAction,
  ateVenueMealAction,
  rateYesterdayDinnerAction,
} from "@/app/(clerk)/(app)/dashboard/day-plan-actions";
import type { DayPlanView, PlanSlotView } from "@/lib/day-plan";
import { VENUES, venueMeals, type MealIdea, type MealSlot } from "@/lib/meal-bank";

/**
 * The day-plan card — "RIVEN already picked your day." Sits on /dashboard
 * between the daily weigh-in and the Today targets.
 *
 * Three faces, one component:
 *   collapsed — ONE decision: the hero slot (tonight, usually) with RIVEN's
 *               one-liner, Lock it in / I ate it, and Swap.
 *   expanded  — the full mapped day: passed slots muted, hero held in gold,
 *               upcoming slots swappable.
 *   eating out — the same card flips to venue chips + the smart order that
 *               fits what's left of her day. "That's what I got" logs it.
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

const OUT_LINK_LABEL: Record<MealSlot, string> = {
  breakfast: "Grabbing breakfast out?",
  lunch: "Eating out for lunch?",
  dinner: "Eating out tonight?",
  snack: "Out somewhere?",
};

export function DayPlanCard({ plan }: { plan: DayPlanView }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"plan" | "out">("plan");
  const [venue, setVenue] = useState<string | null>(null);
  const [orderIdx, setOrderIdx] = useState(0);
  const [whyOpen, setWhyOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hero = plan.slots.find((s) => s.state === "hero") ?? plan.slots[0];

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) {
        setError(r.error ?? "Something went sideways. Try again.");
        return;
      }
      router.refresh();
    });
  }

  const lock = (slot: MealSlot) => run(() => lockDaySlotAction({ slot }));
  const swap = (slot: MealSlot) => run(() => swapDaySlotAction({ slot }));
  const ate = (slot: MealSlot) => run(() => ateDaySlotAction({ slot }));
  const ateOut = (slot: MealSlot, mealId: string) =>
    run(() => ateVenueMealAction({ slot, mealId }));

  // Venue orders ranked against what's actually left of her day: the best
  // order is the biggest one that still FITS (small overshoot tolerated);
  // orders that blow the budget rank by how far over they go.
  const venueOrders = useMemo<MealIdea[]>(() => {
    if (!venue) return [];
    const left = plan.caloriesLeft;
    return [...venueMeals(venue)].sort((a, b) => {
      const over = (m: MealIdea) => Math.max(m.calories - (left + 80), 0);
      const score = (m: MealIdea) =>
        over(m) > 0 ? 100_000 + over(m) * 2 : (left + 80 - m.calories) - m.protein * 3;
      return score(a) - score(b);
    });
  }, [venue, plan.caloriesLeft]);

  const order = venueOrders.length
    ? venueOrders[orderIdx % venueOrders.length]
    : null;

  /* ── Eating-out face ─────────────────────────────────────────────── */
  if (mode === "out") {
    return (
      <section
        aria-label="Eating out — the smart order"
        className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-5 shadow-elevation-1 space-y-4"
      >
        <div className="flex items-baseline justify-between">
          <p className="font-body text-label-md tracking-widest uppercase text-gold">
            Eating out
          </p>
          <p className="font-body text-label-sm text-on-surface-variant">
            {plan.caloriesLeft.toLocaleString()} cal left today
          </p>
        </div>

        <div>
          <p className="font-body text-label-sm text-on-surface-variant mb-2">
            Where are you?
          </p>
          <div className="flex flex-wrap gap-2">
            {VENUES.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setVenue(v.id);
                  setOrderIdx(0);
                }}
                className={`rounded-full px-4 py-2 font-body text-label-sm transition-all active:scale-95 ${
                  venue === v.id
                    ? "bg-charcoal text-cream"
                    : "bg-transparent text-charcoal border border-outline-variant"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {order && (
          <div className="rounded-md bg-surface-container-lowest border border-gold/60 px-gutter py-4 space-y-3">
            <p className="font-body text-label-md tracking-widest uppercase text-gold">
              Get this — it fits
            </p>
            <div>
              <p className="font-display text-headline-sm text-charcoal leading-snug">
                {order.name}
              </p>
              <p className="font-body text-label-sm text-on-surface-variant mt-1">
                {order.detail}
              </p>
              <p className="font-body text-label-sm text-charcoal mt-1">
                ~{order.calories} cal · {order.protein}g protein
                {order.calories <= plan.caloriesLeft + 80
                  ? " · fits what's left"
                  : " · runs over — eat light the rest of the day"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => ateOut(hero.slot, order.id)}
              disabled={pending}
              className="block w-full bg-charcoal text-cream py-3.5 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 disabled:opacity-50 transition-all"
            >
              {pending ? "Logging…" : "That's what I got — log it"}
            </button>
            {venueOrders.length > 1 && (
              <button
                type="button"
                onClick={() => setOrderIdx((i) => i + 1)}
                disabled={pending}
                className="block w-full bg-transparent text-charcoal border border-charcoal/70 py-3 rounded-full font-body text-label-md tracking-widest uppercase active:scale-95 disabled:opacity-50 transition-all"
              >
                Show me another order
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setMode("plan");
            setVenue(null);
          }}
          className="flex w-full items-center justify-center gap-1.5 border-t border-outline-variant/50 pt-3 font-body text-label-md text-on-surface-variant"
        >
          <span aria-hidden className="material-symbols-outlined text-[18px]">
            arrow_back
          </span>
          Back to the plan
        </button>

        {error && <p className="font-body text-label-sm text-soft-red">{error}</p>}
      </section>
    );
  }

  /* ── Plan face (collapsed A / expanded B) ────────────────────────── */
  return (
    <section
      aria-label="Your day, already planned"
      className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-5 shadow-elevation-1 space-y-4"
    >
      {/* The RIVEN moment — the living top of the card. Breathing avatar +
          what RIVEN says + (when there's a real reason) one-tap chips. */}
      <RivenMomentRow
        moment={plan.moment}
        pending={pending}
        whyOpen={whyOpen}
        onWhy={() => setWhyOpen((v) => !v)}
        onRate={(verdict) => {
          if (verdict === "told") {
            // Record it so the moment doesn't re-ask, then open the chat.
            run(() => rateYesterdayDinnerAction({ verdict }));
            router.push("/chat");
            return;
          }
          run(() => rateYesterdayDinnerAction({ verdict }));
        }}
      />

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

        {hero.eaten ? (
          <p className="flex items-center gap-2 font-body text-body-md text-sage">
            <span aria-hidden className="material-symbols-outlined text-sage">
              check_circle
            </span>
            Eaten and logged. Steady wins.
          </p>
        ) : hero.locked ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => ate(hero.slot)}
              disabled={pending}
              className="block w-full bg-charcoal text-cream py-3.5 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 disabled:opacity-50 transition-all"
            >
              {pending ? "Logging…" : "I ate it — log it"}
            </button>
            <Link
              href="/log"
              className="block w-full text-center bg-transparent text-charcoal border border-charcoal/70 py-3 rounded-full font-body text-label-md tracking-widest uppercase active:scale-95 transition-all"
            >
              Ate something else? Log it
            </Link>
          </div>
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

        {/* The quiet third door — different intent entirely: not cooking. */}
        {!hero.eaten && (
          <button
            type="button"
            onClick={() => setMode("out")}
            className="flex w-full items-center justify-center gap-1.5 pt-1 font-body text-label-sm text-charcoal"
          >
            <span aria-hidden className="material-symbols-outlined text-[18px] text-gold">
              restaurant
            </span>
            {OUT_LINK_LABEL[hero.slot]}
            <span aria-hidden className="material-symbols-outlined text-[16px] text-gold">
              arrow_forward
            </span>
          </button>
        )}
      </div>

      {/* Quiet adjustment note — only when the ladder moved today's budget. */}
      {plan.adjust !== "none" && (
        <p className="rounded-md bg-sage/15 border border-sage/40 px-4 py-2.5 font-body text-label-sm text-charcoal/80">
          {plan.adjust === "fast"
            ? "Today's plan runs a little heavier — you're losing fast and we keep it steady."
            : plan.adjust === "flat2"
              ? "Today's plan runs 150 lighter. That's data, not a problem."
              : "Today's plan runs 100 lighter. That's data, not a problem."}
        </p>
      )}

      {/* The expander — A's footer, B's door. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between border-t border-outline-variant/50 pt-3 font-body text-label-md text-charcoal"
      >
        <span>{expanded ? "Just the next meal" : "See your full day"}</span>
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
              onAte={() => ate(s.slot)}
            />
          ))}
        </ul>
      )}

      {error && <p className="font-body text-label-sm text-soft-red">{error}</p>}
    </section>
  );
}

/**
 * The RIVEN moment — the breathing top of the card. The avatar carries the
 * gold breath halo (riven-coach-breath); `line` is what RIVEN says; chips are
 * her one-tap answers (only when there's a real reason). "Why?" reveals the
 * explainer inline; the rest route to real actions via onRate.
 */
function RivenMomentRow({
  moment,
  pending,
  whyOpen,
  onWhy,
  onRate,
}: {
  moment: DayPlanView["moment"];
  pending: boolean;
  whyOpen: boolean;
  onWhy: () => void;
  onRate: (verdict: "good" | "heavy" | "told") => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="riven-coach-breath flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-charcoal font-display text-body-md text-cream"
        >
          R
        </span>
        <p className="font-body text-body-md text-charcoal/90 leading-snug pt-0.5">
          {moment.line}
        </p>
      </div>

      {moment.chips.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-10">
          {moment.chips.map((c) => (
            <button
              key={c.key}
              type="button"
              disabled={pending}
              onClick={() =>
                c.key === "why"
                  ? onWhy()
                  : onRate(
                      c.key === "felt_good"
                        ? "good"
                        : c.key === "too_heavy"
                          ? "heavy"
                          : "told",
                    )
              }
              className={`rounded-full px-4 py-2 font-body text-label-sm tracking-wide transition-transform active:scale-95 disabled:opacity-50 ${
                c.primary
                  ? "bg-charcoal text-cream"
                  : "bg-transparent text-charcoal border border-charcoal/70"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {whyOpen && moment.why && (
        <p className="pl-10 font-body text-label-sm text-on-surface-variant leading-relaxed">
          {moment.why}
        </p>
      )}
    </div>
  );
}

function DaySlotRow({
  row,
  isHero,
  pending,
  onLock,
  onSwap,
  onAte,
}: {
  row: PlanSlotView;
  isHero: boolean;
  pending: boolean;
  onLock: () => void;
  onSwap: () => void;
  onAte: () => void;
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
          {row.eaten
            ? " · eaten + logged"
            : row.logged
              ? " · logged"
              : row.locked
                ? " · locked in"
                : ""}
        </p>
      </div>

      {/* Locked-not-eaten gets the one-tap log; open upcoming slots stay
          lockable + swappable; hero handles its own buttons up top. */}
      {!passed && !row.eaten && !row.logged && (
        <div className="flex shrink-0 items-center gap-1">
          {row.locked ? (
            !isHero && (
              <button
                type="button"
                onClick={onAte}
                disabled={pending}
                aria-label={`Log ${row.meal.name} as eaten`}
                className="rounded-full p-1.5 text-sage active:scale-90 disabled:opacity-40 transition-all"
              >
                <span aria-hidden className="material-symbols-outlined text-[20px]">
                  done_all
                </span>
              </button>
            )
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </li>
  );
}
