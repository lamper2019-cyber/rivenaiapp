"use client";

import { useState, useTransition } from "react";
import { updateClientTargets } from "@/lib/coach-actions";

export function EditTargetsForm({
  clientUserId,
  initialCutCalories,
  initialProteinFloor,
}: {
  clientUserId: string;
  initialCutCalories: number;
  initialProteinFloor: number;
}) {
  const [open, setOpen] = useState(false);
  const [cal, setCal] = useState(String(initialCutCalories));
  const [protein, setProtein] = useState(String(initialProteinFloor));
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await updateClientTargets(formData);
      if (result.ok) {
        setJustSaved(true);
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  const calNum = Number(cal);
  const proteinNum = Number(protein);
  const calValid = Number.isFinite(calNum) && calNum >= 800 && calNum <= 5000;
  const proteinValid =
    Number.isFinite(proteinNum) && proteinNum >= 30 && proteinNum <= 400;
  const unchanged =
    calNum === initialCutCalories && proteinNum === initialProteinFloor;
  const disabled = isPending || !calValid || !proteinValid || unchanged;

  if (!open) {
    return (
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError(null);
            setJustSaved(false);
            setCal(String(initialCutCalories));
            setProtein(String(initialProteinFloor));
          }}
          className="rounded-md border border-charcoal/30 px-4 py-2 font-body text-label-md tracking-widest uppercase text-charcoal hover:bg-charcoal/5 transition-colors inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">tune</span>
          Edit targets
        </button>
        {justSaved && (
          <p
            role="status"
            className="font-body text-label-sm text-sage tracking-wide"
          >
            Saved. She&apos;ll see it in her chat.
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="mt-3 space-y-3">
      <input type="hidden" name="clientUserId" value={clientUserId} />

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="font-body text-label-sm text-on-surface-variant/80">
            Daily calories
          </span>
          <input
            type="number"
            name="cutCalories"
            value={cal}
            onChange={(e) => setCal(e.target.value)}
            min={800}
            max={5000}
            inputMode="numeric"
            className="mt-1 w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-gutter py-2.5 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none transition-colors"
            disabled={isPending}
          />
          <span className="font-body text-label-sm text-on-surface-variant/60 mt-1 block">
            800 – 5,000
          </span>
        </label>
        <label className="block">
          <span className="font-body text-label-sm text-on-surface-variant/80">
            Protein floor (g)
          </span>
          <input
            type="number"
            name="proteinFloor"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            min={30}
            max={400}
            inputMode="numeric"
            className="mt-1 w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-gutter py-2.5 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none transition-colors"
            disabled={isPending}
          />
          <span className="font-body text-label-sm text-on-surface-variant/60 mt-1 block">
            30 – 400 g
          </span>
        </label>
      </div>

      <p className="font-body text-label-sm text-on-surface-variant/80">
        Saving will drop a coach message into her chat announcing the change.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-charcoal text-cream px-5 py-2.5 font-body text-body-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {isPending ? "Saving…" : "Save & notify"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={isPending}
          className="rounded-md border border-outline-variant/60 px-5 py-2.5 font-body text-body-md text-charcoal hover:bg-charcoal/5 transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-soft-red/10 border border-soft-red/40 px-gutter py-2.5 font-body text-body-md text-soft-red"
        >
          {error}
        </p>
      )}
    </form>
  );
}
