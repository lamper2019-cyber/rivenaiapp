/**
 * Per-day-of-week calorie cycling for advanced clients.
 *
 * Stored in Profile.dailyCalorieSchedule as JSONB, shape:
 *   { Sun: 1700, Mon: 1800, Tue: 1750, Wed: 1800,
 *     Thu: 1800, Fri: 2000, Sat: 2100 }
 *
 * NULL on Profile = flat cutCalories applies to every day (default).
 * Every consumer of cutCalories should call getTodayCalorieTarget()
 * instead so calorie-cycling clients pull the right number per day.
 */

export const DAY_KEYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type DailyCalorieSchedule = Record<DayKey, number>;

/** Per-day floor / ceiling. Matches the coach form inputs and the Zod
 *  validation in coach-actions.ts (ScheduleDaysSchema). Keep these three
 *  in sync if the range ever changes. */
export const MIN_DAY_CAL = 800;
export const MAX_DAY_CAL = 5000;

/**
 * Resolve today's calorie target for a given profile in Central time.
 * Falls back to flat cutCalories when the schedule is unset OR if the
 * stored JSON is malformed — never throws, never returns null. Safe to
 * call from every read path.
 */
export function getTodayCalorieTarget(
  profile: { cutCalories: number; dailyCalorieSchedule: unknown },
  now: Date = new Date(),
): number {
  const schedule = parseSchedule(profile.dailyCalorieSchedule);
  if (!schedule) return profile.cutCalories;
  const key = centralDayOfWeek(now);
  return schedule[key];
}

/** Defensive parser — anything not matching the full 7-day shape returns null
 *  so we never silently use a half-populated schedule. */
export function parseSchedule(raw: unknown): DailyCalorieSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const out: Partial<DailyCalorieSchedule> = {};
  for (const key of DAY_KEYS) {
    const v = candidate[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
    out[key] = v;
  }
  return out as DailyCalorieSchedule;
}

/**
 * The mean of a 7-day cycle, rounded to the nearest 5 (brand rounding rule).
 *
 * This is the number that actually matters on a cut: RIVEN coaches the
 * WEEKLY average, not any single day. The coach builds a high/low pattern
 * (low weekdays, higher weekends) and this tells her where the week lands.
 */
export function weeklyAverageOf(schedule: DailyCalorieSchedule): number {
  const sum = DAY_KEYS.reduce((acc, k) => acc + schedule[k], 0);
  return Math.round(sum / 7 / 5) * 5;
}

/**
 * Slide the whole week up or down by an equal amount so its mean lands on
 * `targetAverage`, KEEPING the high/low shape intact. Set your pattern
 * first (Sat high, Mon low), then snap it onto the average you want.
 *
 * Each day is rounded to the nearest 5 and clamped to [MIN_DAY_CAL,
 * MAX_DAY_CAL]. When a day hits a clamp the resulting mean drifts slightly
 * off target — that's intentional and honest; the live readout in the form
 * shows the real average so the coach can nudge from there. Never throws.
 */
export function shiftToAverage(
  schedule: DailyCalorieSchedule,
  targetAverage: number,
): DailyCalorieSchedule {
  const current = DAY_KEYS.reduce((acc, k) => acc + schedule[k], 0) / 7;
  const delta = targetAverage - current;
  const out = {} as DailyCalorieSchedule;
  for (const k of DAY_KEYS) {
    const shifted = Math.round((schedule[k] + delta) / 5) * 5;
    out[k] = Math.min(MAX_DAY_CAL, Math.max(MIN_DAY_CAL, shifted));
  }
  return out;
}

/** Central-time short weekday for a Date — "Sun", "Mon", ..., "Sat". */
export function centralDayOfWeek(d: Date): DayKey {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(d);
  return (DAY_KEYS as readonly string[]).includes(label)
    ? (label as DayKey)
    : "Sun";
}
