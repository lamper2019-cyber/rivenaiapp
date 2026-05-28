import { prisma } from "@/lib/prisma";
import { startOfCentralDay, startOfCentralMonth } from "@/lib/dates";

/**
 * 30-day weight check-in — the simplified monthly cadence Sean asked
 * for during the 2026-05-27 "keep it simple" pass.
 *
 * Trigger rules:
 *   - Eligible if it's been ≥ 30 days since the last WeeklyCheckIn
 *     (which, despite the name, doubles as our monthly weight log).
 *   - For new clients with no check-in row yet, eligibility starts
 *     30 days after Profile.onboardedAt.
 *
 * Snapshot is rendered at the top of /dashboard as a slider card
 * (weight + waist) — same prime real estate as the daily mood ribbon
 * and Sean prompt headline. She submits, the card disappears, the
 * graph on /profile gets a new point.
 *
 * Storage: writes to the existing WeeklyCheckIn table with defaults
 * for the heavy fields (menuAdherence, sleepAvg, cycleStatus, stress,
 * winsAndStruggles) so the coach view of historical check-ins still
 * works. The empty winsAndStruggles="" signals "this was the simple
 * monthly slider, not the full /check-in form."
 *
 * Profile.currentWeight is updated to the new value so any surface
 * that reads it (the dashboard target calc, coach detail page) sees
 * fresh data immediately.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type MonthlyWeightSnapshot = {
  /** What we should pre-fill the slider with — last known weight or
   *  starting weight if she's never checked in. */
  currentWeight: number;
  /** Last waist if we have one, else null so the form starts blank
   *  rather than guessing. */
  lastWaist: number | null;
  /** Days since the last check-in (or signup if none). Drives the
   *  copy on the card — "It's been 32 days" feels personal. */
  daysSinceLast: number;
  /** Goal weight from profile — drives the slider's anchor + the
   *  "X lb to go" label. */
  goalWeight: number;
};

/**
 * Decide whether to show the monthly weight slider on /dashboard.
 * Returns null when she's not due yet so the dashboard page can
 * just `&&`-guard the render block.
 */
export async function getMonthlyWeightSnapshot(
  userId: string,
): Promise<MonthlyWeightSnapshot | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profile: {
        select: {
          startWeight: true,
          goalWeight: true,
          currentWeight: true,
          onboardedAt: true,
        },
      },
      weeklyCheckIns: {
        orderBy: { weekStart: "desc" },
        take: 1,
        select: { weight: true, waist: true, createdAt: true },
      },
    },
  });

  if (!user?.profile) return null;
  const profile = user.profile;
  const lastCheckIn = user.weeklyCheckIns[0] ?? null;

  // "Anchor" — the timestamp we measure 30 days from. Last check-in
  // takes priority; signup is the bootstrap case for new clients.
  const anchor = lastCheckIn?.createdAt ?? profile.onboardedAt;
  const elapsedMs = Date.now() - anchor.getTime();
  if (elapsedMs < THIRTY_DAYS_MS) return null;

  return {
    currentWeight: lastCheckIn?.weight ?? profile.currentWeight ?? profile.startWeight,
    lastWaist: lastCheckIn?.waist ?? null,
    daysSinceLast: Math.floor(elapsedMs / (24 * 60 * 60 * 1000)),
    goalWeight: profile.goalWeight,
  };
}

/**
 * Pull the historical weight series for /profile. Newest-last so the
 * sparkline draws left-to-right in chronological order without the
 * component needing to reverse.
 */
export async function getWeightSeries(
  userId: string,
): Promise<Array<{ date: string; weight: number }>> {
  const rows = await prisma.weeklyCheckIn.findMany({
    where: { userId },
    orderBy: { weekStart: "asc" },
    select: { weekStart: true, weight: true },
  });
  return rows.map((r) => ({
    date: r.weekStart.toISOString(),
    weight: r.weight,
  }));
}

/**
 * Write a simplified monthly check-in. Fills the legacy heavy fields
 * with sensible defaults so the row is schema-valid; coach can still
 * see weight + waist on her trend.
 *
 * Uses `startOfCentralMonth()` as the upsert key so re-submitting in
 * the same month overwrites instead of creating duplicates — matches
 * the existing /check-in action's idempotency contract.
 */
export async function submitMonthlyWeight(args: {
  userId: string;
  weight: number;
  waist: number;
}): Promise<{ id: string }> {
  const monthStart = startOfCentralMonth();

  const checkIn = await prisma.weeklyCheckIn.upsert({
    where: {
      userId_weekStart: { userId: args.userId, weekStart: monthStart },
    },
    update: {
      weight: args.weight,
      waist: args.waist,
    },
    create: {
      userId: args.userId,
      weekStart: monthStart,
      weight: args.weight,
      waist: args.waist,
      // Heavy fields — defaults that signal "this came from the
      // simple slider, not the full form."
      menuAdherence: "MOSTLY",
      sleepAvg: 7,
      cycleStatus: "NA",
      stress: 5,
      winsAndStruggles: "",
    },
  });

  // Profile.currentWeight is the source of truth for "current" —
  // every surface that reads it (dashboard target calc, coach view)
  // now sees today's number.
  await prisma.profile.update({
    where: { userId: args.userId },
    data: { currentWeight: args.weight },
  });

  return { id: checkIn.id };
}

// Re-export the central-day boundary so callers don't double-import.
export { startOfCentralDay };
