"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createProfile, type ProfileFormState } from "./actions";
import { captureEvent } from "@/components/posthog";
import { calculateTargets } from "@/lib/calculations";
import type { QuizLeadSummary } from "./page";

/**
 * Step-by-step onboarding with Sean's voice on every prompt. One question
 * per screen, big visual inputs (sliders / steppers / illustrated cards)
 * instead of plain text fields. Persists to localStorage so a refresh
 * resumes where she left off; submits the whole form once at the end via
 * the existing createProfile server action.
 */

type State = {
  step: number;
  name: string;
  age: number;
  heightFeet: number;
  heightInches: number;
  currentWeight: number;
  goalWeight: number;
  activityLevel: "" | "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";
  cycleStatus: "" | "REGULAR" | "PERIMENOPAUSAL" | "MENOPAUSAL" | "NA";
};

const STORAGE_KEY = "riven_onboarding_state_v1";
const TOTAL_STEPS = 8; // name, age, height, cur weight, goal, activity, cycle, plan

const DEFAULT_STATE: State = {
  step: 0,
  name: "",
  age: 42,
  heightFeet: 5,
  heightInches: 4,
  currentWeight: 175,
  goalWeight: 155,
  activityLevel: "",
  cycleStatus: "",
};

const ACTIVITY_OPTIONS = [
  { value: "SEDENTARY", label: "Mostly sitting", hint: "Desk job, little movement", icon: "chair_alt" },
  { value: "LIGHT", label: "Lightly active", hint: "Walks, light yoga 1–3×/wk", icon: "directions_walk" },
  { value: "MODERATE", label: "Moderately active", hint: "Workouts 3–5×/wk", icon: "directions_run" },
  { value: "ACTIVE", label: "Very active", hint: "Hard training 6–7×/wk", icon: "fitness_center" },
  { value: "VERY_ACTIVE", label: "Athlete level", hint: "Daily intense training", icon: "sports_kabaddi" },
] as const;

const CYCLE_OPTIONS = [
  { value: "REGULAR", label: "Regular cycle", hint: "Period still arrives most months" },
  { value: "PERIMENOPAUSAL", label: "Perimenopausal", hint: "Cycle irregular, symptoms shifting" },
  { value: "MENOPAUSAL", label: "Menopausal", hint: "12+ months without a period" },
  { value: "NA", label: "Doesn't apply", hint: "Skip the hormonal tuning" },
] as const;

