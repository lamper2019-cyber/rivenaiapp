"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { submitQuiz } from "../actions";
import { captureEvent } from "@/components/posthog";
import {
  PRACTICE_QUESTIONS,
  Q11,
  Q12,
  Q13,
  Q14,
  type Answers,
  type ChoiceQuestion,
} from "@/lib/quiz";

/**
 * Quiz flow — reordered for conversion (the email gate moved to the END).
 *
 *   step 0     → name only ("What should I call you?") — one friendly field
 *   step 1-10  → practice questions q1..q10 (yes/no, auto-advance)
 *   step 11-13 → multiple-choice qualifying questions (auto-advance)
 *   step 14    → final multiple-choice Q14 (auto-advance → email gate)
 *   step 15    → email + optional phone ("Where do I send your results?")
 *                → "See my results" submits.
 *
 * Why this order: asking for the email FIRST was the drop-off — a real
 * visitor bounced at the old contact gate before answering a thing. The
 * questions build investment (the yes/no's are frictionless momentum; Q11–Q13
 * make her feel seen), so by the time the score exists, the email is the *key*
 * to a result she earned, not a toll at the door. First name stays up front as
 * a low-friction, conversational opener that also lets us greet her by name.
 *
 * State persists to localStorage so a closed tab resumes where she left off.
 * Each step fires a `quiz_step` PostHog event so we can see exactly where
 * people drop off going forward.
 */

type FlowState = {
  step: number;
  contact: { firstName: string; email: string; phone: string };
  answers: Partial<Answers>;
};

const STORAGE_KEY = "riven_quiz_state_v2"; // v2: reordered flow (email at end)
const TOTAL_QUESTIONS = 14;
// Steps: 0 = name, 1..14 = questions, 15 = email gate.
const NAME_STEP = 0;
const FIRST_QUESTION_STEP = 1;
const LAST_QUESTION_STEP = TOTAL_QUESTIONS; // 14
const EMAIL_STEP = TOTAL_QUESTIONS + 1; // 15
const TOTAL_STEPS = EMAIL_STEP + 1; // 16

