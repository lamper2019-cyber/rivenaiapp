/**
 * Week boundary helpers — anchored to America/Chicago (RIVEN's timezone) so the
 * weekly content prompt and Sunday check-in flip at Central-time midnight
 * regardless of where the Railway server is running. Without this, the server's
 * UTC week boundary fires ~5–6 hours early for Central-time clients.
 *
 * `startOfIsoWeek(now)` returns the Monday 00:00 in Central time of the
 * current calendar week (Monday-based ISO week), encoded as a UTC Date.
 */

const TZ = "America/Chicago";

/**
 * Read the offset from UTC that America/Chicago is at on a given instant.
 * Returns the number of hours UTC is AHEAD of Central (positive number).
 * Daylight saving: 5 during DST (CDT), 6 during standard time (CST).
 */
function chicagoOffsetHours(date: Date): number {
  // shortOffset gives "GMT-5" or "GMT-6" depending on DST.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const match = offsetPart.match(/GMT([+-]\d+)/);
  return match ? -parseInt(match[1], 10) : 6;
}

export function startOfIsoWeek(date: Date): Date {
  const offset = chicagoOffsetHours(date);
  // Shift "now" into a "wall clock UTC" that matches Central wall time, so
  // standard Date getters give us the correct day-of-week in Central.
  const centralWall = new Date(date.getTime() - offset * 60 * 60 * 1000);
  centralWall.setUTCHours(0, 0, 0, 0);
  const day = centralWall.getUTCDay(); // 0 = Sun … 6 = Sat (Central wall time)
  const diff = day === 0 ? -6 : 1 - day;
  centralWall.setUTCDate(centralWall.getUTCDate() + diff);
  // Shift back to real UTC instant for Monday 00:00 CENTRAL.
  return new Date(centralWall.getTime() + offset * 60 * 60 * 1000);
}

export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });

  return `${fmt(weekStart)} – ${fmt(end)}`;
}
