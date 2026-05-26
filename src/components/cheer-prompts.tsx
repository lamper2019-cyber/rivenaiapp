"use client";

import { useState, useTransition } from "react";
import type { CheerCandidate } from "@/lib/cheer";
import { sendCheer } from "@/app/(clerk)/(app)/dashboard/cheer-action";

/**
 * Peer-to-peer cheer prompts. Each card represents a client having a
 * hard day; one tap sends a 🌹 and a push notification to her. Local
 * state hides the card after she taps so the dashboard doesn't beg
 * twice for the same person.
 */
export function CheerPrompts({
  candidates,
}: {
  candidates: CheerCandidate[];
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [optimisticCounts, setOptimisticCounts] = useState<
    Record<string, number>
  >({});

  const visible = candidates.filter(
    (c) => !hidden.has(`${c.recipientUserId}|${c.context}`),
  );
  if (visible.length === 0) return null;

  function handleSend(c: CheerCandidate) {
    const key = `${c.recipientUserId}|${c.context}`;
    setOptimisticCounts((m) => ({
      ...m,
      [key]: (m[key] ?? c.cheerCountForContext) + 1,
    }));
    startTransition(async () => {
      const r = await sendCheer({
        recipientUserId: c.recipientUserId,
        context: c.context,
      });
      // Hide on success OR on "already sent" — either way, we don't want
      // to prompt the user for this trigger again.
      if (r.ok || r.error === "Already cheered this context.") {
        setHidden((s) => new Set(s).add(key));
      }
    });
  }

  return (
    <section className="space-y-3">
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        Someone could use a 🌹
      </p>
      <ul className="space-y-2">
        {visible.map((c) => {
          const key = `${c.recipientUserId}|${c.context}`;
          const count = optimisticCounts[key] ?? c.cheerCountForContext;
          return (
            <li
              key={key}
              className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-3 shadow-elevation-1"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <p className="flex-1 min-w-0 font-body text-body-md text-charcoal leading-snug">
                  {c.reason}
                </p>
                <button
                  type="button"
                  onClick={() => handleSend(c)}
                  disabled={pending}
                  className="shrink-0 inline-flex items-center gap-1.5 bg-charcoal text-cream px-4 py-2 rounded-full font-body text-label-sm tracking-wide hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                >
                  <span aria-hidden>🌹</span>
                  Send
                </button>
              </div>
              {count > 0 && (
                <p className="font-body text-label-sm text-on-surface-variant/80 mt-1.5">
                  {count === 1
                    ? "1 woman is rooting for her."
                    : `${count} women are rooting for her.`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
