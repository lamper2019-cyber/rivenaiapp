"use client";

import { useState, useTransition } from "react";
import { setClientComp, type SetClientCompResult } from "@/lib/coach-actions";

/**
 * Per-client comp toggle. Lives inside the Profile block on /coach/clients/[id].
 * Coach taps to flip between comped (free, paywall bypass) and not-comped
 * (clears subscriptionStatus → she hits /pricing on next page load and goes
 * through the normal trial flow).
 *
 * Stripe webhook explicitly never overwrites "comped" status, so once a
 * client is comped she stays comped until RIVEN toggles her off here.
 */
export function CompToggle({
  clientUserId,
  initialStatus,
}: {
  clientUserId: string;
  initialStatus: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(initialStatus);

  const isComped = status === "comped";
  const displayLabel = formatStatus(status);

  function flip() {
    setError(null);
    const fd = new FormData();
    fd.set("clientUserId", clientUserId);
    fd.set("comp", isComped ? "off" : "on");
    startTransition(async () => {
      const r: SetClientCompResult = await setClientComp(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setStatus(r.comp ? "comped" : null);
    });
  }

  return (
    <div className="mt-6 rounded-md bg-cream/50 border border-outline-variant/40 p-gutter space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="font-display text-headline-sm text-charcoal">
          Subscription
        </h3>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-body text-label-sm border ${
            isComped
              ? "bg-sage/25 text-charcoal border-sage/50"
              : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/60"
          }`}
        >
          {displayLabel}
        </span>
      </div>
      <p className="font-body text-body-md text-on-surface-variant leading-relaxed">
        {isComped
          ? "She's comped — free for life, paywall bypassed. Toggle off to put her back on the regular paid track (she'll hit /pricing next visit)."
          : "She's on the regular paid track. Toggle on to grandfather her in for free — paywall bypass, Stripe webhook will never overwrite it."}
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={flip}
          disabled={pending}
          className={`px-5 py-2.5 rounded-full font-body text-label-sm tracking-widest uppercase shadow-elevation-1 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 ${
            isComped
              ? "border border-charcoal/60 text-charcoal bg-transparent"
              : "bg-charcoal text-cream"
          }`}
        >
          {pending
            ? isComped
              ? "Removing comp…"
              : "Comping…"
            : isComped
            ? "Remove comp"
            : "Comp her (free)"}
        </button>
      </div>
      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}
    </div>
  );
}

function formatStatus(s: string | null): string {
  if (!s) return "no subscription";
  if (s === "comped") return "Comped (free)";
  if (s === "trialing") return "Trialing";
  if (s === "active") return "Active";
  if (s === "past_due") return "Past due";
  if (s === "canceled") return "Canceled";
  if (s === "incomplete") return "Incomplete";
  if (s === "incomplete_expired") return "Incomplete (expired)";
  if (s === "unpaid") return "Unpaid";
  return s;
}
