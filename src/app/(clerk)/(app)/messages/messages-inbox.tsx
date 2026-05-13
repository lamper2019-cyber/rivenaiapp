"use client";

import { useEffect } from "react";
import { markCoachMessageSeen } from "@/components/coach-message-badge";

export type CoachMessage = {
  id: string;
  content: string;
  createdAt: string; // ISO — server can't pass Date through a client component boundary
};

/**
 * Renders the coach-message list and clears the dashboard's unread state on
 * mount by writing the current timestamp as "last seen at" in localStorage.
 */
export function MessagesInbox({ messages }: { messages: CoachMessage[] }) {
  useEffect(() => {
    if (messages.length > 0) markCoachMessageSeen();
  }, [messages]);

  return (
    <ul className="space-y-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-4 shadow-elevation-1"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="font-body text-label-md tracking-widest uppercase text-on-secondary-container inline-flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full bg-gold"
                aria-hidden
              />
              Sean
            </p>
            <time
              dateTime={m.createdAt}
              className="font-body text-label-sm text-on-surface-variant/80"
            >
              {formatTimestamp(m.createdAt)}
            </time>
          </div>
          <p className="font-body text-body-md text-charcoal whitespace-pre-wrap leading-relaxed">
            {m.content}
          </p>
        </li>
      ))}
    </ul>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
}
