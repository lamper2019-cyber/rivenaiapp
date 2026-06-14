"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logSteps } from "@/app/(clerk)/(app)/dashboard/actions";

/**
 * Manual step logging — the Steps card on /dashboard, now tappable. Shows the
 * same progress treatment as the calorie/protein cards, but "Log" opens an
 * inline number field so she can put today's steps in by hand (no tracker
 * integration needed). Writes today's total via the existing logSteps action.
 */
export function ManualStepsCard({
  value,
  target,
}: {
  value: number;
  target: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ? String(value) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remaining = target - value;
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const hit = value >= target;

  function save() {
    setError(null);
    const steps = parseInt(val, 10);
    if (Number.isNaN(steps) || steps < 0) {
      setError("Enter a number.");
      return;
    }
    const fd = new FormData();
    fd.set("steps", String(steps));
    startTransition(async () => {
      const r = await logSteps(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1">
      <div className="flex items-baseline justify-between">
        <p className="font-body text-label-md tracking-wide uppercase text-on-surface-variant">
          Steps
        </p>
        {editing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="font-body text-label-sm text-on-surface-variant"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-body text-label-sm text-gold active:scale-95 transition-transform"
          >
            {value > 0 ? "Edit" : "Log"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            placeholder="Today's steps"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-36 rounded-md border border-outline-variant/60 bg-cream px-3 py-2 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none"
          />
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="rounded-full bg-charcoal text-cream px-5 py-2 font-body text-label-sm tracking-widest uppercase disabled:opacity-40 active:scale-95 transition-all"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      ) : (
        <>
          <p className="font-display text-headline-md text-charcoal mt-2">
            {value.toLocaleString()}
            <span className="font-body text-body-md text-on-surface-variant/70">
              {" "}
              / {target.toLocaleString()}
            </span>
          </p>
          <p className="font-body text-label-sm text-on-surface-variant/80 mt-0.5">
            {hit ? "goal hit" : `${remaining.toLocaleString()} to go`}
          </p>
          <div className="mt-3 h-1.5 bg-surface-container rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${hit ? "bg-sage" : "bg-charcoal"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}

      {error && <p className="mt-2 font-body text-label-sm text-soft-red">{error}</p>}
    </div>
  );
}
