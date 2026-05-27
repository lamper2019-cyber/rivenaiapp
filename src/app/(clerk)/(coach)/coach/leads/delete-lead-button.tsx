"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { deleteLead, type DeleteLeadResult } from "@/lib/coach-actions";

/**
 * Two-tap confirm to pull a lead row. First tap arms the button (turns
 * soft-red, swaps copy to "Tap again to delete"). Second tap fires the
 * server action. The armed state auto-resets after a few seconds so a
 * stray tap doesn't sit there waiting to wipe a row.
 */
export function DeleteLeadButton({
  leadId,
  firstName,
}: {
  leadId: string;
  firstName: string;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (disarmTimer.current) clearTimeout(disarmTimer.current);
    };
  }, []);

  function arm() {
    setError(null);
    setArmed(true);
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    disarmTimer.current = setTimeout(() => setArmed(false), 4000);
  }

  function fire() {
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    const fd = new FormData();
    fd.set("leadId", leadId);
    startTransition(async () => {
      const r: DeleteLeadResult = await deleteLead(fd);
      if (!r.ok) {
        setError(r.error);
        setArmed(false);
      }
      // On success the page revalidates and this row unmounts — no local
      // state cleanup needed.
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={armed ? fire : arm}
        disabled={pending}
        aria-label={
          armed
            ? `Tap again to delete ${firstName}`
            : `Delete ${firstName}`
        }
        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-body text-label-sm tracking-wide transition-colors disabled:opacity-50 ${
          armed
            ? "bg-soft-red/15 border border-soft-red/60 text-charcoal"
            : "border border-charcoal/30 text-on-surface-variant hover:text-charcoal hover:border-charcoal/60"
        }`}
      >
        <span className="material-symbols-outlined text-[16px]">
          {pending ? "hourglass_top" : "delete"}
        </span>
        {pending
          ? "Deleting…"
          : armed
          ? "Tap again to delete"
          : "Delete lead"}
      </button>
      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}
    </div>
  );
}