const DEFAULT_STATE: FlowState = {
  step: 0,
  contact: { firstName: "", email: "", phone: "" },
  answers: {},
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Readable label for the per-step analytics event. */
function stepName(step: number): string {
  if (step === NAME_STEP) return "name";
  if (step === EMAIL_STEP) return "email_gate";
  return `q${step}`;
}

export function QuizFlow({ initialError }: { initialError?: string }) {
  const [state, setState] = useState<FlowState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Hydrate from localStorage so a closed tab resumes where she left off.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FlowState>;
        setState((s) => ({
          ...s,
          ...parsed,
          contact: { ...s.contact, ...(parsed.contact ?? {}) },
          answers: { ...s.answers, ...(parsed.answers ?? {}) },
        }));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private mode */
    }
  }, [state, hydrated]);

  // Per-step drop-off tracking. Fires once we've hydrated (so a resumed flow
  // reports the step she actually lands on, not a flash of step 0).
  useEffect(() => {
    if (!hydrated) return;
    void captureEvent("quiz_step", {
      step: state.step,
      name: stepName(state.step),
    });
  }, [state.step, hydrated]);

  function setContact<K extends keyof FlowState["contact"]>(
    key: K,
    value: string,
  ) {
    setState((s) => ({ ...s, contact: { ...s.contact, [key]: value } }));
  }

  function setAnswer(qid: keyof Answers, value: string) {
    setState((s) => ({ ...s, answers: { ...s.answers, [qid]: value } }));
  }

  function next() {
    setState((s) => ({ ...s, step: Math.min(s.step + 1, TOTAL_STEPS - 1) }));
  }
  function back() {
    setState((s) => ({ ...s, step: Math.max(s.step - 1, 0) }));
  }

  /** Set the answer + auto-advance after a quick beat so she sees the pick land. */
  function selectAndAdvance(qid: keyof Answers, value: string) {
    setAnswer(qid, value);
    window.setTimeout(() => next(), 220);
  }

  const canContinue = useMemo(() => {
    if (state.step === NAME_STEP) {
      return state.contact.firstName.trim().length >= 1;
    }
    if (state.step >= FIRST_QUESTION_STEP && state.step <= 10) {
      return !!state.answers[`q${state.step}` as keyof Answers];
    }
    if (state.step === 11) return !!state.answers.q11;
    if (state.step === 12) return !!state.answers.q12;
    if (state.step === 13) return !!state.answers.q13;
    if (state.step === 14) return !!state.answers.q14;
    if (state.step === EMAIL_STEP) {
      return EMAIL_RX.test(state.contact.email.trim());
    }
    return true;
  }, [state]);

  const isEmailGate = state.step === EMAIL_STEP;

  function handleSubmit() {
    if (!formRef.current) return;
    void captureEvent("quiz_completed");
    const payload = {
      contact: {
        firstName: state.contact.firstName.trim(),
        email: state.contact.email.trim().toLowerCase(),
        phone: state.contact.phone.trim() || undefined,
      },
      answers: {
        ...state.answers,
        // Q15 removed but kept in payload as undefined for schema parity
        // with any stale clients mid-flow during the deploy.
        q15: undefined,
      },
    };
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    startTransition(() => {
      // Clear localStorage before the redirect so re-visiting /quiz/start
      // doesn't auto-resume the flow she just finished.
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      void submitQuiz(fd);
    });
  }

  const progressPct = Math.round((state.step / (TOTAL_STEPS - 1)) * 100);

  const headerLabel =
    state.step === NAME_STEP
      ? "Quick intro"
      : state.step === EMAIL_STEP
        ? "Last step"
        : `Question ${state.step} of ${TOTAL_QUESTIONS}`;

  return (
    <main className="relative min-h-screen flex flex-col px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-8">
      {/* Header — logo + progress */}
      <header className="space-y-4 mb-8">
        <div className="flex justify-between items-center">
          <Link
            href="/quiz"
            className="font-display text-headline-md tracking-[0.2em] text-charcoal"
          >
            RIVEN
          </Link>
          <p className="font-body text-label-sm text-on-surface-variant">
            {headerLabel}
          </p>
        </div>
        <div
          className="h-1 rounded-full bg-outline-variant/40 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
        >
          <div
            className="h-full bg-charcoal transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      {initialError && state.step === EMAIL_STEP && (
        <div className="rounded-md bg-soft-red/10 border border-soft-red/40 px-gutter py-3 mb-6">
          <p className="font-body text-body-md text-charcoal">
            Something didn&apos;t go through. Try again — your answers are saved.
          </p>
        </div>
      )}

      {/* Step content */}
      <section className="flex-1 flex flex-col">
        {state.step === NAME_STEP && (
          <NameStep
            value={state.contact.firstName}
            onChange={(v) => setContact("firstName", v)}
            onContinue={() => canContinue && next()}
          />
        )}

        {state.step >= FIRST_QUESTION_STEP && state.step <= 10 && (
          <PracticeStep
            text={PRACTICE_QUESTIONS[state.step - 1].text}
            value={state.answers[`q${state.step}` as keyof Answers] as
              | "yes"
              | "no"
              | undefined}
            onSelect={(value) =>
              selectAndAdvance(`q${state.step}` as keyof Answers, value)
            }
          />
        )}

        {state.step === 11 && (
          <ChoiceStep
            question={Q11}
            value={state.answers.q11}
            onSelect={(v) => selectAndAdvance("q11", v)}
          />
        )}
        {state.step === 12 && (
          <ChoiceStep
            question={Q12}
            value={state.answers.q12}
            onSelect={(v) => selectAndAdvance("q12", v)}
          />
        )}
        {state.step === 13 && (
          <ChoiceStep
            question={Q13}
            value={state.answers.q13}
            onSelect={(v) => selectAndAdvance("q13", v)}
          />
        )}
        {state.step === LAST_QUESTION_STEP && (
          <ChoiceStep
            question={Q14}
            value={state.answers.q14}
            // Q14 now auto-advances to the email gate (it's no longer the
            // final step — the email ask comes after it).
            onSelect={(v) => selectAndAdvance("q14", v)}
          />
        )}

        {state.step === EMAIL_STEP && (
          <ContactGateStep
            firstName={state.contact.firstName.trim()}
            email={state.contact.email}
            phone={state.contact.phone}
            onChange={setContact}
            onSubmit={() => canContinue && handleSubmit()}
          />
        )}

        {/* Back button sits right under the answer area for any non-zero
            step so she doesn't have to scroll to correct a tap. */}
        {state.step > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={back}
              disabled={pending}
              className="inline-flex items-center gap-1 font-body text-label-md tracking-wide text-on-surface-variant hover:text-charcoal active:scale-95 transition-all py-2 px-1"
            >
              <span aria-hidden>←</span>
              Back
            </button>
          </div>
        )}
      </section>

      {/* Footer — Continue (name step) / See my results (email gate).
          Question steps auto-advance, so they need no footer button. */}
      <footer className="mt-8 space-y-3">
        {/* Hidden form for the submit action. handleSubmit fires it via formRef. */}
        <form ref={formRef} className="hidden" />

        {(state.step === NAME_STEP || isEmailGate) && (
          <button
            type="button"
            onClick={isEmailGate ? handleSubmit : next}
            disabled={!canContinue || pending}
            className="w-full bg-charcoal text-cream py-4 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEmailGate
              ? pending
                ? "Crunching your answers…"
                : "See my results"
              : "Continue"}
          </button>
        )}
      </footer>

      <div className="fixed top-[10%] right-[-10%] w-[35%] h-[35%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

