"use client";

import { useState, useTransition } from "react";
import { generatePostIdeas, type IdeasResult } from "./actions";

/**
 * "What to post next" — one tap generates 3 fresh hook ideas seeded by Sean's
 * best-reaching posts, in his voice. Lives at the bottom of the command center.
 */
export function PostIdeas() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<IdeasResult | null>(null);

  function go() {
    setResult(null);
    startTransition(async () => setResult(await generatePostIdeas()));
  }

  return (
    <section className="rounded-2xl border border-gold/50 bg-gold/[0.06] px-gutter py-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          What to post next
        </p>
        <button
          type="button"
          onClick={go}
          disabled={isPending}
          className="rounded-full bg-charcoal text-cream px-4 py-2 font-body text-label-md tracking-widest uppercase transition-all active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Thinking…" : "Generate ideas"}
        </button>
      </div>

      {result?.ok ? (
        <ul className="space-y-2 pt-1">
          {result.ideas.map((idea, i) => (
            <li key={i} className="flex gap-2 font-body text-body-md text-charcoal">
              <span className="text-gold">◆</span>
              <span>{idea}</span>
            </li>
          ))}
        </ul>
      ) : result && !result.ok ? (
        <p className="font-body text-label-md text-soft-red">{result.error}</p>
      ) : (
        <p className="font-body text-label-md text-on-surface-variant">
          Seeded by your best-reaching hooks. Tap to get 3 in your voice.
        </p>
      )}
    </section>
  );
}
