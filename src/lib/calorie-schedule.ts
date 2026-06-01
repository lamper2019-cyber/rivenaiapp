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

/**
 * Calorie banking ("smooth my week") clamp deltas. Today's banked target is
 * never allowed below cutCalories − floor or above cutCalories + ceiling, no
 * matter how much she banked or overshot. This keeps a single big under-eat
 * from turning into a 4,000-calorie day, and a single blowout from starving
 * her the next day. The excess beyond the clamp is intentionally forgiven.
 */
export const BANK_FLOOR_DELTA = 600;
export const BANK_CEILING_DELTA = 600;

/**
 * Pure calorie-banking math. Given the daily average the coach set (`base` =
 * cutCalories) and the calories she ACTUALLY ate on each completed day this
 * week so far (`priorActuals`, Sun-first, length = today's day index), replay
 * the week and return today's smoothed target.
 *
 * The model is "carry to the very next day": each day's leftover (target minus
 * what she ate) rolls forward exactly one day. Undereat → tomorrow goes up;
 * overeat → tomorrow goes down. It compounds correctly across the week because
 * each day's target already folds in the prior carry, but it's always applied
 * to the single next day, never spread across the rest of the week.
 *
 * Sunday (priorActuals empty) is a clean reset: target = base.
 *
 * A day with ZERO logged calories is treated as "no data," not "ate nothing" —
 * we can't tell a fast from a forgotten log, and crediting a forgotten day
 * with +600 the next day would reward not logging. So a zero-day is neutral:
 * it neither banks nor owes, and whatever was already banked passes through
 * untouched to the next day.
 *
 * Returns the clamped target plus the net `carryIn` applied today (positive =
 * she banked extra, negative = she owes) so the UI can explain the number.
 * Pure + never throws — safe to unit test in isolation.
 */
export function bankedTargetForToday(args: {
  base: number;
  priorActuals: number[];
}): { target: number; carryIn: number; adjusted: boolean } {
  const { base, priorActuals } = args;
  const floor = Math.max(0, base - BANK_FLOOR_DELTA);
  const ceil = base + BANK_CEILING_DELTA;
  const clamp = (n: number) => Math.min(ceil, Math.max(floor, n));

  let carry = 0;
  for (const actual of priorActuals) {
    // No log that day → no signal. Leave the running bank as-is.
    if (!Number.isFinite(actual) || actual <= 0) continue;
    const dayTarget = clamp(base + carry);
    // Leftover (or overage) from a logged day rolls to the next day.
    carry = dayTarget - actual;
  }

  const target = clamp(base + carry);
  return { target, carryIn: carry, adjusted: target !== base };
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
