"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitCheckIn, type CheckInFormState } from "./actions";

const MENU_OPTIONS = [
  { value: "YES", label: "Yes — followed it" },
  { value: "MOSTLY", label: "Mostly — a few slips" },
  { value: "NOT_REALLY", label: "Not really" },
] as const;

const CYCLE_OPTIONS = [
  { value: "PRE_PERIOD", label: "Pre-period" },
  { value: "ON_PERIOD", label: "On period" },
  { value: "MID_CYCLE", label: "Mid-cycle" },
  { value: "POST_PERIOD", label: "Post-period" },
  { value: "NA", label: "Doesn't apply" },
] as const;

const initialState: CheckInFormState = { ok: false };

type Existing = {
  id: string;
  weight: number;
  waist: number;
  photoFrontUrl: string | null;
  photoSideUrl: string | null;
  sleepAvg: number;
  stress: number;
  winsAndStruggles: string;
} | null;

export function CheckInForm({
  onboarded,
  initial,
}: {
  onboarded: boolean;
  initial: Existing;
}) {
  const [state, formAction] = useFormState(submitCheckIn, initialState);
  const fe = state.fieldErrors ?? {};
  const [stress, setStress] = useState(initial?.stress ?? 5);

  const [photoFrontUrl, setPhotoFrontUrl] = useState(initial?.photoFrontUrl ?? "");
  const [photoSideUrl, setPhotoSideUrl] = useState(initial?.photoSideUrl ?? "");

  return (
    <form action={formAction} className="space-y-section-gap">
      {/* Section 1 — numbers */}
      <Section
        title="The numbers"
        subtitle="Take both first thing in the morning, post-bathroom, pre-coffee."
      >
        <Field label="Weight (lbs)" error={fe.weight}>
          <input
            type="number"
            name="weight"
            required
            min={70}
            max={700}
            step="0.1"
            inputMode="decimal"
            disabled={!onboarded}
            defaultValue={initial?.weight ?? ""}
            placeholder="172.4"
            className={inputCls}
          />
        </Field>

        <Field label="Waist (inches)" error={fe.waist}>
          <input
            type="number"
            name="waist"
            required
            min={15}
            max={100}
            step="0.1"
            inputMode="decimal"
            disabled={!onboarded}
            defaultValue={initial?.waist ?? ""}
            placeholder="32.5"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Section 2 — photos */}
      <Section
        title="Progress photos"
        subtitle="Same lighting, same time of day, same outfit if you can. Front and side."
      >
        <PhotoUpload
          label="Front photo"
          name="photoFrontUrl"
          scope="checkin-front"
          publicUrl={photoFrontUrl}
          onChange={setPhotoFrontUrl}
          disabled={!onboarded}
        />
        <PhotoUpload
          label="Side photo"
          name="photoSideUrl"
          scope="checkin-side"
          publicUrl={photoSideUrl}
          onChange={setPhotoSideUrl}
          disabled={!onboarded}
        />
      </Section>

      {/* Section 3 — menu adherence */}
      <Section
        title="Menu adherence"
        subtitle="Honest answer beats a flattering one."
      >
        <ChipGroup
          name="menuAdherence"
          options={MENU_OPTIONS}
          error={fe.menuAdherence}
          defaultValue={undefined}
          required
        />
      </Section>

      {/* Section 4 — sleep */}
      <Section
        title="Sleep"
        subtitle="The best fat-burning tool you have."
      >
        <Field label="Average sleep this week (hours)" error={fe.sleepAvg}>
          <input
            type="number"
            name="sleepAvg"
            required
            min={0}
            max={14}
            step="0.1"
            inputMode="decimal"
            disabled={!onboarded}
            defaultValue={initial?.sleepAvg ?? ""}
            placeholder="7.2"
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Section 5 — cycle */}
      <Section
        title="Cycle phase"
        subtitle="Tells RIVEN how to read your weight and energy."
      >
        <ChipGroup
          name="cycleStatus"
          options={CYCLE_OPTIONS}
          error={fe.cycleStatus}
          defaultValue={undefined}
          required
        />
      </Section>

      {/* Section 6 — stress */}
      <Section
        title="Stress"
        subtitle="One = serene. Ten = fire everywhere."
      >
        <Field label={`Stress this week: ${stress}/10`} error={fe.stress}>
          <input
            type="range"
            name="stress"
            min={1}
            max={10}
            step={1}
            value={stress}
            onChange={(e) => setStress(Number(e.target.value))}
            disabled={!onboarded}
            className="w-full accent-charcoal"
          />
        </Field>
      </Section>

      {/* Section 7 — wins & struggles */}
      <Section
        title="Wins and struggles"
        subtitle="A line each. Sean reads every one."
      >
        <Field label="What went well, what didn't" error={fe.winsAndStruggles}>
          <textarea
            name="winsAndStruggles"
            required
            disabled={!onboarded}
            defaultValue={initial?.winsAndStruggles ?? ""}
            rows={5}
            maxLength={2000}
            placeholder="Won: hit protein every day except Saturday. Stuck: snacking after dinner Tues–Thurs."
            className={`${inputCls} resize-none p-4`}
          />
        </Field>
      </Section>

      {state.error && (
        <div className="rounded-md border border-soft-red/40 bg-soft-red/10 px-gutter py-3">
          <p className="font-body text-body-md text-soft-red">{state.error}</p>
        </div>
      )}

      <SubmitArea disabled={!onboarded} />
    </form>
  );
}

