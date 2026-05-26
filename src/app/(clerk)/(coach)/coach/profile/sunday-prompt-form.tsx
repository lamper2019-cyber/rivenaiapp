"use client";

import { useState, useTransition } from "react";
import {
  setSundayPrompt,
  type SetSundayPromptResult,
} from "@/lib/coach-actions";

/**
 * Coach-side editor for this week's Sunday ritual prompt. Lives in
 * /coach/profile → Coaching tools. Sean writes a one-line question;
 * clients see it on /dashboard come Sunday.
 *
 * Stateless server-side: the value comes from getCurrentWeekPrompt()
 * in the page component. This form just submits an update.
 */
export function SundayPromptForm({
  initialQuestion,
  weekStartLabel,
}: {
  initialQuestion: string;
  weekStartLabel: string;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SetSundayPromptResult | null>(null);

  function save() {
    setResult(null);
    const fd = new FormData();
    fd.set("question", question);
    startTransition(async () => {
      const r = await setSundayPrompt(fd);
      setResult(r);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="font-display text-headline-sm text-charcoal">
          Sunday prompt
        </h3>
        <p className="font-body text-label-sm text-on-surface-variant">
          Week of {weekStartLabel}
        </p>
      </div>
      <p className="font-body text-body-md text-on-surface-variant leading-relaxed">
        One question every active client sees on her dashboard come Sunday.
        Keep it open-ended — peaceful, no judgment. Editing later in the
        week updates the prompt for everyone.
      </p>
      <textarea
        value={question}
        onChange={(e) => {
          setResult(null);
          setQuestion(e.target.value);
        }}
        rows={3}
        maxLength={500}
        placeholder="e.g. What's one habit that's been kind to you this week?"
        className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/60 focus:border-charcoal focus:outline-none transition-colors"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={pending || question.trim().length === 0}
          className="bg-charcoal text-cream px-5 py-2.5 rounded-full font-body text-label-sm tracking-widest uppercase shadow-elevation-1 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save prompt"}
        </button>
      </div>
      {result?.ok && (
        <p className="font-body text-label-sm text-sage">
          Saved. She&apos;ll see it on Sunday.
        </p>
      )}
      {result && !result.ok && (
        <p className="font-body text-label-sm text-soft-red">{result.error}</p>
      )}
    </div>
  );
}
