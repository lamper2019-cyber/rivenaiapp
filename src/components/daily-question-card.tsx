"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { answerDailyQuestionAction } from "@/app/(clerk)/(app)/dashboard/daily-question-actions";
import type { DailyQuestionSnapshot } from "@/lib/daily-question";

/**
 * The Circle's daily question — one component, two faces:
 *
 *   variant="home"   — the HOOK. Lives on /dashboard under the day plan.
 *                      Unanswered: question + one-tap chips. Answered:
 *                      "You said X · N answered → See what the room said"
 *                      — the pull-through that walks her into the Circle.
 *   variant="circle" — the ROOM. Pinned at the top of /circle: the same
 *                      question with everyone's answers listed, names
 *                      attached. Small-room warmth, not a bar chart.
 *
 * Charcoal block — same treatment as the RIVEN morning card the Circle
 * already had; this replaces it as the room's heartbeat.
 */
export function DailyQuestionCard({
  snapshot,
  variant,
}: {
  snapshot: DailyQuestionSnapshot;
  variant: "home" | "circle";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { question, myChoice, myBody } = snapshot;
  const answered = myChoice != null || myBody != null;
  const myLabel =
    myBody ??
    question.options.find((o) => o.key === myChoice)?.label ??
    null;

  function submit(args: { choice?: string; body?: string }) {
    setError(null);
    startTransition(async () => {
      const r = await answerDailyQuestionAction(args);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setWriting(false);
      setText("");
      router.refresh();
    });
  }

  return (
    <section
      aria-label="Today's question from the Circle"
      className="rounded-2xl bg-charcoal px-gutter py-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-full bg-gold font-display text-label-md text-charcoal"
          >
            R
          </span>
          <p className="font-body text-label-sm tracking-widest uppercase text-gold">
            RIVEN asked
          </p>
        </div>
      </div>

      <p className="font-display text-headline-sm text-cream leading-snug">
        {question.question}
      </p>

      {!answered ? (
        <>
          {writing ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={280}
                placeholder="Say it your way…"
                className="w-full resize-none rounded-xl border border-cream/20 bg-cream/10 px-3 py-2.5 font-body text-body-md text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setWriting(false)}
                  className="font-body text-label-sm text-cream/60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!text.trim() || pending}
                  onClick={() => submit({ body: text })}
                  className="rounded-full bg-gold px-5 py-2 font-body text-label-sm tracking-widest uppercase text-charcoal disabled:opacity-40 active:scale-95 transition-transform"
                >
                  {pending ? "Sending…" : "Answer"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {question.options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  disabled={pending}
                  onClick={() => submit({ choice: o.key })}
                  className="rounded-full border border-cream/30 px-4 py-2 font-body text-label-md text-cream active:scale-95 transition-transform disabled:opacity-50"
                >
                  {o.label}
                </button>
              ))}
              <button
                type="button"
                disabled={pending}
                onClick={() => setWriting(true)}
                className="rounded-full border border-dashed border-cream/30 px-4 py-2 font-body text-label-md text-cream/70 active:scale-95 transition-transform disabled:opacity-50"
              >
                Mine…
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="font-body text-body-md text-cream/90">
          You said: <span className="text-gold">{myLabel}</span>
        </p>
      )}

      {/* HOME: answering pulls her into the Circle. CIRCLE: RIVEN answers
          her back — a quiet one-on-one, not a public vote. */}
      {variant === "home" ? (
        answered && (
          <Link
            href="/circle"
            className="block w-full rounded-full bg-gold py-3 text-center font-body text-label-md tracking-widest uppercase text-charcoal active:scale-95 transition-transform"
          >
            Take it to the Circle →
          </Link>
        )
      ) : (
        answered && (
          <div className="flex items-start gap-2.5 border-t border-cream/15 pt-3">
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold font-display text-label-md text-charcoal"
            >
              R
            </span>
            <p className="font-body text-body-md text-cream/90 leading-snug pt-0.5">
              Noted — that&apos;s you staying the course. Steady wins.
            </p>
          </div>
        )
      )}

      {error && <p className="font-body text-label-sm text-soft-red">{error}</p>}
    </section>
  );
}
