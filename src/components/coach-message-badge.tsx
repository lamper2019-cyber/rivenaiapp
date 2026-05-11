"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "riven_seen_coach_msg_id";

/**
 * Floating "Message from Sean" chip in the top-right of the home screen.
 *
 * Persistent — renders whenever the server hands us a recent (≤30d) coach
 * message id, regardless of read state, so the client can always scroll
 * back. The gold halo PULSES only when the latest message is unread (i.e.
 * the id doesn't match the one stored in localStorage). Tapping the chip
 * routes to /messages, which marks the latest id as seen and clears the
 * pulse on the next dashboard load.
 */
export function CoachMessageBadge({ latestMessageId }: { latestMessageId: string }) {
  // null until we've read localStorage — avoids hydration flicker between
  // "unread" and "read" on the very first paint.
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setSeen(stored === latestMessageId);
    } catch {
      setSeen(false);
    }
  }, [latestMessageId]);

  // Defer rendering until we know read/unread to prevent a flash of the
  // glowing state for already-read messages.
  if (seen === null) return null;

  const haloPulseClass = seen ? "" : "riven-glow-pulse";

  return (
    <Link
      href="/messages"
      aria-label={
        seen ? "View messages from Sean" : "New message from Sean"
      }
      className="fixed top-[calc(env(safe-area-inset-top)_+_12px)] right-3 z-50 inline-flex items-center gap-2 rounded-full bg-cream/95 backdrop-blur-md border border-gold/60 text-charcoal pl-2 pr-3 py-1.5 shadow-elevation-1 active:scale-95 transition-transform"
    >
      <span className="relative flex items-center justify-center w-6 h-6">
        <span
          className={`absolute inset-0 rounded-full bg-gold/30 ${haloPulseClass}`}
          aria-hidden
        />
        <span className="absolute inset-[3px] rounded-full bg-cream" aria-hidden />
        <span className="material-symbols-outlined relative text-gold text-[16px] filled">
          auto_awesome
        </span>
      </span>
      <span className="font-body text-label-sm tracking-wide">
        Message from Sean
      </span>
    </Link>
  );
}

/**
 * Mark the given coach message id as seen. Called from /messages on mount
 * after the inbox renders.
 */
export function markCoachMessageSeen(messageId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, messageId);
  } catch {
    /* swallow — private mode etc. */
  }
}
