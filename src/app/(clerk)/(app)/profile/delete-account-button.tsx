"use client";

import { useState, useTransition } from "react";
import { deleteMyAccount } from "./delete-actions";

/**
 * "Delete account" button + inline confirm dialog. The dialog requires the
 * user to type "DELETE" before the button activates, and the activation only
 * counts when entered through THIS UI — the server action re-checks the
 * confirmText so a leaked endpoint can't be abused.
 */
export function DeleteAccountButton() {
  const [showing, setShowing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteMyAccount(confirmText);
      // Successful delete redirects server-side. We only get here on error.
      if (!res.ok) {
        setError(res.error);
      }
    });
  }

  if (!showing) {
    return (
      <button
        type="button"
        onClick={() => setShowing(true)}
        className="font-body text-label-md tracking-widest uppercase text-soft-red hover:underline underline-offset-4"
      >
        Delete account
      </button>
    );
  }

  const canConfirm = confirmText.trim().toUpperCase() === "DELETE" && !pending;

  return (
    <div className="rounded-md border border-soft-red/40 bg-soft-red/5 px-gutter py-4 space-y-3">
      <div>
        <h3 className="font-display text-headline-md text-soft-red">
          Permanently delete your account?
        </h3>
        <p className="font-body text-body-md text-on-surface-variant mt-2">
          This wipes your profile, meal logs, check-ins, chat history, and push
          subscriptions. You won&apos;t be able to sign back in. There is no undo.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="font-body text-label-sm tracking-wide uppercase text-on-surface-variant">
          Type DELETE to confirm
        </span>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={pending}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="DELETE"
          className="w-full bg-cream border border-outline-variant focus:border-soft-red focus:ring-0 outline-none rounded-md px-3 py-2 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/40"
        />
      </label>

      {error && (
        <p className="font-body text-label-sm text-soft-red">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={!canConfirm}
          className="bg-soft-red text-cream rounded-full px-5 py-3 font-body text-label-md tracking-widest uppercase hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {pending ? "Deleting…" : "Delete forever"}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowing(false);
            setConfirmText("");
            setError(null);
          }}
          disabled={pending}
          className="font-body text-label-md tracking-widest uppercase text-on-surface-variant hover:text-charcoal disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
