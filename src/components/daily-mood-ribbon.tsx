"use client";

import { useState, useTransition } from "react";
import {
  MOOD_EMOJI,
  MOOD_KINDS,
  MOOD_LABEL,
  type DailyMoodSnapshot,
  type MoodKind,
} from "@/lib/daily-mood";
import { setMyMood } from "@/app/(clerk)/(app)/dashboard/mood-action";

/**
 * One-tap-a-day community pulse. Tap an emoji → her pick highlights,
 * a clone of that emoji floats up and fades (the little reward moment),
 * and the aggregate sentence updates with her vote folded in.
 *
 * Optimistic update: tap → state flips immediately → server action fires
 * in a transition. Re-tapping a different mood updates instead of stacking.
 *
 * Animation: `riven-float-up` keyframe in globals.css. Reduced-motion users
 * get the same state transition with no float — the keyframe is overridden.
 */
export function DailyMoodRibbon({
  snapshot,
}: {
  snapshot: DailyMoodSnapshot;
}) {
  const [myMood, setLocal] = useState<MoodKind | null>(snapshot.myMood);
  const [counts, setCounts] = useState<Record<MoodKind, number>>(snapshot.counts);
  const [, startTransition] = useTransition();
  // Each tap fires a float-up animation with a fresh React key so even
  // re-taps (same mood) re-trigger. Cleared via setTimeout after the
  // animation duration so the DOM stays light.
  const [floats, setFloats] = useState<
    Array<{ id: number; mood: MoodKind; col: number }>
  >([]);

  function handleTap(mood: MoodKind, columnIndex: number) {
    const previous = myMood;
    setLocal(mood);
    setCounts((c) => {
      const next = { ...c };
      if (previous && previous !== mood) {
        next[previous] = Math.max(0, next[previous] - 1);
      }
      if (previous !== mood) {
        next[mood] = next[mood] + 1;
      }
      return next;
    });

    // Spawn a floating clone. ID is just monotonically increasing — uses
    // Date.now so two taps in the same frame still get unique keys.
    const floatId = Date.now() + Math.random();
    setFloats((prev) => [...prev, { id: floatId, mood, col: columnIndex }]);
    // Clean up after the animation finishes (matches the 900ms in CSS,
    // with a tiny buffer).
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== floatId));
    }, 1000);

    startTransition(async () => {
      const r = await setMyMood({ mood });
      if (!r.ok) {
        // Rollback on failure. Rare; network/db hiccup only.
        setLocal(previous);
        setCounts(snapshot.counts);
      }
    });
  }

  const totalAfterTap =
    Object.values(counts).reduce((sum, n) => sum + n, 0) || 0;

  // Find the top mood from the live (optimistic) counts so the aggregate
  // sentence updates with her tap.
  let liveTop: MoodKind | null = null;
  let liveTopCount = 0;
  for (const k of MOOD_KINDS) {
    if (counts[k] > liveTopCount) {
      liveTopCount = counts[k];
      liveTop = k;
    }
  }

  const aggregateSentence = (() => {
    if (totalAfterTap === 0) return "Be the first to check in today.";
    if (!liveTop) return null;
    const noun = liveTopCount === 1 ? "woman" : "women";
    return `${liveTopCount} ${noun} logged ${MOOD_EMOJI[liveTop]} ${MOOD_LABEL[liveTop]} today.`;
  })();

  return (
    <section
      aria-label="Daily mood ribbon"
      className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-4 shadow-elevation-1"
    >
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        How&apos;s your day going?
      </p>

      {/* Relative wrapper so the floating clones can absolute-position
          relative to each column. */}
      <div className="mt-3 grid grid-cols-4 gap-2 relative">
        {MOOD_KINDS.map((kind, idx) => {
          const isMine = myMood === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => handleTap(kind, idx)}
              aria-pressed={isMine}
              aria-label={MOOD_LABEL[kind]}
              className={`relative flex flex-col items-center gap-1 py-3 rounded-md border transition-all active:scale-95 ${
                isMine
                  ? "bg-secondary-container/60 border-gold/60 shadow-elevation-1"
                  : "bg-transparent border-outline-variant/40 hover:bg-surface-container/40"
              }`}
            >
              <span className="text-[26px] leading-none" aria-hidden>
                {MOOD_EMOJI[kind]}
              </span>
              <span
                className={`font-body text-label-sm tracking-wide ${
                  isMine ? "text-charcoal" : "text-on-surface-variant/70"
                }`}
              >
                {MOOD_LABEL[kind]}
              </span>

              {/* Float-up clones for this column. Absolute-positioned so
                  they don't shift layout while floating up. Each clone
                  unmounts itself after the keyframe via the parent's
                  setTimeout cleanup. */}
              {floats
                .filter((f) => f.col === idx)
                .map((f) => (
                  <span
                    key={f.id}
                    aria-hidden
                    className="riven-float-up absolute left-1/2 top-3 -translate-x-1/2 text-[28px] leading-none"
                  >
                    {MOOD_EMOJI[f.mood]}
                  </span>
                ))}
            </button>
          );
        })}
      </div>

      {aggregateSentence && (
        <p className="mt-3 font-body text-label-sm text-on-surface-variant/80">
          {aggregateSentence}
        </p>
      )}
    </section>
  );
}
