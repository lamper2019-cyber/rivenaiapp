"use client";

import { useState, useTransition } from "react";
import { generatePostIdeas, type IdeasResult, type PostIdea } from "./actions";

/**
 * "What to post next" — generates shootable briefs (hook + what to film + how
 * to record it + on-screen text), seeded by RIVEN's best-reaching posts, in
 * his voice. Lives in the command-center right rail.
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
        <div className="space-y-3 pt-1">
          {result.ideas.map((idea, i) => (
            <IdeaCard key={i} idea={idea} />
          ))}
        </div>
      ) : result && !result.ok ? (
        <p className="font-body text-label-md text-soft-red">{result.error}</p>
      ) : (
        <p className="font-body text-label-md text-on-surface-variant">
          Seeded by your best-reaching posts. Tap for 3 shootable briefs — hook,
          what to film, how to shoot it, and the on-screen text.
        </p>
      )}
    </section>
  );
}

function IdeaCard({ idea }: { idea: PostIdea }) {
  return (
    <div className="rounded-xl border border-outline-variant/40 bg-white/60 px-4 py-3.5 space-y-2.5">
      {/* Hook + format */}
      <div className="flex items-start justify-between gap-2">
        <p className="font-body text-body-md font-semibold text-charcoal flex-1">
          <span className="text-gold">◆</span> {idea.hook}
        </p>
      </div>
      {idea.format ? (
        <span className="inline-block rounded-full bg-surface-container-lowest border border-outline-variant/60 px-2.5 py-0.5 font-body text-[10px] tracking-widest uppercase text-on-surface-variant">
          {idea.format}
        </span>
      ) : null}

      {/* Film */}
      {idea.shotList.length > 0 ? (
        <div>
          <p className="font-body text-[10px] tracking-widest uppercase text-on-surface-variant/70 mb-1">
            🎬 Film
          </p>
          <ul className="space-y-1">
            {idea.shotList.map((s, i) => (
              <li key={i} className="font-body text-label-md text-charcoal flex gap-2">
                <span className="text-on-surface-variant/40">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Record */}
      {idea.setup ? (
        <div>
          <p className="font-body text-[10px] tracking-widest uppercase text-on-surface-variant/70 mb-0.5">
            📱 How to record
          </p>
          <p className="font-body text-label-md text-charcoal">{idea.setup}</p>
        </div>
      ) : null}

      {/* On screen */}
      {idea.onScreen ? (
        <div>
          <p className="font-body text-[10px] tracking-widest uppercase text-on-surface-variant/70 mb-0.5">
            ✍️ On screen
          </p>
          <p className="font-body text-label-md text-charcoal italic">&ldquo;{idea.onScreen}&rdquo;</p>
        </div>
      ) : null}
    </div>
  );
}
