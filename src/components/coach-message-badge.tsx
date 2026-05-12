"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "riven_seen_coach_msg_at";

export type CoachMessageSummary = {
  id: string;
  createdAt: string; // ISO
};

/**
 * Floating "Message from Sean" chip in the top-right of the home screen.
 *
 * Persistent — renders whenever the server hands us at least one recent
 * (≤30d) coach message so the client can always scroll back. State shifts
 * based on the localStorage "last seen at" timestamp:
 *
 *   Unread (any message createdAt > seenAt):
 *     - Solid gold pill, charcoal text, red count dot on the avatar.
 *   Read (no message newer than seenAt):
 *     - Charcoal pill, cream text, no dot.
 *
 * Tapping routes to /messages, which writes Date.now() to localStorage and
 * collapses the chip back to the read state on the next dashboard load.
 */
export function CoachMessageBadge({ messages }: { messages: CoachMessageSummary[] }) {
  // null until we've read localStorage — avoids hydration flicker between
  // unread and read on the very first paint.
  const [seenAt, setSeenAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? parseInt(stored, 10) : 0;
      setSeenAt(Number.isFinite(parsed) ? parsed : 0);
    } catch {
      setSeenAt(0);
    }
  }, []);

  if (seenAt === null) return null;
  if (messages.length === 0) return null;

  const unreadCount = messages.filter(
    (m) => new Date(m.createdAt).getTime() > seenAt,
  ).length;
  const isUnread = unreadCount > 0;

  // Unread: solid gold + heartbeat glow (the heartbeat replaces the static
  // shadow so the chip's elevation breathes). Read: quiet charcoal pill.
  const stateClasses = isUnread
    ? "bg-gold text-charcoal border-gold/80 riven-coach-heartbeat"
    : "bg-charcoal text-cream border-charcoal shadow-elevation-1";

  return (
    <Link
      href="/messages"
      aria-label={
        isUnread
          ? `${unreadCount} new ${unreadCount === 1 ? "message" : "messages"} from Sean`
          : "View messages from Sean"
      }
      className={`fixed top-[calc(env(safe-area-inset-top)_+_12px)] right-3 z-50 inline-flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 active:scale-95 transition-colors ${stateClasses}`}
    >
      <span className="relative inline-block w-7 h-7">
        {/* Plain <img> rather than next/image: the asset is tiny, fixed-size,
            and always rendered — Image optimization adds no real win here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sean.jpg"
          alt=""
          className="w-7 h-7 rounded-full object-cover"
        />
        {isUnread && (
          <span
            className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-[3px] rounded-full bg-red-500 text-cream text-[10px] font-semibold leading-none ring-2 ring-gold"
            aria-hidden
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </span>
      <span className="font-body text-label-sm tracking-wide">
        Message from Sean
      </span>
    </Link>
  );
}

/**
 * Mark the moment-of-visit as the new "seen at" timestamp. Called from
 * /messages on mount so any messages received before this instant collapse
 * back to the read state on the next dashboard load.
 */
export function markCoachMessageSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* swallow — private mode etc. */
  }
}
