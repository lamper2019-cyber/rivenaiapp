"use client";

import { useState, useTransition } from "react";
import {
  compAllExistingClients,
  type CompAllClientsResult,
} from "@/lib/coach-actions";

/**
 * Coach-only "grandfather everyone in for free, right now" button. Flips
 * every existing CLIENT user's subscriptionStatus to "comped" — bypasses
 * the paywall, never overwritten by the Stripe webhook. Two-step confirm
 * matches the Monday check-in button pattern so it can't fire accidentally.
 *
 * Idempotent. Safe to run multiple times. Future signups still go through
 * the normal /pricing + Stripe flow.
 */
export function CompAllClientsButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<CompAllClientsResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      setResult(null);
      return;
    }
    setConfirming(false);
    setResult(null);
    startTransition(async () => {
      const r = await compAllExistingClients();
      setResult(r);
    });
  }

  function cancel() {
    setConfirming(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className={`rounded-md px-5 py-3 font-body text-body-md inline-flex items-center gap-2 transition-all active:scale-95 ${
            confirming
              ? "bg-soft-red text-cream hover:opacity-90"
              : "bg-secondary-container/60 border border-gold text-charcoal hover:bg-secondary-container"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isPending
              ? "progress_activity"
              : confirming
              ? "warning"
              : "card_giftcard"}
          </span>
          {isPending
            ? "Comping everyone…"
            : confirming
            ? "Confirm — comp every existing client"
            : "Comp all current clients"}
        </button>
        {confirming && !isPending && (
          <button
            type="button"
            onClick={cancel}
            className="font-body text-label-md tracking-widest uppercase text-on-surface-variant hover:text-charcoal transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      <p className="font-body text-label-sm text-on-surface-variant/80">
        Sets every existing client&apos;s subscription to{" "}
        <code className="text-charcoal">comped</code> — free for life, paywall
        bypassed. Idempotent: safe to run more than once. Future sign-ups still
        go through the normal /pricing + Stripe trial flow.
      </p>

      {result?.ok && (
        <div
          role="status"
          className="rounded-md bg-sage/10 border border-sage/40 px-gutter py-3 space-y-1"
        >
          <p className="font-body text-body-md text-charcoal">
            Comped {result.comped} of {result.total} clients.
            {result.alreadyComped > 0
              ? ` ${result.alreadyComped} were already comped.`
              : ""}
          </p>
        </div>
      )}

      {result && !result.ok && (
        <p
          role="alert"
          className="rounded-md bg-soft-red/10 border border-soft-red/40 px-gutter py-3 font-body text-body-md text-soft-red"
        >
          {result.error}
        </p>
      )}
    </div>
  );
}
