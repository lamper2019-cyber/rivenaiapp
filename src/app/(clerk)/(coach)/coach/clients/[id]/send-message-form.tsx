"use client";

import { useRef, useState, useTransition } from "react";
import {
  sendCoachMessage,
  rewriteCoachMessage,
} from "@/lib/coach-actions";

export function SendMessageForm({ clientUserId }: { clientUserId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  // Two independent transitions so Rewriting and Sending can have separate
  // pending states (matters for the button labels and disabled flags).
  const [isSending, startSending] = useTransition();
  const [isRewriting, startRewriting] = useTransition();
  // Flash the textarea briefly when rewrite swaps the text so the coach
  // sees it visibly changed (without a heavy animation).
  const [justRewrote, setJustRewrote] = useState(false);

  const trimmed = content.trim();
  const busy = isSending || isRewriting;
  const sendDisabled = busy || trimmed.length === 0;
  const rewriteDisabled = busy || trimmed.length === 0;

  function handleSubmit(formData: FormData) {
    setError(null);
    setJustSent(false);
    startSending(async () => {
      const result = await sendCoachMessage(formData);
      if (result.ok) {
        setContent("");
        setJustSent(true);
        formRef.current?.reset();
      } else {
        setError(result.error);
      }
    });
  }

  async function handleRewrite() {
    if (rewriteDisabled) return;
    setError(null);
    setJustSent(false);
    setJustRewrote(false);

    const draft = content;
    startRewriting(async () => {
      const fd = new FormData();
      fd.append("draft", draft);
      const result = await rewriteCoachMessage(fd);
      if (result.ok) {
        // Replace the textarea value. Coach's original draft is gone — that's
        // intentional per spec. Brief flash so the change is visible.
        setContent(result.rewritten);
        setJustRewrote(true);
        // Auto-clear the flash after a moment.
        window.setTimeout(() => setJustRewrote(false), 900);
      } else {
        // Keep the original text in the box (already there — we never
        // cleared it). Just surface the error.
        setError(result.error);
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="space-y-3"
    >
      <input type="hidden" name="clientUserId" value={clientUserId} />

      <label htmlFor="coach-message" className="sr-only">
        Message to client
      </label>
      <textarea
        id="coach-message"
        name="content"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          if (justSent) setJustSent(false);
        }}
        rows={4}
        maxLength={4000}
        placeholder="Write a personal note. She'll see this in her RIVEN chat as a message from you."
        className={`w-full rounded-md border bg-secondary-container/30 px-gutter py-3 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/60 focus:outline-none transition-colors resize-y min-h-[120px] ${
          justRewrote
            ? "border-gold ring-2 ring-gold/40"
            : "border-gold/40 focus:border-gold"
        }`}
        disabled={busy}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="font-body text-label-sm text-on-surface-variant/70">
          {content.length} / 4000
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Rewrite — secondary action. Outlined gold so it reads as a
              coaching tool, distinct from the primary charcoal Send. */}
          <button
            type="button"
            onClick={handleRewrite}
            disabled={rewriteDisabled}
            title={
              trimmed.length === 0
                ? "Type a message first."
                : "Rewrite in Sean's voice using R.I.S.E."
            }
            className="rounded-md border border-gold/70 bg-cream/60 text-charcoal px-4 py-3 font-body text-body-md hover:bg-secondary-container/50 hover:border-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <span
              className={`material-symbols-outlined text-[18px] text-gold ${
                isRewriting ? "animate-spin" : ""
              }`}
            >
              {isRewriting ? "progress_activity" : "auto_awesome"}
            </span>
            {isRewriting ? "Rewriting…" : "Rewrite"}
          </button>

          <button
            type="submit"
            disabled={sendDisabled}
            className="rounded-md bg-charcoal text-cream px-5 py-3 font-body text-body-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
            {isSending ? "Sending…" : "Send to client"}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-soft-red/10 border border-soft-red/40 px-gutter py-3 font-body text-body-md text-soft-red"
        >
          {error}
        </p>
      )}

      {justSent && (
        <p
          role="status"
          className="rounded-md bg-sage/10 border border-sage/40 px-gutter py-3 font-body text-body-md text-charcoal"
        >
          Sent. She&apos;ll see it next time she opens RIVEN chat.
        </p>
      )}
    </form>
  );
}
