"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { submitQuiz } from "../actions";
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
 * Two-phase quiz flow:
 *   step 0   → contact (first name + email + optional phone)
 *   step 1-10 → practice questions q1..q10 (yes/no, auto-advance)
 *   step 11-13 → multiple-choice qualifying questions (auto-advance)
 *   step 14  → final multiple-choice (Q14) + submit
 *
 * State persists to localStorage so a closed tab resumes where she left
 * off (same pattern as onboarding). Auto-advance keeps momentum on the
 * easy questions; contact step needs an explicit Continue. The last
 * question (Q14) auto-fires submit on selection.
 *
 * Q15 (open textarea) used to live at step 15 — removed per Sean: the
 * textarea was unreliable on mobile and the answer was never used
 * downstream. Total step count drops from 16 to 15 (contact + 14 q's).
 */

type FlowState = {
  step: number;
  contact: { firstName: string; email: string; phone: string };
  answers: Partial<Answers>;
};

const STORAGE_KEY = "riven_quiz_state_v1";
const TOTAL_QUESTIONS = 14;
const TOTAL_STEPS = TOTAL_QUESTIONS + 1; // +1 for the contact step

const DEFAULT_STATE: FlowState = {
  step: 0,
  contact: { firstName: "", email: "", phone: "" },
  answers: {},
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (state.step === 0) {
      return (
        state.contact.firstName.trim().length >= 1 &&
        EMAIL_RX.test(state.contact.email.trim())
      );
    }
    if (state.step >= 1 && state.step <= 10) {
      return !!state.answers[`q${state.step}` as keyof Answers];
    }
    if (state.step === 11) return !!state.answers.q11;
    if (state.step === 12) return !!state.answers.q12;
    if (state.step === 13) return !!state.answers.q13;
    if (state.step === 14) return !!state.answers.q14;
    return true;
  }, [state]);

  const isLast = state.step === TOTAL_STEPS - 1;

  function handleSubmit() {
    if (!formRef.current) return;
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
            {state.step === 0
              ? "Quick intro"
              : `Question ${state.step} of ${TOTAL_QUESTIONS}`}
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

      {initialError && state.step === 0 && (
        <div className="rounded-md bg-soft-red/10 border border-soft-red/40 px-gutter py-3 mb-6">
          <p className="font-body text-body-md text-charcoal">
            Something didn&apos;t go through. Try again — your answers are saved.
          </p>
        </div>
      )}

      {/* Step content */}
      <section className="flex-1 flex flex-col">
        {state.step === 0 && (
          <ContactStep
            contact={state.contact}
            onChange={setContact}
            onContinue={() => canContinue && next()}
          />
        )}

        {state.step >= 1 && state.step <= 10 && (
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
        {state.step === 14 && (
          <ChoiceStep
            question={Q14}
            value={state.answers.q14}
            // Q14 is the last question — just set the answer (no auto-
            // advance since there's no next step). The footer's "See my
            // results" button takes over once she's picked.
            onSelect={(v) => setAnswer("q14", v)}
          />
        )}

        {/* Back button sits right under the answer area for any non-zero
            step. Per Sean: the back button was buried at the bottom of
            the screen and felt unreachable; moving it close to the
            answers means she doesn't have to scroll to correct a tap. */}
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

      {/* Footer — Continue (step 0) / See my results (step 14) */}
      <footer className="mt-8 space-y-3">
        {/* Hidden form for the submit action. handleSubmit fires it via formRef. */}
        <form ref={formRef} className="hidden" />

        {(state.step === 0 || (isLast && !!state.answers.q14)) && (
          <button
            type="button"
            onClick={isLast ? handleSubmit : next}
            disabled={!canContinue || pending}
            className="w-full bg-charcoal text-cream py-4 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLast
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

function ContactStep({
  contact,
  onChange,
  onContinue,
}: {
  contact: { firstName: string; email: string; phone: string };
  onChange: (k: "firstName" | "email" | "phone", v: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-display-sm md:text-display-md text-charcoal leading-tight text-balance">
          First, who am I talking to?
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          So I can send your results and follow up with the right next step. No
          spam — promise.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="First name">
          <input
            type="text"
            autoComplete="given-name"
            autoCapitalize="words"
            value={contact.firstName}
            onChange={(e) => onChange("firstName", e.target.value)}
            className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-gutter py-3.5 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none transition-colors"
            placeholder="Your name"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={contact.email}
            onChange={(e) => onChange("email", e.target.value)}
            className="w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-gutter py-3.5 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none transition-colors"
            placeholder="you@example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onContinue();
              }
            }}
          />
        </Field>

        <Field label="Phone (optional)">
          <input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={contact.phone}
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

// TextareaStep removed alongside Q15 — the open-answer step was unused
// downstream and unreliable on mobile.
