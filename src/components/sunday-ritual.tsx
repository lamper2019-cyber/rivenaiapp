"use client";

import { useState, useTransition } from "react";
import type {
  SundayAnswerSummary,
  SundayPromptKind,
  SundayPromptOption,
  SundayReactionKind,
} from "@/lib/sunday-ritual";
import {
  SUNDAY_REACTION_KINDS,
  SUNDAY_REACTION_LABEL,
} from "@/lib/sunday-ritual";
import {
  tapSundayChoice,
  toggleSundayReaction,
} from "@/app/(clerk)/(app)/dashboard/sunday-actions";

/**
 * Sunday ritual surface for /dashboard. Four formats live here:
 *
 *   - pulse        — 3 tap options, bar chart fills with the group's split
 *   - this_or_that — 2 side-by-side cards, percentages reveal after pick
 *   - is_this_you  — 1 relatable line + 3 confession-style reactions
 *   - open         — legacy free-text replay (historical prompts only)
 *
 * All tap formats use the same flow: tap → optimistic tally update →
 * tapSundayChoice fires in a transition. Off-Sunday, taps are disabled
 * and the surface shows aggregate state in replay mode.
 */
export function SundayRitual({
  promptId,
  question,
  kind,
  options,
  tally: initialTally,
  myChoice: initialChoice,
  totalTaps: initialTotal,
  myAnswer,
  others,
  isOpen,
}: {
  promptId: string;
  question: string;
  kind: SundayPromptKind;
  options: SundayPromptOption[];
  tally: Record<string, number>;
  myChoice: string | null;
  totalTaps: number;
  myAnswer: { id: string; body: string } | null;
  others: SundayAnswerSummary[];
  isOpen: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Sunday — together
        </p>
        {!isOpen && (
          <p className="font-body text-label-sm text-on-surface-variant/70">
            Replay only · the room is closed
          </p>
        )}
      </div>

      <div className="rounded-md bg-secondary-container/30 border border-gold/40 px-gutter py-5 shadow-elevation-1 space-y-4">
        <p className="font-display text-headline-sm text-charcoal text-balance leading-snug">
          {question}
        </p>

        {kind === "pulse" && (
          <PulsePoll
            promptId={promptId}
            options={options}
            initialTally={initialTally}
            initialChoice={initialChoice}
            initialTotal={initialTotal}
            isOpen={isOpen}
          />
        )}
        {kind === "this_or_that" && (
          <ThisOrThat
            promptId={promptId}
            options={options}
            initialTally={initialTally}
            initialChoice={initialChoice}
            initialTotal={initialTotal}
            isOpen={isOpen}
          />
        )}
        {kind === "is_this_you" && (
          <IsThisYou
            promptId={promptId}
            options={options}
            initialTally={initialTally}
            initialChoice={initialChoice}
            initialTotal={initialTotal}
            isOpen={isOpen}
          />
        )}
        {kind === "open" && <OpenReplay myAnswer={myAnswer} />}
      </div>

      {/* Legacy open-format answers from the room. Tap formats don't render
          a "others" list — the bar chart IS the social proof. */}
      {kind === "open" && others.filter((o) => !o.isMine).length > 0 && (
        <ul className="space-y-3">
          {others
            .filter((o) => !o.isMine)
            .map((a) => (
              <li key={a.id}>
                <AnswerCard answer={a} isOpen={isOpen} />
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Shared optimistic-tap hook used by all three tap formats.       */
/* ────────────────────────────────────────────────────────────── */

function useChoiceTap(
  promptId: string,
  initialTally: Record<string, number>,
  initialChoice: string | null,
  initialTotal: number,
) {
  const [tally, setTally] = useState(initialTally);
  const [myChoice, setMyChoice] = useState<string | null>(initialChoice);
  const [total, setTotal] = useState(initialTotal);
  const [, startTransition] = useTransition();

  function tap(choice: string) {
    const previous = myChoice;
    if (previous === choice) return; // no-op
    setMyChoice(choice);
    setTally((t) => {
      const next = { ...t };
      if (previous && next[previous] != null) {
        next[previous] = Math.max(0, next[previous] - 1);
      }
      next[choice] = (next[choice] ?? 0) + 1;
      return next;
    });
    setTotal((n) => (previous ? n : n + 1));

    startTransition(async () => {
      const r = await tapSundayChoice({ promptId, choice });
      if (!r.ok) {
        setMyChoice(previous);
        setTally(initialTally);
        setTotal(initialTotal);
      }
    });
  }

  return { tally, myChoice, total, tap };
}

/* ────────────────────────────────────────────────────────────── */
/* Format 1 — Pulse poll: vertical-stacked option bars             */
/* ────────────────────────────────────────────────────────────── */

function PulsePoll({
  promptId,
  options,
  initialTally,
  initialChoice,
  initialTotal,
  isOpen,
}: {
  promptId: string;
  options: SundayPromptOption[];
  initialTally: Record<string, number>;
  initialChoice: string | null;
  initialTotal: number;
  isOpen: boolean;
}) {
  const { tally, myChoice, total, tap } = useChoiceTap(
    promptId,
    initialTally,
    initialChoice,
    initialTotal,
  );

  return (
    <div className="space-y-2.5">
      {options.map((opt) => {
        const count = tally[opt.key] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const isMine = myChoice === opt.key;
        const showStats = myChoice !== null;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => tap(opt.key)}
            disabled={!isOpen}
            aria-pressed={isMine}
            className={`relative w-full overflow-hidden rounded-md border px-4 py-3 text-left transition-all active:scale-[0.99] disabled:opacity-60 ${
              isMine
                ? "border-charcoal bg-surface-container-lowest"
                : "border-outline-variant/60 bg-surface-container-lowest/80 hover:border-charcoal/40"
            }`}
          >
            {showStats && (
              <div
                className={`absolute inset-y-0 left-0 transition-all ${
                  isMine ? "bg-gold/30" : "bg-charcoal/[0.06]"
                }`}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
            )}
            <div className="relative flex items-center justify-between gap-3">
              <span className="font-body text-body-md text-charcoal">
                {opt.label}
              </span>
              {showStats ? (
                <span className="font-body text-label-sm text-on-surface-variant tabular-nums">
                  {pct}%{isMine && " · you"}
                </span>
              ) : (
                <span className="font-body text-label-sm text-on-surface-variant/60">
                  tap
                </span>
              )}
            </div>
          </button>
        );
      })}
      {myChoice && (
        <p className="font-body text-label-sm text-on-surface-variant/80 pt-1">
          {total === 1
            ? "Just you so far this Sunday."
            : `${total} women have weighed in.`}
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Format 2 — This or that: two side-by-side cards                 */
/* ────────────────────────────────────────────────────────────── */

function ThisOrThat({
  promptId,
  options,
  initialTally,
  initialChoice,
  initialTotal,
  isOpen,
}: {
  promptId: string;
  options: SundayPromptOption[];
  initialTally: Record<string, number>;
  initialChoice: string | null;
  initialTotal: number;
  isOpen: boolean;
}) {
  const { tally, myChoice, total, tap } = useChoiceTap(
    promptId,
    initialTally,
    initialChoice,
    initialTotal,
  );

  if (options.length < 2) {
    return (
      <p className="font-body text-body-md text-on-surface-variant">
        This prompt is missing its two options. RIVEN will fix it shortly.
      </p>
    );
  }

  const [left, right] = options;
  const showStats = myChoice !== null;

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        {[left, right].map((opt) => {
          const count = tally[opt.key] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isMine = myChoice === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => tap(opt.key)}
              disabled={!isOpen}
              aria-pressed={isMine}
              className={`relative flex flex-col items-center justify-center text-center rounded-md border px-4 py-6 min-h-[110px] transition-all active:scale-[0.98] disabled:opacity-60 ${
                isMine
                  ? "border-charcoal bg-secondary-container/50 shadow-elevation-1"
                  : "border-outline-variant/60 bg-surface-container-lowest hover:border-charcoal/40"
              }`}
            >
              <span className="font-display text-headline-sm text-charcoal text-balance leading-tight">
                &ldquo;{opt.label}&rdquo;
              </span>
              {showStats && (
                <span className="font-body text-label-sm text-on-surface-variant mt-2 tabular-nums">
                  {pct}%{isMine && " · you"}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {myChoice && (
        <p className="font-body text-label-sm text-on-surface-variant/80 pt-1">
          {total === 1
            ? "Just you so far this Sunday."
            : `${total} women have picked.`}
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Format 3 — Is this you: confession-style reactions              */
/* ────────────────────────────────────────────────────────────── */

function IsThisYou({
  promptId,
  options,
  initialTally,
  initialChoice,
  initialTotal,
  isOpen,
}: {
  promptId: string;
  options: SundayPromptOption[];
  initialTally: Record<string, number>;
  initialChoice: string | null;
  initialTotal: number;
  isOpen: boolean;
}) {
  const { tally, myChoice, total, tap } = useChoiceTap(
    promptId,
    initialTally,
    initialChoice,
    initialTotal,
  );

  return (
    <div className="space-y-2">
      <div className="grid gap-2">
        {options.map((opt) => {
          const count = tally[opt.key] ?? 0;
          const isMine = myChoice === opt.key;
          const showStats = myChoice !== null;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => tap(opt.key)}
              disabled={!isOpen}
              aria-pressed={isMine}
              className={`flex items-center justify-between gap-3 rounded-full border px-5 py-3 text-left transition-all active:scale-[0.98] disabled:opacity-60 ${
                isMine
                  ? "border-charcoal bg-charcoal text-cream"
                  : "border-outline-variant/60 bg-surface-container-lowest text-charcoal hover:border-charcoal/40"
              }`}
            >
              <span className="font-body text-body-md leading-none">
                {opt.label}
              </span>
              {showStats && (
                <span
                  className={`font-body text-label-sm tabular-nums ${
                    isMine ? "text-cream/80" : "text-on-surface-variant"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {myChoice && (
        <p className="font-body text-label-sm text-on-surface-variant/80 pt-1">
          {total === 1
            ? "Just you so far this Sunday."
            : `${total} women have answered.`}
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Format 4 — Open (legacy): read-only replay                      */
/* ────────────────────────────────────────────────────────────── */

function OpenReplay({
  myAnswer,
}: {
  myAnswer: { id: string; body: string } | null;
}) {
  if (!myAnswer) {
    return (
      <p className="font-body text-body-md text-on-surface-variant">
        This is an older written-answer prompt. New formats are tap-only —
        check back next Sunday.
      </p>
    );
  }
  return (
    <div className="rounded-md bg-cream/60 border border-outline-variant/40 px-3 py-3">
      <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant mb-1">
        You · this Sunday
      </p>
      <p className="font-body text-body-md text-charcoal whitespace-pre-wrap leading-relaxed">
        {myAnswer.body}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Open-format community card (legacy reactions on writings)       */
/* ────────────────────────────────────────────────────────────── */

function AnswerCard({
  answer,
  isOpen,
}: {
  answer: SundayAnswerSummary;
  isOpen: boolean;
}) {
  const [optimistic, setOptimistic] = useState({
    counts: answer.reactionCounts,
    mine: answer.myReactions,
  });
  const [pending, startTransition] = useTransition();

  function flip(kind: SundayReactionKind) {
    if (!isOpen || pending) return;
    const wasOn = optimistic.mine[kind];
    setOptimistic((prev) => ({
      counts: {
        ...prev.counts,
        [kind]: Math.max(0, prev.counts[kind] + (wasOn ? -1 : 1)),
      },
      mine: { ...prev.mine, [kind]: !wasOn },
    }));
    startTransition(async () => {
      const r = await toggleSundayReaction({ answerId: answer.id, kind });
      if (!r.ok) {
        setOptimistic({
          counts: answer.reactionCounts,
          mine: answer.myReactions,
        });
      }
    });
  }

  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-3 shadow-elevation-1 space-y-3">
      <div className="space-y-1">
        <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
          {answer.firstName}
        </p>
        <p className="font-body text-body-md text-charcoal whitespace-pre-wrap leading-relaxed">
          {answer.body}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {SUNDAY_REACTION_KINDS.map((k) => {
          const count = optimistic.counts[k];
          const on = optimistic.mine[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => flip(k)}
              disabled={!isOpen || pending}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-body text-label-sm transition-all active:scale-95 disabled:opacity-50 ${
                on
                  ? "bg-charcoal text-cream"
                  : "bg-surface-container-lowest border border-outline-variant/60 text-charcoal hover:border-charcoal/40"
              }`}
            >
              <span aria-hidden>{SUNDAY_REACTION_LABEL[k]}</span>
              {count > 0 && <span>{count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
