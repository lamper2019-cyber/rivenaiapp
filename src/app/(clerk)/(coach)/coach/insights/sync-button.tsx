"use client";

import { useState, useTransition } from "react";
import { runManualSync, type ManualSyncResult } from "./actions";

/**
 * "Sync now" — pulls the latest Instagram + funnel numbers on demand. The
 * daily cron does this automatically; this is for when RIVEN wants a fresh
 * read right after posting.
 */
export function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ManualSyncResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      setResult(await runManualSync());
    });
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full border border-charcoal px-4 py-2 font-body text-label-md tracking-widest uppercase text-charcoal inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
      >
        <span
          className={`material-symbols-outlined text-base ${isPending ? "animate-spin" : ""}`}
        >
          {isPending ? "progress_activity" : "sync"}
        </span>
        {isPending ? "Syncing…" : "Sync now"}
      </button>
      {result?.ok ? (
        <span className="font-body text-label-md text-sage">
          Synced {result.postsSynced} post{result.postsSynced === 1 ? "" : "s"}
          {result.enriched > 0 ? ` · ${result.enriched} read + transcribed` : ""}
          {result.errors.length ? ` · ${result.errors.length} skipped` : ""}
        </span>
      ) : result && !result.ok ? (
        <span className="font-body text-label-md text-soft-red">{result.error}</span>
      ) : null}
    </div>
  );
}
