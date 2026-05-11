"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "riven_seen_coach_msg_id";

/**
 * Floating "Message from Sean" chip in the top-right of the home screen.
 *
 * Renders nothing if the latest COACH message has already been seen
 * (matched against `localStorage[STORAGE_KEY]`). The chat page is responsible
 * for marking the latest coach message as seen when the user opens it.
 */
export function CoachMessageBadge({ latestMessageId }: { latestMessageId: string }) {
  // Hidden until we read localStorage — avoids hydration flash.
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setSeen(stored === latestMessageId);
    } catch {
      setSeen(false);
    }
  }, [latestMessageId]);

  if (seen === null || seen) return null;

  return (
    <Link
      href="/chat"
      aria-label="View message from Sean"
      className="fixed top-[calc(env(safe-area-inset-top)+12px)] right-3 z-50 inline-flex items-center gap-2 rounded-full bg-cream/95 backdrop-blur-md border border-gold/60 text-charcoal pl-2 pr-3 py-1.5 shadow-elevation-1 riven-float-pulse active:scale-95 transition-transform"
    >
      <span className="relative flex items-center justify-center w-6 h-6">
        <span className="absolute inset-0 rounded-full bg-gold/30" aria-hidden />
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
 * Mark the given coach message id as seen. Call from the chat page on mount
 * once initialMessages has loaded.
 */
export function markCoachMessageSeen(messageId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, messageId);
  } catch {
    /* swallow — private mode etc. */
  }
}
