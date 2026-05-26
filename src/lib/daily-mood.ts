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

export const MOOD_KINDS: MoodKind[] = ["tired", "blah", "good", "fire"];

export const MOOD_EMOJI: Record<MoodKind, string> = {
  tired: "😤",
  blah: "🥱",
  good: "🙂",
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

export type DailyMoodSnapshot = {
  myMood: MoodKind | null;
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
      select: { mood: true },
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

  return { myMood, counts, topMood, totalTaps };
}

export function isMoodKind(value: string | null | undefined): value is MoodKind {
  return value === "tired" || value === "blah" || value === "good" || value === "fire";
}
