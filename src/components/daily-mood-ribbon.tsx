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
 * One-tap-a-day community pulse. The flow:
 *
 *   1. Buttons visible → she taps.
 *   2. Tapped emoji clones and floats up (~900ms, fades out).
 *   3. Ribbon collapses, replaced by one Sean-voice coaching line
 *      matched to the mood she picked. That line is "her reward" for
 *      tapping — feels like she's been seen, not just measured.
 *
 * If she opens the dashboard later in the day after already tapping,
 * the buttons are gone — she sees the same coaching line directly.
 * The line is deterministic per (user, day, mood) so it doesn't
 * shuffle between visits.
 *
 * Reduced-motion users get the same swap with no float animation.
 */
export function DailyMoodRibbon({
  snapshot,
  coachLine,
}: {
  snapshot: DailyMoodSnapshot;
  // Server picks the line (uses userId + day for determinism). Passed
  // in pre-resolved so the surface doesn't shuffle on every render.
  // Keyed by mood so we can show the right one after a tap without
  // a round-trip.
  coachLine: Record<MoodKind, string>;
}) {
  const [myMood, setLocal] = useState<MoodKind | null>(snapshot.myMood);
  const [, startTransition] = useTransition();
  // Each tap fires a float-up animation with a fresh React key so even
  // re-taps re-trigger. Cleared after the animation duration.
  const [floats, setFloats] = useState<
    Array<{ id: number; mood: MoodKind; col: number }>
  >([]);

  function handleTap(mood: MoodKind, columnIndex: number) {
    const previous = myMood;
    if (previous === mood) return; // no-op on re-tap of same mood

    // Spawn a floating clone for the visual "send."
    const floatId = Date.now() + Math.random();
    setFloats((prev) => [...prev, { id: floatId, mood, col: columnIndex }]);
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== floatId));
    }, 1000);

    // After ~600ms (when the float is mostly done), collapse the
    // ribbon into the coaching view by setting myMood. We delay so the
    // animation has time to read — instant swap would make it look like
    // the buttons just disappeared.
    window.setTimeout(() => {
      setLocal(mood);
    }, 550);

    startTransition(async () => {
      const r = await setMyMood({ mood });
      if (!r.ok) {
        // Rollback on failure. Rare; network/db hiccup only.
        setLocal(previous);
      }
    });
  }

  // Already tapped (either on this visit or earlier today) → show the
  // coaching surface directly. No buttons, no totals — just Sean's voice.
  if (myMood !== null) {
    return <CoachingSurface mood={myMood} line={coachLine[myMood]} />;
  }

  // Not yet tapped → show the four buttons.
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
        {MOOD_KINDS.map((kind, idx) => (
          <button
            key={kind}
            type="button"
            onClick={() => handleTap(kind, idx)}
            aria-label={MOOD_LABEL[kind]}
            className="relative flex flex-col items-center gap-1 py-3 rounded-md border border-outline-variant/40 bg-transparent transition-all active:scale-95 hover:bg-surface-container/40"
          >
            <span className="text-[26px] leading-none" aria-hidden>
              {MOOD_EMOJI[kind]}
            </span>
            <span className="font-body text-label-sm tracking-wide text-on-surface-variant/70">
              {MOOD_LABEL[kind]}
            </span>

            {/* Float-up clones for this column. Absolute-positioned so
                they don't shift layout while floating up. */}
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

/**
 * The post-tap surface — a single coaching line in Sean's voice,
 * matched to her mood. Replaces the buttons + aggregate sentence
 * entirely. Quiet, single block of type, no decoration.
 *
 * Uses the secondary-container background + gold border to signal
 * "this came from Sean" without screaming it.
 */
function CoachingSurface({ mood, line }: { mood: MoodKind; line: string }) {
  return (
    <section
      aria-label="Today's note from Sean"
      className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-5 shadow-elevation-1 riven-rise-in"
    >
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 text-[24px] leading-none mt-0.5"
          aria-hidden
        >
          {MOOD_EMOJI[mood]}
        </span>
        <p className="font-body text-body-md text-charcoal leading-relaxed flex-1 min-w-0">
          {line}
        </p>
      </div>
    </section>
  );
}

