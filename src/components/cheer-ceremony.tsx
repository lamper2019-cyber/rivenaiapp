"use client";

import { useEffect, useState, useTransition } from "react";
import type { CeremonyRose } from "@/lib/cheer-ceremony";
import { markCheersAsSeen } from "@/app/(clerk)/(app)/dashboard/cheer-action";

/**
 * Falling-roses ceremony. Fires on /dashboard when she opens the app
 * with unseen cheers waiting. Plays a cinematic sequence:
 *
 *   1. Cream-wash overlay covers the dashboard.
 *   2. (First ever only) "These RIVEN women are thinking about you.
 *       They're here with you." Welcome banner stays for ~2.5s.
 *   3. Each rose falls from above, lands mid-screen, sender's first
 *      name fades in beside it ("Tasha is thinking of you"), then
 *      both fade out.
 *   4. If she has 7+ unseen, the 7th+ collapse into one summary line.
 *   5. "Lock it in" button → overlay dismisses → server action bumps
 *      cheersLastSeenAt so the next visit doesn't replay.
 *
 * Tap anywhere mid-sequence → skip to end (still marks as seen).
 *
 * Performance note: the overlay sits on top of /dashboard, not inside
 * any other component. Body scroll is locked while it's mounted so the
 * page beneath doesn't shift around as she tries to dismiss.
 */
export function CheerCeremony({
  roses,
  overflowCount,
  isFirstCeremony,
}: {
  roses: CeremonyRose[];
  overflowCount: number;
  isFirstCeremony: boolean;
}) {
  // Phase machine:
  //   "banner"  → first-ever welcome line (firstCeremony only)
  //   "playing" → roses falling, one at a time
  //   "done"    → "Lock it in" button visible, animations finished
  //   "hidden"  → after she taps "Lock it in", we unmount the overlay
  type Phase = "banner" | "playing" | "done" | "hidden";
  const initialPhase: Phase = isFirstCeremony ? "banner" : "playing";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [, startTransition] = useTransition();

  // Per-rose animation cadence. Should match the keyframe duration in
  // globals.css (riven-rose-fall = 2200ms). Slightly less than the full
  // duration so each rose starts as the previous one is fading out,
  // creating a flowing rhythm instead of a stop-and-start.
  const ROSE_INTERVAL_MS = 2000;
  const BANNER_DURATION_MS = 2800;

  // Lock body scroll while the overlay is mounted. Released on unmount.
  useEffect(() => {
    if (phase === "hidden") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [phase]);

  // Drive the banner → playing transition.
  useEffect(() => {
    if (phase !== "banner") return;
    const t = window.setTimeout(() => setPhase("playing"), BANNER_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Drive the per-rose progression.
  useEffect(() => {
    if (phase !== "playing") return;
    if (currentIdx >= roses.length) {
      // All roses played → move to "done" so the button can render.
      setPhase("done");
      return;
    }
    const t = window.setTimeout(() => {
      setCurrentIdx((idx) => idx + 1);
    }, ROSE_INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [phase, currentIdx, roses.length]);

  function dismiss() {
    setPhase("hidden");
    startTransition(async () => {
      await markCheersAsSeen();
    });
  }

  function skip() {
    // Skip to the end of the animation. Doesn't dismiss — she still
    // gets to read the summary line + tap "Lock it in" deliberately.
    if (phase === "banner" || phase === "playing") {
      setCurrentIdx(roses.length);
      setPhase("done");
    } else if (phase === "done") {
      dismiss();
    }
  }

  if (phase === "hidden") return null;

  // The "currently visible" rose during the playing phase. Keyed by
  // index so React unmounts/remounts the rose element each step,
  // re-triggering the keyframe animation.
  const activeRose =
    phase === "playing" && currentIdx < roses.length
      ? roses[currentIdx]
      : null;

  return (
    <div
      role="dialog"
      aria-label="Roses from your RIVEN sisters"
      onClick={skip}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-container-mobile md:px-container-desktop bg-cream/95 backdrop-blur-sm cursor-pointer"
    >
      {/* First-time welcome banner. Stays for ~2.8s before the rose
          sequence starts. */}
      {phase === "banner" && (
        <div className="text-center max-w-md riven-rise-in">
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-4">
            A first 🌹
          </p>
          <p className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal leading-snug text-balance">
            These RIVEN women are thinking about you.
          </p>
          <p className="font-body text-body-lg text-on-surface-variant mt-4">
            They&apos;re here with you.
          </p>
        </div>
      )}

      {/* Rose-fall stage. Center the rose using a fixed top-half anchor
          so the keyframe's translateY values land predictably. */}
      {phase === "playing" && activeRose && (
        <div
          key={activeRose.id}
          className="relative flex flex-col items-center pointer-events-none"
        >
          <span
            className="riven-rose-fall text-[64px] sm:text-[88px] leading-none"
            aria-hidden
          >
            🌹
          </span>
          <p className="riven-rose-name mt-4 font-display text-headline-md text-charcoal text-center text-balance">
            {activeRose.firstName} is thinking of you.
          </p>
        </div>
      )}

      {/* Done state: summary line + dismiss button. */}
      {phase === "done" && (
        <div className="text-center max-w-md space-y-6 riven-rise-in">
          <div className="text-[56px]" aria-hidden>
            🌹
          </div>
          <p className="font-display text-headline-md text-charcoal text-balance leading-snug">
            {roses.length === 1
              ? "Someone saw you."
              : `${roses.length + overflowCount} women saw you.`}
          </p>
          {overflowCount > 0 && (
            <p className="font-body text-body-md text-on-surface-variant">
              …and {overflowCount} more this week from women you&apos;ll see in
              the room.
            </p>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            className="inline-flex items-center justify-center bg-charcoal text-cream px-8 py-3 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 hover:opacity-90 active:scale-95 transition-all pointer-events-auto"
          >
            Lock it in
          </button>
        </div>
      )}

      {/* "Tap anywhere to skip" hint — small, low-key, only during the
          rose sequence (the welcome banner and the done button each
          have their own dismiss affordance). */}
      {phase === "playing" && (
        <p className="absolute bottom-[max(env(safe-area-inset-bottom),24px)] left-0 right-0 text-center font-body text-label-sm text-on-surface-variant/60">
          tap anywhere to finish
        </p>
      )}
    </div>
  );
}