function SubmitArea({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="pt-4 space-y-3">
      <button
        type="submit"
        disabled={disabled || pending}
        className="block w-full text-center bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 hover:opacity-90 shadow-elevation-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Submitting…" : "Submit my check-in"}
      </button>
      <p className="text-center font-body text-label-sm text-on-surface-variant/70">
        You can resubmit later this week to update.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Photo upload — presigned PUT to R2                           */
/* ──────────────────────────────────────────────────────────── */

function PhotoUpload({
  label,
  name,
  scope,
  publicUrl,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  scope: "checkin-front" | "checkin-side";
  publicUrl: string;
  onChange: (url: string) => void;
  disabled: boolean;
}) {
  const [uploading, startUpload] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    startUpload(async () => {
      try {
        const contentType = file.type || "image/jpeg";

        const signResp = await fetch("/api/r2/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType,
            contentLength: file.size,
            scope,
          }),
        });

        if (!signResp.ok) {
          const data = await signResp.json().catch(() => ({}));
          throw new Error(data.error ?? `Sign failed (${signResp.status}). Try a smaller file.`);
        }

        const { uploadUrl, publicUrl: pUrl } = (await signResp.json()) as {
          uploadUrl: string;
          publicUrl: string;
        };

        const putResp = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": contentType },
        });

        if (!putResp.ok) {
          const body = await putResp.text().catch(() => "");
          throw new Error(
            `Upload failed (${putResp.status}). ${body.slice(0, 200) || "Check the R2 bucket CORS policy in Cloudflare."}`
          );
        }

        onChange(pUrl);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Upload failed — check your network and try again.";
        setError(msg);
      }
    });
  }

  return (
    <div className="space-y-2">
      <span className="font-body text-label-md tracking-wide uppercase text-on-surface-variant block">
        {label}
      </span>

      <input type="hidden" name={name} value={publicUrl} />

      {publicUrl ? (
        <div className="relative w-full aspect-[3/4] rounded-md overflow-hidden bg-surface-container border border-outline-variant/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={publicUrl}
            alt={label}
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={disabled}
            className="absolute top-2 right-2 bg-charcoal/80 text-cream rounded-full px-3 py-1 font-body text-label-sm hover:bg-charcoal"
          >
            Remove
          </button>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center w-full aspect-[3/4] rounded-md border-2 border-dashed border-outline-variant bg-surface-container-lowest cursor-pointer hover:border-gold transition-colors ${
            disabled ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          <input
            type="file"
            accept="image/*"
            disabled={disabled || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="sr-only"
          />
          <span className="material-symbols-outlined text-charcoal/60 text-4xl">
            {uploading ? "hourglass_empty" : "add_a_photo"}
          </span>
          <span className="font-body text-body-md text-on-surface-variant mt-2">
            {uploading ? "Uploading…" : "Tap to upload"}
          </span>
          <span className="font-body text-label-sm text-on-surface-variant/70 mt-1">
            JPEG, PNG, HEIC up to 15 MB
          </span>
        </label>
      )}

      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/* Sub-components (mirror onboarding form patterns)             */
/* ──────────────────────────────────────────────────────────── */

const inputCls =
  "w-full bg-transparent border-0 border-b border-outline-variant focus:border-gold focus:ring-0 outline-none py-3 font-display text-headline-md text-charcoal placeholder:text-on-surface-variant/40 transition-colors disabled:opacity-60";

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
      {error && <span className="block font-body text-label-sm text-soft-red">{error}</span>}
    </label>
  );
}

function ChipGroup({
  name,
  options,
  error,
  required,
  defaultValue,
}: {
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  error?: string;
  required?: boolean;
  defaultValue?: string;
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
              defaultChecked={defaultValue === opt.value}
              className="sr-only peer"
            />
            <div className="flex items-center justify-between gap-4">
              <p className="font-body text-body-md font-semibold text-charcoal">
                {opt.label}
              </p>
              <span className="material-symbols-outlined text-charcoal opacity-0 peer-checked:opacity-100 transition-opacity">
                check_circle
              </span>
            </div>
          </label>
        ))}
      </div>
      {error && <span className="block font-body text-label-sm text-soft-red">{error}</span>}
    </div>
  );
}

