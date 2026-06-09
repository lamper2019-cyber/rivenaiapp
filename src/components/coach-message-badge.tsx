"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "riven_seen_coach_msg_at";

export type CoachMessageSummary = {
  id: string;
  createdAt: string; // ISO
};

/**
 * "Message from RIVEN" pill — top-right of the home screen.
 *
 * Single visual treatment: solid charcoal pill, cream text, serif S
 * monogram. Same look as the log-button pill so the dashboard reads
 * as a small set of consistent charcoal tappables. A red count dot
 * on the avatar is the only unread cue — no gold halo, no breath
 * animation (per RIVEN's 2026-05-27 evening direction).
 *
 * Tap routes to /chat (the unified RIVEN thread, with typing input).
 * Visiting /chat calls `markCoachMessageSeen` which writes Date.now()
 * to localStorage; the badge's "unread" state is everything newer
 * than that timestamp. Self-hides when she has zero coach messages
 * on record (new clients before the first cron fires).
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

  return (
    <Link
      href="/chat"
      aria-label={
        isUnread
          ? `${unreadCount} new ${unreadCount === 1 ? "message" : "messages"} from RIVEN`
          : "View messages from RIVEN"
      }
      className="fixed top-[calc(env(safe-area-inset-top)_+_12px)] right-3 z-50 inline-flex items-center gap-2 rounded-full bg-charcoal text-cream border border-charcoal pl-1 pr-3 py-1 shadow-elevation-1 active:scale-95 transition-transform"
    >
      <span className="relative inline-block w-7 h-7">
        {/* Brand monogram — reads cleanly at any size and matches the
            serif typography elsewhere in RIVEN. */}
        <span
          aria-hidden
          className="flex w-7 h-7 rounded-full bg-cream text-charcoal items-center justify-center font-display text-[16px] leading-none"
        >
          R
        </span>
        {isUnread && (
          <span
            className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-[3px] rounded-full bg-red-500 text-cream text-[10px] font-semibold leading-none ring-2 ring-charcoal"
            aria-hidden
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </span>
      <span className="font-body text-label-sm tracking-wide">
        Message from RIVEN
      </span>
    </Link>
  );
}

/**
 * Mark the moment-of-visit as the new "seen at" timestamp. Called from
 * /chat on mount so any messages received before this instant collapse
 * back to the read state on the next dashboard load.
 */
export function markCoachMessageSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* swallow — private mode etc. */
  }
}
