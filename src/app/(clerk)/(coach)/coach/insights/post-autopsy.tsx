"use client";

import { useState, useTransition } from "react";
import { generatePostFix, type PostFixResult } from "./actions";

export type AutopsyPost = {
  igId: string;
  hook: string;
  dateLabel: string;
  contentType: string | null;
  verdict: "win" | "ok" | "flop";
  reach: number;
  saved: number;
  avgWatchSec: number | null;
  quizStarts: number;
  trials: number;
  whyItWorks: string | null;
  flopReason: string | null;
  permalink: string | null;
};

const VERDICT = {
  win: { dot: "bg-sage", emoji: "🟢", label: "Winner", text: "text-sage" },
  ok: { dot: "bg-gold", emoji: "🟡", label: "Okay", text: "text-gold" },
  flop: { dot: "bg-soft-red", emoji: "🔴", label: "Flop", text: "text-soft-red" },
} as const;

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * One post in the chronological feed. Collapsed: verdict + hook + metric line.
 * Expanded: the quick vision read + a one-tap deeper analysis that adapts —
 * "why it won / repeat" for winners, "why it missed / redo it like this" for
 * the ones that didn't land.
 */
export function PostAutopsy({ post }: { post: AutopsyPost }) {
  const [open, setOpen] = useState(false);
  const [fix, setFix] = useState<PostFixResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const v = VERDICT[post.verdict];
  const won = post.verdict === "win";

  function getFix() {
    setFix(null);
    startTransition(async () => setFix(await generatePostFix(post.igId)));
  }

  return (
    <div className={`rounded-xl border ${open ? "border-outline-variant/60 bg-white/50" : "border-transparent"}`}>
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 py-3 px-2 text-left"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${v.dot}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="font-body text-body-md text-charcoal truncate">{post.hook}</p>
          <p className="font-body text-[10px] tracking-wide uppercase text-on-surface-variant/70 mt-0.5">
            {post.dateLabel} · {post.contentType ?? "post"} · {fmt(post.reach)} reach
            {post.trials > 0 ? ` · ${post.trials} trial${post.trials === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <span className={`material-symbols-outlined text-on-surface-variant/50 transition-transform ${open ? "rotate-180" : ""}`}>
          expand_more
        </span>
      </button>

      {/* Expanded autopsy */}
      {open ? (
        <div className="px-3 pb-4 pt-1 space-y-3">
          {/* metrics */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <Metric label="Reach" value={fmt(post.reach)} />
            <Metric label="Watch" value={post.avgWatchSec != null ? `${post.avgWatchSec}s` : "—"} />
            <Metric label="Saves" value={fmt(post.saved)} />
            <Metric label="Trials" value={String(post.trials)} gold={post.trials > 0} />
          </div>

          {/* quick stored read */}
          {post.whyItWorks ? (
            <p className="font-body text-label-md text-on-surface-variant italic">
              🧠 {post.whyItWorks}
            </p>
          ) : null}

          {/* the adaptive deep read */}
          {fix?.ok ? (
            <div className="rounded-xl bg-charcoal/[0.03] border border-outline-variant/30 px-4 py-3 space-y-2">
              <div>
                <p className={`font-body text-label-md tracking-widest uppercase ${VERDICT[fix.verdict].text}`}>
                  {fix.verdict === "win" ? "Why it won" : fix.verdict === "flop" ? "Why it missed" : "The read"}
                </p>
                <p className="font-body text-body-md text-charcoal mt-0.5">{fix.why}</p>
              </div>
              <div>
                <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
                  {fix.verdict === "win" ? "↻ Repeat this" : "→ Redo it like this"}
                </p>
                <p className="font-body text-body-md text-charcoal mt-0.5">{fix.action}</p>
              </div>
            </div>
          ) : fix && !fix.ok ? (
            <p className="font-body text-label-md text-soft-red">{fix.error}</p>
          ) : (
            <button
              type="button"
              onClick={getFix}
              disabled={isPending}
              className="rounded-full bg-charcoal text-cream px-4 py-2 font-body text-label-md tracking-widest uppercase transition-all active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {isPending ? (
                <>
                  <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                  Reading…
                </>
              ) : won ? (
                "Why it won + how to repeat →"
              ) : (
                "Why it missed + how to redo →"
              )}
            </button>
          )}

          {post.permalink ? (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-body text-label-md text-on-surface-variant/70 hover:text-gold transition-colors"
            >
              View on Instagram ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, gold = false }: { label: string; value: string; gold?: boolean }) {
  return (
    <div>
      <p className={`font-display text-body-lg ${gold ? "text-gold" : "text-charcoal"}`}>{value}</p>
      <p className="font-body text-[10px] tracking-widest uppercase text-on-surface-variant/60">{label}</p>
    </div>
  );
}
