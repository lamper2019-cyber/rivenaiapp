/**
 * Shared date helpers. The whole app reasons about days in Central time
 * (America/Chicago) per the brand voice and the handoff convention, but
 * Railway runs the Node server in UTC. Mixing those two leads to subtle
 * "day rolled over but only for the server" bugs — e.g. meals logged at
 * 9 PM CDT being filed under tomorrow's UTC date.
 *
 * Always use this helper for any DailyTotals.date keying or any "today"
 * comparison. Never call `new Date().setHours(0,0,0,0)` again — that
 * silently uses server-local midnight, which on Railway is UTC midnight.
 */

/**
 * UTC instant of midnight at the start of today in Central time. Used for
 * both DailyTotals.date keying AND MealLog.createdAt range filtering, so
 * writes and reads always agree.
 *
 * Example: at 2026-05-13 21:00 CDT (= 2026-05-14 02:00 UTC), returns
 * 2026-05-13 05:00 UTC — the actual moment Central time crossed into
 * May 13. Handles DST (CDT vs CST offset) automatically via Intl.
 */
export function startOfCentralDay(d: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  // Intl with hour12:false sometimes returns "24" for midnight — normalize.
  const hour =
    parseInt(parts.find((p) => p.type === "hour")!.value, 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  const second = parseInt(parts.find((p) => p.type === "second")!.value, 10);
  const msSinceCentralMidnight =
    ((hour * 60 + minute) * 60 + second) * 1000 + d.getMilliseconds();
  return new Date(d.getTime() - msSinceCentralMidnight);
}

/**
 * UTC instant of midnight on the 1st day of the current Central-time month.
 * Used as the keying column for monthly check-ins (formerly weekly). Stored
 * in the same WeeklyCheckIn.weekStart column we already had — we just
 * write a month-start date instead of a Monday now.
 *
 * Example: at 2026-05-20 21:00 CDT, returns 2026-05-01 05:00 UTC (= 2026-
 * 05-01 00:00 CDT).
 */
export function startOfCentralMonth(d: Date = new Date()): Date {
  // Day-1 of the current Central month, expressed in Central wall time.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  // Build "YYYY-MM-01T00:00:00" in Central, then resolve to UTC instant via
  // a round-trip through the day helper.
  const firstOfMonthUtcGuess = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  return startOfCentralDay(firstOfMonthUtcGuess);
}

/** "May 2026" for the monthly check-in eyebrow. Central-time anchored. */
export function formatCentralMonth(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/Chicago",
  });
}
