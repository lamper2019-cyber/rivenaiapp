"use client";

import { useState, useTransition, useEffect } from "react";
import type {
  SundayAnswerSummary,
  SundayReactionKind,
} from "@/lib/sunday-ritual";
import { SUNDAY_REACTION_KINDS, SUNDAY_REACTION_LABEL } from "@/lib/sunday-ritual";
import {
  submitSundayAnswer,
  toggleSundayReaction,
} from "@/app/(clerk)/(app)/dashboard/sunday-actions";

/**
 * Sunday ritual surface for /dashboard. Renders the week's question, an
 * answer composer if she hasn't answered yet, her current answer if she
 * has, and every other answer in the room with reactions.
 *
 * Outside Sunday Central time, the component is mounted in replay-only
 * mode — submit and react buttons disabled, with a gentle inline note.
 */
export function SundayRitual({
  promptId,
  question,
  myAnswer,
  others,
  isOpen,
}: {
  promptId: string;
  question: string;
  myAnswer: { id: string; body: string } | null;
  others: SundayAnswerSummary[];
  isOpen: boolean;
}) {
  const [draft, setDraft] = useState(myAnswer?.body ?? "");
  const [editing, setEditing] = useState(myAnswer === null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // If the snapshot updates (e.g. revalidate after a different action),
  // keep the draft in sync when not actively editing.
  useEffect(() => {
    if (!editing) setDraft(myAnswer?.body ?? "");
  }, [myAnswer?.body, editing]);

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await submitSundayAnswer({ promptId, body: draft });
      if (!r.ok) setError(r.error);
      else setEditing(false);
    });
  }

  const visibleOthers = others.filter((o) => !o.isMine);

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

        {/* My answer block */}
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => {
                setError(null);
                setDraft(e.target.value);
              }}
              disabled={!isOpen || pending}
              rows={3}
              maxLength={2000}
              placeholder="Drop a short answer — doesn't have to be long."
              className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/60 focus:border-charcoal focus:outline-none disabled:opacity-50 transition-colors"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={save}
                disabled={!isOpen || pending || draft.trim().length === 0}
                className="bg-charcoal text-cream px-5 py-2 rounded-full font-body text-label-sm tracking-widest uppercase shadow-elevation-1 hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
              >
                {pending ? "Saving…" : myAnswer ? "Update" : "Share"}
              </button>
              {myAnswer && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft(myAnswer.body);
                  }}
                  className="font-body text-label-md tracking-wide text-on-surface-variant hover:text-charcoal transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
            {error && (
              <p className="font-body text-label-sm text-soft-red">{error}</p>
            )}
          </div>
        ) : (
          <div className="rounded-md bg-cream/60 border border-outline-variant/40 px-3 py-3">
            <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant mb-1">
              You · this Sunday
            </p>
            <p className="font-body text-body-md text-charcoal whitespace-pre-wrap leading-relaxed">
              {myAnswer?.body}
            </p>
            {isOpen && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="font-body text-label-sm text-on-surface-variant/80 hover:text-charcoal underline underline-offset-4 mt-2 transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Others' answers */}
      {visibleOthers.length > 0 && (
        <ul className="space-y-3">
          {visibleOthers.map((a) => (
            <li key={a.id}>
              <AnswerCard answer={a} isOpen={isOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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
        // Roll back optimistic update
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
