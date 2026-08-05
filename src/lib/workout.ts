/**
 * RIVEN's own training board (the /coach/train tab).
 *
 * A fixed push/pull/legs split, three days a week. The plan itself is static
 * (defined here); what's stored per user is only the working numbers —
 * sets / reps / weight — in the `WorkoutSetting` table.
 *
 * Each exercise's demo GIF lives in /public/exercises/<gif>. The GIFs were
 * matched to these movements by eye, one per exercise; `cable-lateral-raise`
 * is deliberately reused on both Push and Legs day (same movement, two slots).
 */

import { prisma } from "@/lib/prisma";

export type DayKey = "push" | "pull" | "legs";

export type Exercise = {
  /** Stable id — the DB key. Never rename without a data migration. */
  key: string;
  name: string;
  /** The plan target, shown under the name (e.g. "4 × 6-8"). Display only. */
  target: string;
  gif: string;
  defaultSets: number;
  defaultReps: number;
};

export type WorkoutDay = {
  key: DayKey;
  label: string;
  /** The day of the week this usually lands on — a habit anchor, not a lock. */
  dayHint: string;
  exercises: Exercise[];
};

/** Every exercise starts here; the steppers move it from there. */
export const DEFAULT_WEIGHT_LB = 50;
/** Weight moves in 10 lb jumps — plates, not fiddly numbers. */
export const WEIGHT_STEP_LB = 10;
/** Weight sitting still this long = time to add a plate. */
export const STALE_WEIGHT_DAYS = 14;

export const WORKOUT_PLAN: WorkoutDay[] = [
  {
    key: "push",
    label: "Push",
    dayHint: "Mon",
    exercises: [
      { key: "incline-db-press", name: "Incline DB press", target: "4 × 6-8", gif: "incline-db-press.gif", defaultSets: 4, defaultReps: 8 },
      { key: "flat-press", name: "Machine / flat press", target: "3 × 8-10", gif: "flat-press.gif", defaultSets: 3, defaultReps: 10 },
      { key: "cable-lateral-raise", name: "Cable lateral raise", target: "4 × 12-15", gif: "cable-lateral-raise.gif", defaultSets: 4, defaultReps: 15 },
      { key: "db-lateral-raise", name: "DB lateral raise", target: "3 × 15-20", gif: "db-lateral-raise.gif", defaultSets: 3, defaultReps: 20 },
      { key: "overhead-press", name: "Overhead press", target: "3 × 8", gif: "overhead-press.gif", defaultSets: 3, defaultReps: 8 },
      { key: "rope-pushdown", name: "Rope pushdown", target: "3 × 12", gif: "rope-pushdown.gif", defaultSets: 3, defaultReps: 12 },
    ],
  },
  {
    key: "pull",
    label: "Pull",
    dayHint: "Wed",
    exercises: [
      { key: "pulldown", name: "Pull-up or pulldown", target: "4 × 6-10", gif: "pulldown.gif", defaultSets: 4, defaultReps: 10 },
      { key: "chest-supported-row", name: "Chest-supported row", target: "4 × 8-10", gif: "chest-supported-row.gif", defaultSets: 4, defaultReps: 10 },
      { key: "reverse-pec-deck", name: "Reverse pec deck", target: "4 × 15", gif: "reverse-pec-deck.gif", defaultSets: 4, defaultReps: 15 },
      { key: "face-pull", name: "Face pull", target: "3 × 20", gif: "face-pull.gif", defaultSets: 3, defaultReps: 20 },
      { key: "cable-curl", name: "Cable curl", target: "3 × 10-12", gif: "cable-curl.gif", defaultSets: 3, defaultReps: 12 },
    ],
  },
  {
    key: "legs",
    label: "Legs + abs",
    dayHint: "Fri",
    exercises: [
      { key: "leg-press", name: "Leg press", target: "4 × 10", gif: "leg-press.gif", defaultSets: 4, defaultReps: 10 },
      { key: "rdl", name: "RDL", target: "3 × 8", gif: "rdl.gif", defaultSets: 3, defaultReps: 8 },
      { key: "leg-curl", name: "Leg curl", target: "3 × 12", gif: "leg-curl.gif", defaultSets: 3, defaultReps: 12 },
      // Same movement as Push day, tracked separately so the numbers can drift.
      { key: "cable-lateral-raise-legs", name: "Cable lateral raise", target: "4 × 15", gif: "cable-lateral-raise.gif", defaultSets: 4, defaultReps: 15 },
      { key: "cable-crunch", name: "Cable crunch (weighted)", target: "3 × 12", gif: "cable-crunch.gif", defaultSets: 3, defaultReps: 12 },
      { key: "hanging-leg-raise", name: "Hanging leg raise", target: "3 × failure", gif: "hanging-leg-raise.gif", defaultSets: 3, defaultReps: 12 },
    ],
  },
];

/** Flat lookup so an action can validate an incoming exerciseKey. */
export const EXERCISES_BY_KEY: Record<string, Exercise> = Object.fromEntries(
  WORKOUT_PLAN.flatMap((d) => d.exercises).map((e) => [e.key, e]),
);

/** What the UI renders for one exercise row: the plan + this user's numbers. */
export type ExerciseRow = Exercise & {
  sets: number;
  reps: number;
  weightLb: number;
  /** Whole days since the WEIGHT last moved. null = never changed from default. */
  weightAgeDays: number | null;
  /** "9 days ago" — the weight's last change, already humanized. */
  weightChangedLabel: string;
  /** Weight has sat still long enough that it's time to go up. */
  isStale: boolean;
};

export type WorkoutBoard = {
  days: (Omit<WorkoutDay, "exercises"> & { exercises: ExerciseRow[] })[];
};

/**
 * Days between two instants, floored, using calendar-agnostic ms math. Good
 * enough for a "how long since I touched this" label — we don't need timezone
 * precision here, and whole-day rounding keeps the copy stable through the day.
 */
export function daysSince(then: Date, now: Date = new Date()): number {
  const ms = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Humanize a day count the way RIVEN reads it out loud: days up to a fortnight,
 * then weeks, then months. No dates anywhere — the point is elapsed time.
 */
export function relativeDayLabel(days: number | null): string {
  if (days == null) return "not changed yet";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days === 7) return "a week ago";
  if (days < 14) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "a month ago";
  return `${Math.floor(days / 30)} months ago`;
}

/**
 * Load the full board for a user: the static plan joined with their saved
 * numbers. Exercises with no row yet fall back to the plan defaults at
 * DEFAULT_WEIGHT_LB, so a brand-new user sees a complete board immediately
 * without us having to seed rows.
 */
export async function getWorkoutBoard(userId: string): Promise<WorkoutBoard> {
  const saved = await prisma.workoutSetting.findMany({ where: { userId } });
  const byKey = new Map(saved.map((s) => [s.exerciseKey, s]));
  const now = new Date();

  return {
    days: WORKOUT_PLAN.map((day) => ({
      key: day.key,
      label: day.label,
      dayHint: day.dayHint,
      exercises: day.exercises.map((ex): ExerciseRow => {
        const row = byKey.get(ex.key);
        const weightAgeDays = row ? daysSince(row.weightChangedAt, now) : null;
        return {
          ...ex,
          sets: row?.sets ?? ex.defaultSets,
          reps: row?.reps ?? ex.defaultReps,
          weightLb: row?.weightLb ?? DEFAULT_WEIGHT_LB,
          weightAgeDays,
          weightChangedLabel: relativeDayLabel(weightAgeDays),
          isStale: weightAgeDays != null && weightAgeDays >= STALE_WEIGHT_DAYS,
        };
      }),
    })),
  };
}
