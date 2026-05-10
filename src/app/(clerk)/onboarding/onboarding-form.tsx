"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createProfile, type ProfileFormState } from "./actions";

const ACTIVITY_OPTIONS = [
  { value: "SEDENTARY", label: "Mostly sitting", hint: "Desk job, little movement" },
  { value: "LIGHT", label: "Lightly active", hint: "Walks, light yoga 1–3×/wk" },
  { value: "MODERATE", label: "Moderately active", hint: "Workouts 3–5×/wk" },
  { value: "ACTIVE", label: "Very active", hint: "Hard training 6–7×/wk" },
  { value: "VERY_ACTIVE", label: "Athlete level", hint: "Daily intense training" },
] as const;

const CYCLE_OPTIONS = [
  { value: "REGULAR", label: "Regular cycle" },
  { value: "PERIMENOPAUSAL", label: "Perimenopausal" },
  { value: "MENOPAUSAL", label: "Menopausal" },
  { value: "NA", label: "Doesn't apply" },
] as const;

const initialState: ProfileFormState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="block w-full text-center bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 hover:opacity-90 shadow-elevation-2 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "Calibrating…" : "Calibrate my plan"}
    </button>
  );
}

export function OnboardingForm() {
  const [state, formAction] = useFormState(createProfile, initialState);

  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-section-gap">
      {/* Section 1 — About you */}
      <Section
        title="About you"
        subtitle="So we can address you the right way."
      >
        <Field label="Your first name" error={fe.name}>
          <input
            type="text"
            name="name"
            required
            autoComplete="given-name"
            className={inputCls}
            placeholder="e.g. Camille"
          />
        </Field>

        <Field label="Age" error={fe.age}>
          <input
            type="number"
            name="age"
            required
            min={18}
            max={100}
            inputMode="numeric"
            className={inputCls}
            placeholder="42"
          />
        </Field>

        <Field label="Height" error={fe.heightFeet ?? fe.heightInches}>
          <div className="flex items-end gap-base">
            <div className="flex-1">
              <input
                type="number"
                name="heightFeet"
                required
                min={4}
                max={7}
                inputMode="numeric"
                className={inputCls}
                placeholder="5"
                aria-label="Feet"
              />
              <span className="font-body text-label-sm text-on-surface-variant/70 mt-1 block">
                ft
              </span>
            </div>
            <div className="flex-1">
              <input
                type="number"
                name="heightInches"
                required
                min={0}
                max={11}
                inputMode="numeric"
                className={inputCls}
                placeholder="6"
                aria-label="Inches"
              />
              <span className="font-body text-label-sm text-on-surface-variant/70 mt-1 block">
                in
              </span>
            </div>
          </div>
        </Field>
      </Section>

      {/* Section 2 — Your numbers */}
      <Section
        title="Where you are, where you're going"
        subtitle="No judgment. Just a starting point."
      >
        <Field label="Current weight (lbs)" error={fe.currentWeight}>
          <input
            type="number"
            name="currentWeight"
            required
            min={70}
            max={700}
            step="0.1"
            inputMode="decimal"
            className={inputCls}
            placeholder="175"
          />
        </Field>

        <Field label="Goal weight (lbs)" error={fe.goalWeight}>
          <input
            type="number"
            name="goalWeight"
            required
            min={70}
            max={700}
            step="0.1"
            inputMode="decimal"
            className={inputCls}
            placeholder="155"
          />
        </Field>
      </Section>

      {/* Section 3 — Activity */}
      <Section
        title="How you move"
        subtitle="Pick the closest match. We'll fine-tune over time."
      >
        <ChipGroup
          name="activityLevel"
          options={ACTIVITY_OPTIONS}
          error={fe.activityLevel}
          required
        />
      </Section>

      {/* Section 4 — Cycle */}
      <Section
        title="Your cycle"
        subtitle="This helps RIVEN tune your weekly check-ins and protein floor."
      >
        <ChipGroup
          name="cycleStatus"
          options={CYCLE_OPTIONS}
          error={fe.cycleStatus}
          required
        />
      </Section>

      {state.error && (
        <div className="rounded-md border border-soft-red/40 bg-soft-red/10 px-gutter py-3">
          <p className="font-body text-body-md text-soft-red">{state.error}</p>
        </div>
      )}

      <div className="pt-4">
        <SubmitButton />
        <p className="mt-4 text-center font-body text-label-sm text-on-surface-variant/70">
          You can update any of this later in your profile.
        </p>
      </div>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Sub-components                                               */
/* ──────────────────────────────────────────────────────────── */

const inputCls =
  "w-full bg-transparent border-0 border-b border-outline-variant focus:border-gold focus:ring-0 outline-none py-3 font-display text-headline-md text-charcoal placeholder:text-on-surface-variant/40 transition-colors";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h2 className="font-display text-headline-md text-charcoal">{title}</h2>
        <p className="font-body text-body-md text-on-surface-variant">{subtitle}</p>
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="font-body text-label-md tracking-wide uppercase text-on-surface-variant">
        {label}
      </span>
      {children}
      {error && (
        <span className="block font-body text-label-sm text-soft-red">{error}</span>
      )}
    </label>
  );
}

function ChipGroup({
  name,
  options,
  error,
  required,
}: {
  name: string;
  options: ReadonlyArray<{ value: string; label: string; hint?: string }>;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div role="radiogroup" className="grid gap-3">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="group cursor-pointer rounded-md border border-outline-variant bg-surface-container-lowest px-gutter py-4 transition-all hover:border-gold has-[:checked]:border-sage has-[:checked]:bg-tertiary-container has-[:checked]:shadow-elevation-1"
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              required={required}
              className="sr-only peer"
            />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-body text-body-md font-semibold text-charcoal">
                  {opt.label}
                </p>
                {opt.hint && (
                  <p className="font-body text-label-sm text-on-surface-variant/80 mt-0.5">
                    {opt.hint}
                  </p>
                )}
              </div>
              <span className="material-symbols-outlined text-charcoal opacity-0 peer-checked:opacity-100 transition-opacity">
                check_circle
              </span>
            </div>
          </label>
        ))}
      </div>
      {error && (
        <span className="block font-body text-label-sm text-soft-red">{error}</span>
      )}
    </div>
  );
}
