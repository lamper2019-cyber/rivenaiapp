"use client";

import { useState, useTransition } from "react";
import {
  MOOD_CAUSES,
  MOOD_CAUSE_LABEL,
  MOOD_EMOJI,
  MOOD_KINDS,
  MOOD_LABEL,
  type DailyMoodSnapshot,
  type MoodCause,
  type MoodKind,
} from "@/lib/daily-mood";
import {
  setMyMood,
  setMyMoodCause,
} from "@/app/(clerk)/(app)/dashboard/mood-action";

/**
 * Three-stage flow:
 *
 *   1. Buttons visible → she taps a mood.
 *   2. Tapped emoji floats up (riven-float-up); ribbon collapses; a
 *      Sean-voice coaching line lands matched to the mood. If she
 *      hasn't yet answered the follow-up, three small chip buttons
 *      appear under the line — "What's making it ___? sleep / food /
 *      stress."
 *   3. After she picks a cause (or skips), the chips collapse and the
 *      community poll bars show: a 2-line bar chart of what the room
 *      is feeling today. She sees she's not alone in her shade.
 *
 * Reduced-motion users get the same flow without the float animation.
 */
export function DailyMoodRibbon({
  snapshot,
  coachLine,
}: {
  snapshot: DailyMoodSnapshot;
  // Server picks the line (uses userId + day for determinism). Passed
  // in pre-resolved so the surface doesn't shuffle on every render.
  coachLine: Record<MoodKind, string>;
}) {
  const [myMood, setLocalMood] = useState<MoodKind | null>(snapshot.myMood);
  const [myCause, setLocalCause] = useState<MoodCause | null>(snapshot.myCause);
  // True after she skips the follow-up. Persists for the session so the
  // chips don't re-appear if the snapshot revalidates.
  const [skippedCause, setSkippedCause] = useState(false);
  const [counts, setCounts] = useState<Record<MoodKind, number>>(
    snapshot.counts,
  );
  const [totalTaps, setTotalTaps] = useState(snapshot.totalTaps);
  const [, startTransition] = useTransition();
  const [floats, setFloats] = useState<
    Array<{ id: number; mood: MoodKind; col: number }>
  >([]);

  function handleMoodTap(mood: MoodKind, columnIndex: number) {
    const previous = myMood;
    if (previous === mood) return;

    // Float-up clone for the visual "send."
    const floatId = Date.now() + Math.random();
    setFloats((prev) => [...prev, { id: floatId, mood, col: columnIndex }]);
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== floatId));
    }, 1000);

    // Bump the community poll counts optimistically — she's joining
    // the room so the bars should reflect her tap immediately.
    setCounts((c) => {
      const next = { ...c };
      if (previous && previous !== mood) {
        next[previous] = Math.max(0, next[previous] - 1);
      }
      next[mood] = next[mood] + 1;
      return next;
    });
    if (!previous) setTotalTaps((n) => n + 1);

    // After float settles, swap the buttons out.
    window.setTimeout(() => setLocalMood(mood), 550);
    // Changing mood mid-day clears the cause server-side too.
    setLocalCause(null);
    setSkippedCause(false);

    startTransition(async () => {
      const r = await setMyMood({ mood });
      if (!r.ok) {
        setLocalMood(previous);
        setCounts(snapshot.counts);
        setTotalTaps(snapshot.totalTaps);
      }
    });
  }

  function handleCauseTap(cause: MoodCause) {
    const previous = myCause;
    setLocalCause(cause);
    startTransition(async () => {
      const r = await setMyMoodCause({ cause });
      if (!r.ok) setLocalCause(previous);
    });
  }

  // Pre-tap: four mood buttons + heading.
  if (myMood === null) {
    return (
      <section
        aria-label="Daily mood ribbon"
        className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-4 shadow-elevation-1"
      >
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          How&apos;s your day going?
        </p>

        <div className="mt-3 grid grid-cols-4 gap-2 relative">
          {MOOD_KINDS.map((kind, idx) => (
            <button
              key={kind}
              type="button"
              onClick={() => handleMoodTap(kind, idx)}
              aria-label={MOOD_LABEL[kind]}
              className="relative flex flex-col items-center gap-1 py-3 rounded-md border border-outline-variant/40 bg-transparent transition-all active:scale-95 hover:bg-surface-container/40"
            >
              <span className="text-[26px] leading-none" aria-hidden>
                {MOOD_EMOJI[kind]}
              </span>
              <span className="font-body text-label-sm tracking-wide text-on-surface-variant/70">
                {MOOD_LABEL[kind]}
              </span>

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
          ))}
        </div>
      </section>
    );
  }

  // Post-tap: coach line, optional follow-up chips, then poll bars.
  const showCauseChips = myCause === null && !skippedCause;

  return (
    <section
      aria-label="Today's note from Sean"
      className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-5 shadow-elevation-1 riven-rise-in space-y-4"
    >
      {/* The coach line. */}
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-[24px] leading-none mt-0.5" aria-hidden>
          {MOOD_EMOJI[myMood]}
        </span>
        <p className="font-body text-body-md text-charcoal leading-relaxed flex-1 min-w-0">
          {coachLine[myMood]}
        </p>
      </div>

      {/* Follow-up: what's making it ___? Three soft chip buttons.
          Skips to the poll if she taps "skip." */}
      {showCauseChips && (
        <div className="border-t border-gold/20 pt-3">
          <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant mb-2">
            What&apos;s making it {MOOD_LABEL[myMood]}?
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {MOOD_CAUSES.map((cause) => (
              <button
                key={cause}
                type="button"
                onClick={() => handleCauseTap(cause)}
                className="inline-flex items-center rounded-full bg-surface-container-lowest border border-outline-variant/60 px-4 py-1.5 font-body text-label-sm text-charcoal hover:border-charcoal/40 active:scale-95 transition-all"
              >
                {MOOD_CAUSE_LABEL[cause]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSkippedCause(true)}
              className="inline-flex items-center px-3 py-1.5 font-body text-label-sm text-on-surface-variant/70 hover:text-charcoal transition-colors"
            >
              skip
            </button>
          </div>
        </div>
      )}

      {/* Community poll bars — fires once she's past the follow-up
          (answered or skipped). Shows how the whole active client room
          is feeling today, as a bar chart sorted by current count.
          She's already in the count (optimistic), so this includes her. */}
      {!showCauseChips && (
        <MoodPollBars counts={counts} total={totalTaps} myMood={myMood} />
      )}
    </section>
  );
}

/**
 * Compact bar chart of the four moods sorted by current count. The
 * viewer's own mood gets a gold ring so she can see herself in the data.
 * Bars are filled with charcoal at 12% opacity — quiet, not loud.
 */
function MoodPollBars({
  counts,
  total,
  myMood,
}: {
  counts: Record<MoodKind, number>;
  total: number;
  myMood: MoodKind;
}) {
  if (total === 0) {
    return (
      <p className="font-body text-label-sm text-on-surface-variant/80 border-t border-gold/20 pt-3">
        Be the first to check in today.
      </p>
    );
  }
  // Sort by descending count; tie-breaker = MOOD_KINDS order so it's
  // deterministic across renders.
  const sorted = [...MOOD_KINDS].sort((a, b) => {
    const diff = counts[b] - counts[a];
    if (diff !== 0) return diff;
    return MOOD_KINDS.indexOf(a) - MOOD_KINDS.indexOf(b);
  });
  return (
    <div className="border-t border-gold/20 pt-3 space-y-2">
      <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
        How the room&apos;s feeling
      </p>
      <ul className="space-y-1.5">
        {sorted.map((kind) => {
          const count = counts[kind];
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isMine = myMood === kind;
          return (
            <li key={kind} className="flex items-center gap-3">
              <span className="w-6 text-center text-[18px] leading-none" aria-hidden>
                {MOOD_EMOJI[kind]}
              </span>
              <div className="flex-1 h-2 rounded-full bg-surface-container-lowest overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isMine ? "bg-gold" : "bg-charcoal/30"
                  }`}
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
              </div>
              <span
                className={`font-body text-label-sm tabular-nums ${
                  isMine ? "text-charcoal font-semibold" : "text-on-surface-variant"
                }`}
              >
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
