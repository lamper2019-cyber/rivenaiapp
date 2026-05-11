"use client";

import { useRef, useState, useTransition } from "react";
import { sendCoachMessage } from "@/lib/coach-actions";

export function SendMessageForm({ clientUserId }: { clientUserId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const trimmed = content.trim();
  const disabled = isPending || trimmed.length === 0;

  function handleSubmit(formData: FormData) {
    setError(null);
    setJustSent(false);
    startTransition(async () => {
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
        className="w-full rounded-md border border-gold/40 bg-secondary-container/30 px-gutter py-3 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/60 focus:border-gold focus:outline-none transition-colors resize-y min-h-[120px]"
        disabled={isPending}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="font-body text-label-sm text-on-surface-variant/70">
          {content.length} / 4000
        </p>
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-charcoal text-cream px-5 py-3 font-body text-body-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[20px]">send</span>
          {isPending ? "Sending…" : "Send to client"}
        </button>
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
