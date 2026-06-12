"use client";

import { useState, useTransition } from "react";
import { setMyCircleShare } from "./circle-share-actions";

/**
 * "Share my wins to the Circle" lever on /profile. Flips
 * Profile.shareToCircle. When ON (the default), milestone moments — weigh-in
 * streaks, comebacks, eating the plan — post to the Circle automatically, as
 * behavior, never numbers. Same optimistic-switch pattern as the
 * calorie-banking toggle.
 */
export function CircleShareToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !enabled;
    setError(null);
    setEnabled(next); // optimistic
    startTransition(async () => {
      const res = await setMyCircleShare(next);
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
            Share my wins to the Circle
          </h3>
          <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
            {enabled ? "On" : "Off"}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Share my wins to the Circle"
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
        Milestone moments — weigh-in streaks, comebacks, eating the plan — post
        to the Circle for you. Always the behavior, never your numbers. Your
        weight stays on your screen, period.
      </p>

      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}
    </div>
  );
}
