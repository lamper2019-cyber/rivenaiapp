"use client";

import { useState, useTransition } from "react";
import { setMyCalorieBanking } from "./calorie-banking-actions";
import { BANK_FLOOR_DELTA, BANK_CEILING_DELTA } from "@/lib/calorie-schedule";

/**
 * "Smooth my week" lever on /profile. Flips Profile.calorieBankingEnabled for
 * the signed-in client. When ON, the resolver rolls yesterday's leftover (or
 * overage) into today's target, clamped to her daily cut ± 600. Her weekly
 * average — the number RIVEN actually coaches — never changes; only how the
 * calories sit across the days does.
 *
 * Optimistic: the switch flips immediately, and reverts only if the server
 * write fails (rare). The dashboard / log target updates on next load via the
 * revalidatePath in the action.
 */
export function CalorieBankingToggle({
  initialEnabled,
  dailyTarget,
}: {
  initialEnabled: boolean;
  dailyTarget: number;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const floor = Math.max(0, dailyTarget - BANK_FLOOR_DELTA);
  const ceil = dailyTarget + BANK_CEILING_DELTA;

  function toggle() {
    const next = !enabled;
    setError(null);
    setEnabled(next); // optimistic
    startTransition(async () => {
      const res = await setMyCalorieBanking(next);
      if (!res.ok) {
        setEnabled(!next); // revert
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-5 shadow-elevation-1 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-headline-md text-charcoal">
            Smooth my week
          </h3>
          <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
            {enabled ? "On" : "Off"}
          </p>
        </div>

        {/* Pill switch — charcoal when on, gold knob breathing room. */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Smooth my week"
          onClick={toggle}
          disabled={pending}
          className={`relative shrink-0 w-14 h-8 rounded-full transition-colors duration-200 disabled:opacity-60 ${
            enabled ? "bg-charcoal" : "bg-outline-variant/60"
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-cream shadow-elevation-1 transition-transform duration-200 ${
              enabled ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <p className="font-body text-body-md text-on-surface-variant leading-relaxed">
        Eat under one day and you bank the difference for the next. Go over, and
        tomorrow trims a little to even it out. Your weekly average holds — the
        daily number just flexes with you.
      </p>

      {enabled && (
        <p className="font-body text-label-sm text-on-surface-variant/80">
          Your daily target swings between{" "}
          <span className="text-gold">{floor.toLocaleString()}</span> and{" "}
          <span className="text-gold">{ceil.toLocaleString()}</span> — never
          outside that. Protein floor stays put. Resets fresh every Sunday.
        </p>
      )}

      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}
    </div>
  );
}
