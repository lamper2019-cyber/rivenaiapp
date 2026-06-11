"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MessageCircleQuestion, X, ArrowUp } from "lucide-react";
import { askInsights, type AskTurn } from "./actions";

// Post Lab palette (matches the page).
const C = {
  cream: "#FAF7F2", card: "#FFFFFF", charcoal: "#1A1A1A", gold: "#C9A961",
  sage: "#7C9A7E", red: "#C76B5C", mute: "#8A8378", line: "#E7E0D4",
};

const STARTERS = [
  "What's my best post this month and why?",
  "Where's the biggest leak in my funnel?",
  "Are members actually using the app this week?",
  "What should I double down on?",
];

/**
 * "Ask your data" — floating bubble on /coach/insights. Opens a small chat
 * panel; answers come from askInsights, which feeds Claude the real numbers
 * (posts, funnel, member activity). History lives in component state only.
 */
export function AskData() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, pending, open]);

  function ask(q: string) {
    const question = q.trim();
    if (!question || pending) return;
    setError(null);
    setInput("");
    const history = turns;
    setTurns((t) => [...t, { role: "user", content: question }]);
    startTransition(async () => {
      const r = await askInsights(question, history);
      if (r.ok) {
        setTurns((t) => [...t, { role: "assistant", content: r.answer }]);
      } else {
        setError(r.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask your data"
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 active:scale-95 transition-transform"
        style={{
          background: C.charcoal, color: C.cream, borderRadius: 999,
          padding: "12px 18px", boxShadow: "0 8px 28px rgba(26,26,26,.35)",
        }}
      >
        <MessageCircleQuestion size={18} color={C.gold} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Ask your data</span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-40 flex flex-col"
      style={{
        background: C.card, border: `1px solid ${C.line}`, borderRadius: 20,
        width: "min(420px, calc(100vw - 2rem))", maxHeight: "70vh",
        boxShadow: "0 16px 48px rgba(26,26,26,.25)", marginLeft: "auto",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2">
          <MessageCircleQuestion size={17} color={C.gold} />
          <span className="font-display" style={{ fontSize: 17, color: C.charcoal }}>Ask your data</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close">
          <X size={18} color={C.mute} />
        </button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
        {turns.length === 0 ? (
          <div>
            <p style={{ fontSize: 13, color: C.mute, marginBottom: 10 }}>
              Ask anything about your numbers — posts, funnel, members. Answers come from your real data.
            </p>
            <div className="flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="text-left active:scale-[.99] transition-transform"
                  style={{
                    border: `1px solid ${C.gold}`, background: C.cream, color: C.charcoal,
                    fontSize: 13, padding: "9px 12px", borderRadius: 12,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {turns.map((t, i) => (
              <div
                key={i}
                style={{
                  alignSelf: t.role === "user" ? "flex-end" : "flex-start",
                  background: t.role === "user" ? C.charcoal : C.cream,
                  color: t.role === "user" ? C.cream : C.charcoal,
                  border: t.role === "user" ? "none" : `1px solid ${C.line}`,
                  borderRadius: 14, padding: "10px 13px", maxWidth: "88%",
                  fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap",
                }}
              >
                {t.content}
              </div>
            ))}
            {pending ? (
              <div style={{ alignSelf: "flex-start", color: C.mute, fontSize: 12.5, padding: "4px 2px" }}>
                Reading your numbers…
              </div>
            ) : null}
            {error ? (
              <div style={{ alignSelf: "flex-start", color: C.red, fontSize: 12.5 }}>{error}</div>
            ) : null}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: 12, borderTop: `1px solid ${C.line}` }}>
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="Ask about your data…"
            className="flex-1 resize-none"
            style={{
              border: `1px solid ${C.line}`, background: C.cream, borderRadius: 12,
              padding: "10px 12px", fontSize: 13.5, color: C.charcoal, outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => ask(input)}
            disabled={!input.trim() || pending}
            aria-label="Send"
            className="active:scale-95 transition-transform"
            style={{
              background: input.trim() && !pending ? C.charcoal : C.line,
              color: C.cream, borderRadius: 999, padding: 10,
            }}
          >
            <ArrowUp size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
