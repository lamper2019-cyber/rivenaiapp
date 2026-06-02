import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";

/**
 * Daily mood ribbon — one-tap-a-day community pulse.
 *
 * The friction floor for "engaging with the community" was already pretty
 * low (the Sunday ritual is weekly + optional). This is lower: a single
 * tap, every day, in exchange for seeing what the rest of the room is
 * feeling. No writing, no streaks, no penalty for skipping.
 *
 * Bucket boundary is Central-time midnight, matching meals/steps/check-ins.
 * Re-tapping the same day updates her mood instead of stacking rows —
 * mood can shift between 9am and 9pm and that's fine.
 */

export type MoodKind = "tired" | "blah" | "good" | "fire";

/**
 * Per-mood cause chips. Different chips respond to different moods so
 * the follow-up actually fits where she is — "What's making it tired?"
 * needs a different vocabulary than "What's making it fire?"
 *
 * Stored loosely as plain strings on DailyMood.cause; validation lives
 * server-side (mood-action.ts) and reads the mood from the DB before
 * accepting a cause. Frontend reads the same map to render chips.
 */
export const MOOD_CAUSES_BY_MOOD: Record<MoodKind, readonly string[]> = {
  tired: ["sleep", "period", "stress", "work"],
  blah: ["motivation", "sleep", "weather", "vibes"],
  good: ["workout", "food", "a win", "vibes"],
  fire: ["workout", "momentum", "a win", "locked in"],
} as const;

/** Union of every cause that can appear under ANY mood — used as a
 *  loose validation backstop. The strict per-mood check happens in
 *  the server action where we know which mood the row carries. */
export const ALL_MOOD_CAUSES: readonly string[] = Array.from(
  new Set(Object.values(MOOD_CAUSES_BY_MOOD).flatMap((arr) => [...arr])),
);

export const MOOD_KINDS: MoodKind[] = ["tired", "blah", "good", "fire"];

export const MOOD_EMOJI: Record<MoodKind, string> = {
  tired: "😤",
  blah: "🥱",
  // 🤩 reads as "I'm having a good one" with more enthusiasm than the
  // flat 🙂; per RIVEN. Stored key is still "good" — no migration needed.
  good: "🤩",
  fire: "🔥",
};

// Brand-safe shorthand for the aggregate sentence ("23 women logged 🔥 today").
// The label is plural-friendly without needing a unit ("good moods" reads weird).
export const MOOD_LABEL: Record<MoodKind, string> = {
  tired: "tired",
  blah: "meh",
  good: "good",
  fire: "fire",
};

/** Display labels for cause chips. Currently identity (the chip key
 *  IS the human label). Kept as a function so future renames (e.g.
 *  "locked in" → "locked-in") don't require schema churn. */
export function moodCauseLabel(cause: string): string {
  return cause;
}

/** A "valid cause" is any string that appears in at least one mood's
 *  chip list. Strict per-mood validation happens server-side. */
export function isMoodCause(value: string | null | undefined): value is string {
  return typeof value === "string" && ALL_MOOD_CAUSES.includes(value);
}

export type DailyMoodSnapshot = {
  myMood: MoodKind | null;
  myCause: string | null;
  counts: Record<MoodKind, number>;
  // The single mood with the highest count. Tie-breaker: earlier in MOOD_KINDS
  // (tired → blah → good → fire) so a 1-1-1-1 day still picks something.
  // Null when the whole community hasn't tapped yet — render handles that.
  topMood: MoodKind | null;
  totalTaps: number;
};

const ACTIVE_STATUSES = ["trialing", "active", "comped"];

export async function getDailyMoodSnapshot(
  userId: string,
): Promise<DailyMoodSnapshot> {
  const today = startOfCentralDay();

  const [mine, rows] = await Promise.all([
    prisma.dailyMood.findUnique({
      where: { userId_centralDate: { userId, centralDate: today } },
      select: { mood: true, cause: true },
    }),
    prisma.dailyMood.findMany({
      where: {
        centralDate: today,
        user: {
          role: "CLIENT",
          subscriptionStatus: { in: ACTIVE_STATUSES },
        },
      },
      select: { mood: true },
    }),
  ]);

  const counts: Record<MoodKind, number> = {
    tired: 0,
    blah: 0,
    good: 0,
    fire: 0,
  };
  for (const r of rows) {
    if (isMoodKind(r.mood)) counts[r.mood] += 1;
  }

  let topMood: MoodKind | null = null;
  let topCount = 0;
  for (const kind of MOOD_KINDS) {
    if (counts[kind] > topCount) {
      topCount = counts[kind];
      topMood = kind;
    }
  }

  const totalTaps = rows.length;
  const myMood = isMoodKind(mine?.mood ?? null) ? (mine!.mood as MoodKind) : null;
  // Cause is stored as a plain string; accept anything currently in our
  // chip vocabulary OR a historical value still attached to a row.
  const myCause = mine?.cause ?? null;

  return { myMood, myCause, counts, topMood, totalTaps };
}

/**
 * Personal mood history for the /profile page. Last 30 central-days of
 * (mood, cause) for one user — drives a small heatmap-ish strip + cause
 * tally on her profile so she can see her own patterns.
 */
export type MoodHistoryEntry = {
  centralDate: Date;
  mood: MoodKind;
  cause: string | null;
};

export async function getMyMoodHistory(
  userId: string,
  days: number = 30,
): Promise<MoodHistoryEntry[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const rows = await prisma.dailyMood.findMany({
    where: { userId, centralDate: { gte: cutoff } },
    orderBy: { centralDate: "asc" },
    select: { mood: true, cause: true, centralDate: true },
  });
  return rows
    .filter((r): r is { mood: string; cause: string | null; centralDate: Date } =>
      isMoodKind(r.mood),
    )
    .map((r) => ({
      centralDate: r.centralDate,
      mood: r.mood as MoodKind,
      // Cause is stored as a plain string with no DB-level constraint —
      // pass it through. Renderers display whatever's there; if the
      // chip vocabulary changed since she tapped, the tally still shows
      // the legacy value with no special handling.
      cause: r.cause,
    }));
}

export function isMoodKind(value: string | null | undefined): value is MoodKind {
  return value === "tired" || value === "blah" || value === "good" || value === "fire";
}