export function OnboardingFlow({
  quizLead = null,
}: {
  quizLead?: QuizLeadSummary | null;
}) {
  const [state, setState] = useState<State>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Resume from localStorage if the user closed the tab mid-flow. If she
  // came in fresh from the quiz, prefill her first name so step 0 isn't
  // asking her something we already know.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<State>;
        setState((s) => ({ ...s, ...parsed }));
        setHydrated(true);
        return;
      }
    } catch {
      /* ignore corrupt storage */
    }
    if (quizLead?.firstName) {
      setState((s) => ({ ...s, name: quizLead.firstName }));
    }
    setHydrated(true);
  }, [quizLead]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private mode */
    }
  }, [state, hydrated]);

  function setField<K extends keyof State>(key: K, value: State[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function next() {
    setState((s) => ({ ...s, step: Math.min(s.step + 1, TOTAL_STEPS - 1) }));
  }
  function back() {
    setState((s) => ({ ...s, step: Math.max(s.step - 1, 0) }));
  }

  // Per-step gate so the Continue button only lights up when the answer is
  // valid. Avoids tap-tap-tap-through with empty values.
  const canContinue = useMemo(() => {
    switch (state.step) {
      case 0:
        return state.name.trim().length >= 1;
      case 1:
        return state.age >= 18 && state.age <= 100;
      case 2:
        return (
          state.heightFeet >= 4 &&
          state.heightFeet <= 7 &&
          state.heightInches >= 0 &&
          state.heightInches <= 11
        );
      case 3:
        return state.currentWeight >= 70 && state.currentWeight <= 700;
      case 4:
        return state.goalWeight >= 70 && state.goalWeight <= 700;
      case 5:
        return state.activityLevel !== "";
      case 6:
        return state.cycleStatus !== "";
      case 7:
        return true;
      default:
        return false;
    }
  }, [state]);

  function submitFinal() {
    setSubmitError(null);
    const fd = new FormData();
    fd.set("name", state.name.trim());
    fd.set("age", String(state.age));
    fd.set("heightFeet", String(state.heightFeet));
    fd.set("heightInches", String(state.heightInches));
    fd.set("currentWeight", String(state.currentWeight));
    fd.set("goalWeight", String(state.goalWeight));
    fd.set("activityLevel", state.activityLevel);
    fd.set("cycleStatus", state.cycleStatus);

    startTransition(async () => {
      // PostHog activation event — the "finished onboarding" funnel step.
      // createProfile redirects to /tutorial on success, so the client never
      // sees an ok:true result to fire on afterward. We fire here instead,
      // right before the call: the form already passed client-side validation
      // (the "Lock it in" button is gated on canContinue), so the only way
      // this over-counts is a rare server auth/DB failure — acceptable noise
      // for a funnel step. Props are non-PII only (activity tier, no name).
      void captureEvent("onboarding_completed", {
        activity_level: state.activityLevel,
      });
      const initial: ProfileFormState = { ok: false };
      const result = await createProfile(initial, fd);
      // createProfile redirects on success; we only fall through here on
      // validation / auth errors.
      if (!result.ok) {
        setSubmitError(result.error ?? "Something went wrong. Try again.");
      }
    });
  }

  // Block rendering until localStorage hydration completes — prevents the
  // form from briefly flashing step 0 before jumping to the saved step.
  if (!hydrated) return null;

  return (
    <div className="relative min-h-screen flex flex-col px-container-mobile md:px-container-desktop max-w-xl mx-auto py-6">
      <Header step={state.step} onBack={back} />

      <div className="flex-grow flex flex-col justify-center py-8">
        {/* Quiz-handoff banner — shown only on step 0 when we have her
            assessment data, so she lands knowing Sean already knows the
            shape of where she's coming from. */}
        {state.step === 0 && quizLead && (
          <div className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-4 shadow-elevation-1 mb-6">
            <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
              Welcome back, {quizLead.firstName}
            </p>
            <p className="font-body text-body-md text-charcoal mt-2 leading-relaxed">
              From your quiz I already know:
            </p>
            <ul className="font-body text-body-md text-charcoal mt-1 space-y-1">
              <li>
                <span className="text-on-surface-variant/80">
                  Readiness score:
                </span>{" "}
                {quizLead.score} / 10
              </li>
              <li>
                <span className="text-on-surface-variant/80">
                  Biggest obstacle:
                </span>{" "}
                {quizLead.obstacle}
              </li>
              <li>
                <span className="text-on-surface-variant/80">
                  90-day goal:
                </span>{" "}
                {quizLead.goal}
              </li>
            </ul>
            <p className="font-body text-body-md text-charcoal mt-3 leading-relaxed">
              Let&apos;s plug in the rest of your numbers.
            </p>
          </div>
        )}

        {state.step === 0 && (
          <NameStep
            value={state.name}
            onChange={(v) => setField("name", v)}
          />
        )}
        {state.step === 1 && (
          <AgeStep
            name={state.name}
            value={state.age}
            onChange={(v) => setField("age", v)}
          />
        )}
        {state.step === 2 && (
          <HeightStep
            feet={state.heightFeet}
            inches={state.heightInches}
            onFeet={(v) => setField("heightFeet", v)}
            onInches={(v) => setField("heightInches", v)}
          />
        )}
        {state.step === 3 && (
          <WeightStep
            value={state.currentWeight}
            onChange={(v) => setField("currentWeight", v)}
          />
        )}
        {state.step === 4 && (
          <GoalWeightStep
            value={state.goalWeight}
            current={state.currentWeight}
            onChange={(v) => setField("goalWeight", v)}
          />
        )}
        {state.step === 5 && (
          <ActivityStep
            value={state.activityLevel}
            onChange={(v) => setField("activityLevel", v)}
          />
        )}
        {state.step === 6 && (
          <CycleStep
            value={state.cycleStatus}
            onChange={(v) => setField("cycleStatus", v)}
          />
        )}
        {state.step === 7 && (
          <PlanRevealStep state={state} submitError={submitError} />
        )}
      </div>

      <ContinueButton
        label={state.step === TOTAL_STEPS - 1 ? "Lock it in" : "Continue"}
        disabled={!canContinue || pending}
        pending={pending}
        onClick={state.step === TOTAL_STEPS - 1 ? submitFinal : next}
      />

      {/* Ambient warm glow (matches welcome screen) */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Header + progress                                            */
/* ──────────────────────────────────────────────────────────── */

function Header({ step, onBack }: { step: number; onBack: () => void }) {
  return (
    <header className="flex items-center justify-between pt-safe">
      <button
        type="button"
        onClick={onBack}
        disabled={step === 0}
        aria-label="Go back to previous step"
        className="inline-flex items-center gap-1 font-body text-label-sm tracking-wide text-on-surface-variant disabled:opacity-30 disabled:cursor-not-allowed hover:text-charcoal transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        Back
      </button>
      <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <span
            key={i}
            className={`block w-1.5 h-1.5 rounded-full transition-colors ${
              i <= step ? "bg-charcoal" : "bg-charcoal/15"
            }`}
            aria-hidden
          />
        ))}
      </div>
      <span className="w-12" aria-hidden /> {/* spacer for centering */}
    </header>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Sean's speech bubble                                         */
/* ──────────────────────────────────────────────────────────── */

function SeanSays({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-8">
      <span
        aria-hidden
        className="flex w-12 h-12 rounded-full bg-charcoal text-gold items-center justify-center font-display text-[28px] leading-none shrink-0 shadow-elevation-1"
      >
        S
      </span>
      <div className="flex-1 relative rounded-2xl rounded-tl-sm bg-secondary-container/40 border border-gold/40 px-4 py-3 shadow-elevation-1">
        <p className="font-body text-body-md text-charcoal leading-relaxed">
          {children}
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Step screens                                                 */
/* ──────────────────────────────────────────────────────────── */

function NameStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <SeanSays>Real quick — what should I call you?</SeanSays>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
        autoComplete="given-name"
        maxLength={80}
        placeholder="Your first name"
        className="w-full bg-transparent border-0 border-b-2 border-outline-variant focus:border-gold focus:ring-0 outline-none py-4 font-display text-display-md text-charcoal placeholder:text-on-surface-variant/30 transition-colors text-center"
      />
    </div>
  );
}

function AgeStep({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <SeanSays>{name ? `Good to meet you, ${name}.` : "Good to meet you."} How old are you?</SeanSays>
      <BigNumberDisplay value={value} unit="years" />
      <RangeSlider value={value} min={18} max={80} step={1} onChange={onChange} />
    </div>
  );
}

function HeightStep({
  feet,
  inches,
  onFeet,
  onInches,
}: {
  feet: number;
  inches: number;
  onFeet: (v: number) => void;
  onInches: (v: number) => void;
}) {
  return (
    <div>
      <SeanSays>How tall are we working with?</SeanSays>
      <div className="flex items-end justify-center gap-8 mt-4">
        <Stepper
          label="ft"
          value={feet}
          min={4}
          max={7}
          onChange={onFeet}
        />
        <Stepper
          label="in"
          value={inches}
          min={0}
          max={11}
          onChange={onInches}
        />
      </div>
    </div>
  );
}

function WeightStep({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <SeanSays>Where are you starting? No judgment — just the number.</SeanSays>
      <BigNumberDisplay value={value} unit="lbs" />
      <RangeSlider value={value} min={90} max={400} step={1} onChange={onChange} />
    </div>
  );
}

function GoalWeightStep({
  value,
  current,
  onChange,
}: {
  value: number;
  current: number;
  onChange: (v: number) => void;
}) {
  const delta = value - current;
  const deltaLabel =
    delta === 0
      ? "Maintain where you are"
      : delta < 0
        ? `Lose ${Math.abs(delta)} lbs`
        : `Gain ${delta} lbs`;
  return (
    <div>
      <SeanSays>And where do you want to land?</SeanSays>
      <BigNumberDisplay value={value} unit="lbs" />
      <p className="text-center font-body text-label-md tracking-widest uppercase text-on-surface-variant mt-2">
        {deltaLabel}
      </p>
      <RangeSlider value={value} min={90} max={400} step={1} onChange={onChange} />
    </div>
  );
}

function ActivityStep({
  value,
  onChange,
}: {
  value: State["activityLevel"];
  onChange: (v: State["activityLevel"]) => void;
}) {
  return (
    <div>
      <SeanSays>How do you move on a regular week?</SeanSays>
      <div className="space-y-2">
        {ACTIVITY_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`w-full flex items-center gap-4 rounded-md px-4 py-3 border transition-all text-left ${
                selected
                  ? "bg-tertiary-container border-sage shadow-elevation-1"
                  : "bg-surface-container-lowest border-outline-variant hover:border-gold"
              }`}
            >
              <span
                className={`material-symbols-outlined text-[28px] shrink-0 ${
                  selected ? "text-sage" : "text-charcoal/60"
                }`}
              >
                {opt.icon}
              </span>
              <div className="flex-1">
                <p className="font-body text-body-md font-semibold text-charcoal">
                  {opt.label}
                </p>
                <p className="font-body text-label-sm text-on-surface-variant/80 mt-0.5">
                  {opt.hint}
                </p>
              </div>
              {selected && (
                <span className="material-symbols-outlined text-sage text-[20px]">
                  check_circle
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CycleStep({
  value,
  onChange,
}: {
  value: State["cycleStatus"];
  onChange: (v: State["cycleStatus"]) => void;
}) {
  return (
    <div>
      <SeanSays>
        Last one — what&apos;s your cycle situation? This tunes your weekly
        check-in and protein floor.
      </SeanSays>
      <div className="space-y-2">
        {CYCLE_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`w-full flex items-center justify-between rounded-md px-4 py-3 border transition-all text-left ${
                selected
                  ? "bg-tertiary-container border-sage shadow-elevation-1"
                  : "bg-surface-container-lowest border-outline-variant hover:border-gold"
              }`}
            >
              <div>
                <p className="font-body text-body-md font-semibold text-charcoal">
                  {opt.label}
                </p>
                <p className="font-body text-label-sm text-on-surface-variant/80 mt-0.5">
                  {opt.hint}
                </p>
              </div>
              {selected && (
                <span className="material-symbols-outlined text-sage text-[20px]">
                  check_circle
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlanRevealStep({ state, submitError }: { state: State; submitError: string | null }) {
  // Compute targets client-side from the same calculation lib the server
  // uses, so the preview matches what gets written.
  const targets = useMemo(() => {
    if (state.activityLevel === "") return null;
    return calculateTargets({
      age: state.age,
      heightInches: state.heightFeet * 12 + state.heightInches,
      currentWeight: state.currentWeight,
      goalWeight: state.goalWeight,
      activityLevel: state.activityLevel,
    });
  }, [state]);

  return (
    <div>
      <SeanSays>
        Alright{state.name ? `, ${state.name}` : ""}. Here&apos;s where we&apos;re starting.
      </SeanSays>

      {targets && (
        <div className="rounded-md bg-cream border border-gold/40 shadow-elevation-1 px-gutter py-5 space-y-3 mb-6">
          <PlanRow label="Daily target" value={`${targets.cutCalories.toLocaleString()} cal`} />
          <PlanRow label="Protein floor" value={`${targets.proteinFloor}g`} />
          <PlanRow
            label="Maintenance"
            value={`${targets.maintenanceCalories.toLocaleString()} cal`}
            muted
          />
        </div>
      )}

      <SeanSays>
        No judgment on the numbers. They&apos;re data we&apos;re going to use.
        We&apos;ll fine-tune week by week.
      </SeanSays>

      {submitError && (
        <div className="rounded-md border border-soft-red/40 bg-soft-red/10 px-gutter py-3 mt-4">
          <p className="font-body text-body-md text-soft-red">{submitError}</p>
        </div>
      )}
    </div>
  );
}

function PlanRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={`font-body text-label-md tracking-widest uppercase ${
          muted ? "text-on-surface-variant/70" : "text-on-surface-variant"
        }`}
      >
        {label}
      </span>
      <span
        className={`font-display ${
          muted ? "text-body-lg text-charcoal/70" : "text-headline-md text-charcoal"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Inputs                                                       */
/* ──────────────────────────────────────────────────────────── */

function BigNumberDisplay({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="text-center mt-4">
      <p className="font-display text-display-lg text-charcoal leading-none tabular-nums">
        {value}
      </p>
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mt-1">
        {unit}
      </p>
    </div>
  );
}

function RangeSlider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="px-2 mt-6">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="riven-slider w-full"
        aria-label="Slide to adjust"
      />
      <div className="flex justify-between font-body text-label-sm text-on-surface-variant/70 mt-2">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="w-12 h-12 rounded-full border border-outline-variant bg-surface-container-lowest text-charcoal disabled:opacity-30 active:scale-95 transition-all flex items-center justify-center"
        >
          <span className="material-symbols-outlined">remove</span>
        </button>
        <p className="font-display text-display-md text-charcoal min-w-[3ch] text-center tabular-nums">
          {value}
        </p>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="w-12 h-12 rounded-full border border-outline-variant bg-surface-container-lowest text-charcoal disabled:opacity-30 active:scale-95 transition-all flex items-center justify-center"
        >
          <span className="material-symbols-outlined">add</span>
        </button>
      </div>
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        {label}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Continue button                                              */
/* ──────────────────────────────────────────────────────────── */

function ContinueButton({
  label,
  disabled,
  pending,
  onClick,
}: {
  label: string;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <div className="pt-6">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="block w-full text-center bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 hover:opacity-90 shadow-elevation-2 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {pending ? "Locking it in…" : label}
      </button>
    </div>
  );
}
