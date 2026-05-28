"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendToSean } from "@/app/(clerk)/(app)/chat/sean-actions";

/**
 * Compact "Message from Sean" bubble — sits below the greeting on
 * /dashboard. Replaces both the old `SeanPromptHeadline` headline
 * treatment and the daily mood ribbon.
 *
 * Modes:
 *   1. Unanswered chip-prompt
 *      → bubble shows Sean's message + tap chips. Tap fires
 *      sendToSean, persists her response, shows an encouraging
 *      one-liner ("Locked in. I'll look at it."), then collapses
 *      the chips. Bubble stays visible until her next visit.
 *   2. Already-answered or no chips
 *      → bubble shows Sean's message; whole bubble is a Link to
 *      /chat so she can read the thread / type a reply.
 *   3. Voice memo (audioUrl set)
 *      → bubble shows the "play / listen" hint and routes to /chat
 *      where the inline audio player lives.
 *
 * Whole bubble is tappable (Link wrapping) when there are no
 * unanswered chips. With unanswered chips, only the chip buttons
 * are clickable so a tap doesn't accidentally route away mid-decision.
 */
export function MessageFromSeanBubble({
  prompt,
}: {
  prompt: {
    id: string;
    content: string;
    chips: Array<{ label: string; value: string }>;
    chipsRepliedAt: string | null;
    audioUrl: string | null;
    audioDurationSec: number | null;
    createdAt: string;
  };
}) {
  const router = useRouter();
  const [chipsRepliedLocal, setChipsRepliedLocal] = useState<boolean>(
    !!prompt.chipsRepliedAt,
  );
  // The encouraging-word state after she taps a chip. Shows for ~2.5s
  // then we router.refresh() so the bubble disappears entirely (data
  // is now "already answered" + below the new-message threshold the
  // dashboard parent won't even render the card).
  const [justSentMessage, setJustSentMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasUnansweredChips =
    prompt.chips.length > 0 && !chipsRepliedLocal;

  function handleTap(value: string) {
    setChipsRepliedLocal(true);
    setJustSentMessage(pickEncouragement());
    startTransition(async () => {
      const r = await sendToSean({
        message: value,
        imageUrls: [],
        chipMessageId: prompt.id,
      });
      if (!r.ok) {
        setError(r.error);
        setChipsRepliedLocal(false);
        setJustSentMessage(null);
        return;
      }
      // Hold the encouraging word on screen for ~2.5s before refreshing.
      setTimeout(() => router.refresh(), 2500);
    });
  }

  const body = (
    <div className="flex gap-3 items-start">
      <span
        className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gold/20 border border-gold/40 shrink-0 mt-0.5"
        aria-hidden
      >
        <span className="font-display text-headline-sm text-charcoal leading-none">
          S
        </span>
      </span>
      <div className="flex-1 min-w-0 space-y-2">
        <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
          Message from Sean
        </p>
        {justSentMessage ? (
          <p className="font-display text-headline-sm text-charcoal text-balance leading-snug">
            {justSentMessage}
          </p>
        ) : (
          <p className="font-display text-headline-sm text-charcoal text-balance leading-snug">
            {prompt.audioUrl && !hasUnansweredChips
              ? "Sent you a voice memo — tap to listen."
              : prompt.content}
          </p>
        )}

        {hasUnansweredChips && !justSentMessage && (
          <div className="flex flex-wrap gap-2 pt-1">
            {prompt.chips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleTap(chip.value);
                }}
                disabled={pending}
                className="inline-flex items-center px-4 py-2 rounded-full bg-cream border border-charcoal/40 font-body text-label-sm text-charcoal hover:border-charcoal hover:bg-surface-container active:scale-95 transition-all disabled:opacity-50"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="font-body text-label-sm text-soft-red">{error}</p>
        )}
      </div>
    </div>
  );

  // Only wrap in Link when there are no unanswered chips — otherwise
  // a stray tap on the bubble body could route away mid-decision.
  if (hasUnansweredChips || justSentMessage) {
    return (
      <section
        aria-label="Message from Sean"
        className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-4 shadow-elevation-1"
      >
        {body}
      </section>
    );
  }

  return (
    <Link
      href="/chat"
      aria-label="Open conversation with Sean"
      className="block rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-4 shadow-elevation-1 hover:bg-secondary-container/55 active:scale-[0.99] transition-all"
    >
      {body}
    </Link>
  );
}

/**
 * Pick a Sean-voice encouraging one-liner after a chip tap. Deterministic
 * shuffle on each call (not on (user, day) like other surfaces) because
 * the encouragement is shown for ~2.5s before the bubble refreshes away
 * — repeats across taps are fine and feel natural.
 */
function pickEncouragement(): string {
  const lines = [
    "Locked in. I'll look at it.",
    "Got it. I'll catch up on you later today.",
    "That's data. I'll see you in the dashboard.",
    "Heard. I'll come back to this.",
    "Logged. I'll check in on you.",
    "Real talk noted. I'll see this.",
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}