// ─────────────────────────── Step components ───────────────────────────

function NameStep({
  value,
  onChange,
  onContinue,
}: {
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-display-sm md:text-display-md text-charcoal leading-tight text-balance">
          First — what should I call you?
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          So this feels like a conversation, not a form.
        </p>
      </div>

      <Field label="First name">
        <input
          type="text"
          autoComplete="given-name"
          autoCapitalize="words"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onContinue();
            }
          }}
          className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-gutter py-3.5 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none transition-colors"
          placeholder="Your name"
        />
      </Field>
    </div>
  );
}

function ContactGateStep({
  firstName,
  email,
  phone,
  onChange,
  onSubmit,
}: {
  firstName: string;
  email: string;
  phone: string;
  onChange: (k: "firstName" | "email" | "phone", v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-display-sm md:text-display-md text-charcoal leading-tight text-balance">
          {firstName
            ? `Your readiness score is ready, ${firstName}.`
            : "Your readiness score is ready."}
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Where should I send it? No spam — promise.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            value={email}
            onChange={(e) => onChange("email", e.target.value)}
            className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-gutter py-3.5 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none transition-colors"
            placeholder="you@example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
        </Field>

        <Field label="Phone (optional)">
          <input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => onChange("phone", e.target.value)}
            className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-gutter py-3.5 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none transition-colors"
            placeholder="If you'd like Sean to text you with notes"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block font-body text-label-md tracking-wide text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  );
}

function PracticeStep({
  text,
  value,
  onSelect,
}: {
  text: string;
  value: "yes" | "no" | undefined;
  onSelect: (v: "yes" | "no") => void;
}) {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-display-sm md:text-display-md text-charcoal leading-tight text-balance">
        {text}
      </h1>
      <div className="grid grid-cols-2 gap-3">
        <YesNoButton
          label="Yes"
          selected={value === "yes"}
          onClick={() => onSelect("yes")}
        />
        <YesNoButton
          label="No"
          selected={value === "no"}
          onClick={() => onSelect("no")}
        />
      </div>
    </div>
  );
}

function YesNoButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-md py-8 font-display text-headline-md transition-all active:scale-95 border-2 ${
        selected
          ? "bg-charcoal text-cream border-charcoal shadow-elevation-2"
          : "bg-surface-container-lowest text-charcoal border-outline-variant/60 hover:border-charcoal/60"
      }`}
    >
      {label}
    </button>
  );
}

function ChoiceStep({
  question,
  value,
  onSelect,
}: {
  question: ChoiceQuestion;
  value: string | undefined;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-display-sm md:text-display-md text-charcoal leading-tight text-balance">
        {question.text}
      </h1>
      <ul className="space-y-2.5">
        {question.options.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => onSelect(opt.value)}
                aria-pressed={isSelected}
                className={`w-full text-left rounded-md px-gutter py-4 border transition-all active:scale-[0.99] ${
                  isSelected
                    ? "bg-charcoal text-cream border-charcoal shadow-elevation-2"
                    : "bg-surface-container-lowest text-charcoal border-outline-variant/60 hover:border-charcoal/40"
                }`}
              >
                <p className="font-body text-body-md leading-snug">
                  {opt.label}
                </p>
                {opt.sub && (
                  <p
                    className={`font-body text-label-sm mt-1 ${
                      isSelected ? "text-cream/70" : "text-on-surface-variant"
                    }`}
                  >
                    {opt.sub}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
