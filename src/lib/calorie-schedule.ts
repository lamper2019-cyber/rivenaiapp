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
