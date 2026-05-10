"use client";

import { useState, useTransition } from "react";
import { logSteps } from "./actions";

export function LogStepsForm({ initial }: { initial: number }) {
  const [steps, setSteps] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("steps", String(steps));
    startTransition(async () => {
      const res = await logSteps(fd);
      if (!res.ok) {
        setError(res.error);
      } else {
        setEditing(false);
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full text-left rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-3 hover:border-gold transition-colors"
      >
        <div className="flex items-center justify-between">
          <span className="font-body text-body-md text-charcoal">
            Tap to log today&apos;s steps
          </span>
          <span className="material-symbols-outlined text-on-surface-variant">
            edit
          </span>
        </div>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="rounded-md bg-surface-container-lowest border border-gold/60 px-gutter py-3 space-y-2"
    >
      <label className="block font-body text-label-sm tracking-wide uppercase text-on-surface-variant">
        Steps today
      </label>
      <div className="flex items-end gap-2">
        <input
          type="number"
          min={0}
          max={100000}
          step={100}
          value={steps}
          onChange={(e) => setSteps(Number(e.target.value))}
          autoFocus
          disabled={pending}
          className="flex-1 bg-transparent border-0 border-b border-outline-variant focus:border-gold focus:ring-0 outline-none py-1 font-display text-headline-md text-charcoal placeholder:text-on-surface-variant/40 transition-colors"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 bg-charcoal text-cream rounded-full px-4 py-2 font-body text-label-sm tracking-widest uppercase hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="shrink-0 font-body text-label-sm text-on-surface-variant hover:text-charcoal"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}
    </form>
  );
}
