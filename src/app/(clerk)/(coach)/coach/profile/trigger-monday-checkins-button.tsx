"use client";

import { useState, useTransition } from "react";
import {
  triggerMondayCheckinBatch,
  type TriggerMondayCheckinsResult,
} from "@/lib/coach-actions";

/**
 * Coach-only manual trigger. Runs the same batch as the scheduled Monday
 * cron — useful for previewing voice before the cron service is wired,
 * or catching up after a missed run. Each press generates a fresh check-in
 * per client and posts to her thread + fires a push notification.
 */
export function TriggerMondayCheckinsButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<TriggerMondayCheckinsResult | null>(
    null
  );
  const [confirming, setConfirming] = useState(false);

  function handleClick() {
    if (!confirming) {
      // First click is the confirm gate so we don't accidentally fire AI
      // messages at every active client.
      setConfirming(true);
      setResult(null);
      return;
    }
    setConfirming(false);
    setResult(null);
    startTransition(async () => {
      const r = await triggerMondayCheckinBatch();
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
              : "send"}
          </span>
          {isPending
            ? "Sending check-ins…"
            : confirming
            ? "Confirm — send to every active client"
            : "Send Monday check-ins now"}
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
        Generates a personalized Sean-voice check-in for every active client
        based on her last 7 days, posts it in her message thread, and pushes
        a notification. Same work as the scheduled Monday cron.
      </p>

      {result?.ok && (
        <div
          role="status"
          className="rounded-md bg-sage/10 border border-sage/40 px-gutter py-3 space-y-1"
        >
          <p className="font-body text-body-md text-charcoal">
            Done. Sent to {result.sent} of {result.clientsTargeted} clients.
            {result.skipped > 0 ? ` Skipped ${result.skipped}.` : ""}
          </p>
          {result.errors.length > 0 && (
            <details className="font-body text-label-sm text-on-surface-variant/80">
              <summary className="cursor-pointer">
                See skipped reasons ({result.errors.length})
              </summary>
              <ul className="mt-2 space-y-1 list-none pl-0">
                {result.errors.map((e) => (
                  <li key={e.clientId}>
                    <code className="text-charcoal/70">{e.clientId.slice(-6)}</code>{" "}
                    — {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
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
