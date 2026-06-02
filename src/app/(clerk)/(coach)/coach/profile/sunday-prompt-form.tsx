"use client";

import { useState, useTransition, useEffect } from "react";
import {
  setSundayPrompt,
  type SetSundayPromptResult,
} from "@/lib/coach-actions";
import {
  DEFAULT_OPTIONS,
  type SundayPromptKind,
  type SundayPromptOption,
} from "@/lib/sunday-ritual";

/**
 * Coach-side editor for this week's Sunday ritual prompt. Lives in
 * /coach/profile → Coaching tools. Three tap-based formats live here:
 *
 *   - pulse:        3 bar-chart options (auto-rotation default)
 *   - this_or_that: 2 competing statements
 *   - is_this_you:  3 confession-style reactions
 *
 * Auto-rotation picks the suggested kind for this week (server-side via
 * pickNextRotationKind); RIVEN can override here. Each kind has sensible
 * default options that pre-fill so RIVEN can ship a prompt with one save.
 */

type TapKind = Exclude<SundayPromptKind, "open">;

const KIND_LABELS: Record<TapKind, string> = {
  pulse: "Pulse poll (3 bars)",
  this_or_that: "This or that (2 cards)",
  is_this_you: "Is this you (3 reactions)",
};

const KIND_HELP: Record<TapKind, string> = {
  pulse:
    "She picks one of three vibes; bars fill in with the room's split. Best for 'what got you moving' / 'where's your head' style.",
  this_or_that:
    "Two competing statements, side by side. Best for 'I'll start Monday' vs 'I want it bad enough'.",
  is_this_you:
    "One relatable line + three confession reactions. Best for 'I keep saying I'll start Monday' with 😤 me / 🙏 been there / 🌿 not anymore.",
};

export function SundayPromptForm({
  initialQuestion,
  initialKind,
  initialOptions,
  weekStartLabel,
  suggestedKind,
}: {
  initialQuestion: string;
  initialKind: TapKind | null;
  initialOptions: SundayPromptOption[];
  weekStartLabel: string;
  suggestedKind: TapKind;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [kind, setKind] = useState<TapKind>(initialKind ?? suggestedKind);
  const [options, setOptions] = useState<SundayPromptOption[]>(
    initialOptions.length > 0 ? initialOptions : DEFAULT_OPTIONS[initialKind ?? suggestedKind],
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SetSundayPromptResult | null>(null);

  // When kind changes (and the current options were the defaults for the
  // previous kind), reseed with this kind's defaults. If RIVEN has typed
  // custom options we keep them — only reseed when the count is wrong
  // for the new format.
  useEffect(() => {
    const expected = kind === "this_or_that" ? 2 : 3;
    if (options.length !== expected) {
      setOptions(DEFAULT_OPTIONS[kind]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  function updateOptionLabel(idx: number, label: string) {
    setOptions((prev) =>
      prev.map((o, i) =>
        i === idx
          ? {
              // Auto-derive a snake-case key from the label so RIVEN doesn't
              // have to think about it. Keys feed the tally column.
              key: label
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "")
                .slice(0, 64) || `opt_${i + 1}`,
              label,
            }
          : o,
      ),
    );
  }

  function save() {
    setResult(null);
    const fd = new FormData();
    fd.set("question", question);
    fd.set("kind", kind);
    fd.set("options", JSON.stringify(options));
    startTransition(async () => {
      const r = await setSundayPrompt(fd);
      setResult(r);
    });
  }

  const canSave =
    question.trim().length > 0 &&
    options.length === (kind === "this_or_that" ? 2 : 3) &&
    options.every((o) => o.label.trim().length > 0);

  return (
    <div className="space-y-4">
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
        She taps one option — no writing required. Bars fill in with the
        room&apos;s split so she sees she&apos;s not alone.
      </p>

      {/* Format picker */}
      <div>
        <label className="font-body text-label-md tracking-widest uppercase text-on-surface-variant block mb-2">
          Format
        </label>
        <div className="grid gap-2">
          {(Object.keys(KIND_LABELS) as TapKind[]).map((k) => {
            const isSelected = kind === k;
            const isSuggested = k === suggestedKind && initialKind === null;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`text-left rounded-md border px-4 py-3 transition-all active:scale-[0.99] ${
                  isSelected
                    ? "border-charcoal bg-secondary-container/40"
                    : "border-outline-variant/60 bg-surface-container-lowest hover:border-charcoal/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-body text-body-md text-charcoal">
                    {KIND_LABELS[k]}
                  </span>
                  {isSuggested && (
                    <span className="font-body text-label-sm text-on-surface-variant/70">
                      rotation default
                    </span>
                  )}
                </div>
                <p className="font-body text-label-sm text-on-surface-variant/80 mt-1 leading-snug">
                  {KIND_HELP[k]}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Question */}
      <div>
        <label className="font-body text-label-md tracking-widest uppercase text-on-surface-variant block mb-2">
          Question
        </label>
        <textarea
          value={question}
          onChange={(e) => {
            setResult(null);
            setQuestion(e.target.value);
          }}
          rows={2}
          maxLength={500}
          placeholder="e.g. What got you moving this week?"
          className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/60 focus:border-charcoal focus:outline-none transition-colors"
        />
      </div>

      {/* Options */}
      <div>
        <label className="font-body text-label-md tracking-widest uppercase text-on-surface-variant block mb-2">
          Options ({options.length})
        </label>
        <div className="space-y-2">
          {options.map((opt, idx) => (
            <input
              key={idx}
              type="text"
              value={opt.label}
              onChange={(e) => {
                setResult(null);
                updateOptionLabel(idx, e.target.value);
              }}
              maxLength={200}
              placeholder={`Option ${idx + 1}`}
              className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/60 focus:border-charcoal focus:outline-none transition-colors"
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={pending || !canSave}
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
