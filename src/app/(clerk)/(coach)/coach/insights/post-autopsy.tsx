"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown, ChevronUp, Eye, Bookmark, Clock, Rocket, Sparkles, Lightbulb,
  type LucideIcon,
} from "lucide-react";
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

// Post Lab palette (matches the page).
const C = {
  cream: "#FAF7F2", card: "#FFFFFF", charcoal: "#1A1A1A", gold: "#C9A961",
  sage: "#7C9A7E", red: "#C76B5C", mute: "#8A8378", line: "#E7E0D4",
};
const VERDICT = {
  win: { label: "Winner", color: C.sage },
  ok: { label: "Okay", color: C.gold },
  flop: { label: "Flop", color: C.red },
} as const;

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * One post card in the feed. Collapsed: title + tags + metric row.
 * Expanded: "What worked" (stored vision read) + "Tweak next time" (the
 * one-tap adaptive deep read via generatePostFix — unchanged wiring).
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
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, overflow: "hidden" }}>
      {/* Collapsed header */}
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left" style={{ padding: 18 }}>
        <div className="flex items-center justify-between gap-3">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontSize: 15.5, fontWeight: 700, color: C.charcoal }}>{post.hook}</span>
              <Tag text={v.label} color={v.color} solid />
              {post.contentType ? <Tag text={post.contentType} color={C.mute} /> : null}
            </div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 4 }}>{post.dateLabel}</div>
          </div>
          {open ? <ChevronUp size={20} color={C.mute} /> : <ChevronDown size={20} color={C.mute} />}
        </div>

        <div className="flex" style={{ gap: 22, marginTop: 16 }}>
          <Metric Icon={Eye} label="Reach" value={fmt(post.reach)} />
          <Metric Icon={Clock} label="Watch" value={post.avgWatchSec != null ? `${post.avgWatchSec}s` : "—"} />
          <Metric Icon={Bookmark} label="Saves" value={fmt(post.saved)} hot />
          <Metric Icon={Rocket} label="Trials" value={String(post.trials)} hot={post.trials > 0} />
        </div>
      </button>

      {/* Expanded */}
      {open ? (
        <div style={{ padding: "0 18px 18px" }}>
          {/* What worked */}
          {post.whyItWorks ? (
            <div style={{ background: "#F1F5F1", borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <Sparkles size={15} color={C.sage} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.sage }}>What worked</span>
              </div>
              <p style={{ fontSize: 13.5, color: C.charcoal, lineHeight: 1.5 }}>{post.whyItWorks}</p>
            </div>
          ) : null}

          {/* Tweak next time — the adaptive deep read */}
          <div style={{ background: "#FBF3EF", borderRadius: 14, padding: 16 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <Lightbulb size={15} color={C.red} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.red }}>
                {won ? "Why it won + how to repeat" : "Tweak next time"}
              </span>
            </div>

            {fix?.ok ? (
              <div className="flex flex-col gap-2.5">
                <div>
                  <p style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.mute, fontWeight: 700 }}>
                    {fix.verdict === "win" ? "Why it won" : fix.verdict === "flop" ? "Why it missed" : "The read"}
                  </p>
                  <p style={{ fontSize: 13.5, color: C.charcoal, lineHeight: 1.5, marginTop: 2 }}>{fix.why}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.mute, fontWeight: 700 }}>
                    {fix.verdict === "win" ? "↻ Repeat this" : "→ Redo it like this"}
                  </p>
                  <p style={{ fontSize: 13.5, color: C.charcoal, lineHeight: 1.5, marginTop: 2 }}>{fix.action}</p>
                </div>
              </div>
            ) : fix && !fix.ok ? (
              <p style={{ fontSize: 13, color: C.red }}>{fix.error}</p>
            ) : (
              <>
                {post.flopReason ? (
                  <p style={{ fontSize: 13.5, color: C.charcoal, lineHeight: 1.5, marginBottom: 10 }}>{post.flopReason}</p>
                ) : null}
                <button
                  type="button"
                  onClick={getFix}
                  disabled={isPending}
                  className="active:scale-95 transition-transform"
                  style={{ background: C.charcoal, color: C.cream, fontWeight: 600, fontSize: 12.5, padding: "9px 16px", borderRadius: 999, opacity: isPending ? 0.5 : 1 }}
                >
                  {isPending ? "Reading…" : won ? "Why it won + how to repeat →" : "Why it missed + how to redo →"}
                </button>
              </>
            )}
          </div>

          {post.permalink ? (
            <a href={post.permalink} target="_blank" rel="noopener noreferrer"
              style={{ display: "block", fontSize: 12.5, color: C.mute, marginTop: 12 }}>
              View on Instagram ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Tag({ text, color, solid }: { text: string; color: string; solid?: boolean }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, color: solid ? "#fff" : color,
      background: solid ? color : "transparent", border: `1px solid ${color}`,
      padding: "2px 8px", borderRadius: 999, textTransform: "capitalize",
    }}>{text}</span>
  );
}

function Metric({
  Icon, label, value, hot,
}: {
  Icon: LucideIcon;
  label: string; value: string; hot?: boolean;
}) {
  return (
    <div className="text-center">
      <Icon size={14} color={hot ? C.red : C.mute} style={{ margin: "0 auto" }} />
      <div className="font-display" style={{ fontSize: 18, color: hot ? C.red : C.charcoal, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.mute }}>{label}</div>
    </div>
  );
}
