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
 * One-tap-a-day community pulse. Before she taps: four emoji buttons.
 * After she taps: her pick highlights, the other counts dim into context.
 * One-line aggregate sentence underneath ("23 women logged 🔥 today")
 * makes the community visible without a separate counter screen.
 *
 * Optimistic update: tap → state flips immediately → server action fires
 * in a transition. Re-tapping a different mood updates instead of stacking.
 */
export function DailyMoodRibbon({
  snapshot,
}: {
  snapshot: DailyMoodSnapshot;
}) {
  const [myMood, setLocal] = useState<MoodKind | null>(snapshot.myMood);
  const [counts, setCounts] = useState<Record<MoodKind, number>>(snapshot.counts);
  const [, startTransition] = useTransition();

  function handleTap(mood: MoodKind) {
    // Optimistic: shift the counts. If she's switching moods, decrement
    // the old bucket; otherwise just bump the new one (first-tap of day).
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
        How&apos;s today landing?
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {MOOD_KINDS.map((kind) => {
          const isMine = myMood === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => handleTap(kind)}
              aria-pressed={isMine}
              aria-label={MOOD_LABEL[kind]}
              className={`flex flex-col items-center gap-1 py-3 rounded-md border transition-all active:scale-95 ${
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
