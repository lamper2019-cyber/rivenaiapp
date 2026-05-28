"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendToSean } from "@/app/(clerk)/(app)/chat/sean-actions";

/**
 * "Today with Sean" — the top of /dashboard.
 *
 * Three render modes based on the latest COACH ChatMessage in the
 * last 24h:
 *
 *   1. Unanswered chip-prompt (chipOptions set + chipsRepliedAt null)
 *      → Render Sean's question + tap chips. Tap collapses chips
 *      locally + fires sendToSean. Same flow as the chips in /chat.
 *
 *   2. Voice memo (audioUrl set)
 *      → Render an "open thread" CTA. The actual audio player lives
 *      in /chat; the headline just announces it.
 *
 *   3. Plain text (no chips, no audio, OR chips already tapped)
 *      → Render Sean's words as a quoted preview + "Reply →" link.
 *
 * If `prompt` is null, the parent renders the time-aware ritual card
 * instead — see /dashboard.
 *
 * The card uses the same gold-tinted treatment as the falling-roses
 * welcome banner / Sunday ritual so all "from Sean" surfaces share a
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasUnansweredChips =
    prompt.chips.length > 0 && !chipsRepliedLocal;

  function handleTap(value: string) {
    setChipsRepliedLocal(true);
    startTransition(async () => {
      const r = await sendToSean({
        message: value,
        imageUrls: [],
        chipMessageId: prompt.id,
      });
      if (!r.ok) {
        setError(r.error);
        setChipsRepliedLocal(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Today with Sean"
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
          Today with Sean
        </p>
      </div>

      <p className="font-display text-headline-md text-charcoal text-balance leading-snug">
        {prompt.content}
      </p>

      {prompt.audioUrl && !hasUnansweredChips && (
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 bg-charcoal text-cream px-5 py-2.5 rounded-full font-body text-label-sm tracking-widest uppercase shadow-elevation-1 hover:opacity-90 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden>
            play_arrow
          </span>
          Listen
        </Link>
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

      {!hasUnansweredChips && !prompt.audioUrl && (
        <Link
          href="/chat"
          className="inline-flex items-center gap-1 font-body text-label-md tracking-wide text-charcoal hover:opacity-70 transition-opacity"
        >
          {chipsRepliedLocal && prompt.chips.length > 0 ? "Open thread" : "Reply"}
          <span aria-hidden>→</span>
        </Link>
      )}

      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}
    </section>
  );
}
