"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendToSean } from "@/app/(clerk)/(app)/chat/sean-actions";

/**
 * "Today with RIVEN" — the top of /dashboard.
 *
 * As of 2026-05-27 this is the ONLY surface for RIVEN's coaching. The
 * old /chat thread is retired (redirects to /dashboard), the bottom-
 * input is gone, and the AI auto-reply scheduler is shut off. RIVEN
 * pings 3x/day via crons; she answers with chip taps and that's it.
 *
 * Three render modes based on the latest COACH ChatMessage in the
 * last 24h:
 *
 *   1. Unanswered chip-prompt (chipOptions set + chipsRepliedAt null)
 *      → Render RIVEN's question + tap chips. Tap collapses chips
 *      locally + fires sendToSean.
 *
 *   2. Voice memo (audioUrl set)
 *      → Render an inline HTML5 audio player so she listens without
 *      leaving the home screen. No deep-link, no separate page.
 *
 *   3. Plain text or already-answered chips
 *      → Just render RIVEN's words. No reply CTA. After she taps a
 *      chip we briefly show a "Sent. RIVEN will see this." confirmation
 *      so the tap feels acknowledged.
 *
 * If `prompt` is null, the parent renders the time-aware ritual card
 * instead — see /dashboard.
 *
 * The card uses the same gold-tinted treatment as the falling-roses
 * welcome banner / Sunday ritual so all "from RIVEN" surfaces share a
 * visual family.
 */
export function SeanPromptHeadline({
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
  // Track whether the local-tap just happened (vs. an older replied
  // state from the DB). Only the just-tapped state shows "Sent.";
  // a stale reply from a previous session is silent.
  const [justSent, setJustSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasUnansweredChips =
    prompt.chips.length > 0 && !chipsRepliedLocal;

  function handleTap(value: string) {
    setChipsRepliedLocal(true);
    setJustSent(true);
    startTransition(async () => {
      const r = await sendToSean({
        message: value,
        imageUrls: [],
        chipMessageId: prompt.id,
      });
      if (!r.ok) {
        setError(r.error);
        setChipsRepliedLocal(false);
        setJustSent(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Today with RIVEN"
      className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-5 shadow-elevation-1 space-y-4"
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gold/20 border border-gold/40 shrink-0"
          aria-hidden
        >
          <span className="font-display text-headline-sm text-charcoal leading-none">
            S
          </span>
        </span>
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Today with RIVEN
        </p>
      </div>

      <p className="font-display text-headline-md text-charcoal text-balance leading-snug">
        {prompt.content}
      </p>

      {prompt.audioUrl && (
        <div className="space-y-1.5">
          {/* Native HTML5 controls — covers play/pause/scrub/volume
              without bringing in a UI library. Tinted to match the
              cream/charcoal palette via the standard browser styling;
              don't fight it, mobile Safari ignores most overrides. */}
          <audio
            src={prompt.audioUrl}
            controls
            preload="metadata"
            className="w-full"
          >
            Your browser doesn&apos;t support audio playback.
          </audio>
          {prompt.audioDurationSec ? (
            <p className="font-body text-label-sm text-on-surface-variant/70">
              {formatDuration(prompt.audioDurationSec)}
            </p>
          ) : null}
        </div>
      )}

      {hasUnansweredChips && (
        <div className="flex flex-wrap gap-2 pt-1">
          {prompt.chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => handleTap(chip.value)}
              disabled={pending}
              className="inline-flex items-center px-4 py-2 rounded-full bg-cream border border-charcoal/40 font-body text-label-sm text-charcoal hover:border-charcoal hover:bg-surface-container active:scale-95 transition-all disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {justSent && (
        <p className="font-body text-label-sm text-sage">
          Sent. RIVEN&apos;ll see this.
        </p>
      )}

      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}
    </section>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
