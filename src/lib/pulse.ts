import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";

/**
 * Live Pulse Feed — ambient activity ticker on /dashboard.
 *
 * Derives events from existing tables (MealLog, WeeklyCheckIn, streaks)
 * instead of writing a new "events" table. Filtering the viewer's own
 * activity out so the feed reads as "OTHER women in here" — that's the
 * dopamine, not seeing your own log echoed back.
 *
 * First names always per Sean's privacy answer (small community, names
 * ARE the brand). Comped + trialing + active subs only — paywalled or
 * canceled clients are invisible to each other.
 */

export type PulseEventKind =
  | "MEAL_LOGGED"
  | "STREAK_HIT"
  | "CHECKIN_DONE";

export type PulseEvent = {
  id: string;
  kind: PulseEventKind;
  firstName: string;
  copy: string;
  at: Date;
};

const PULSE_WINDOW_HOURS = 12;
const MAX_EVENTS = 12;

/** Compose recent pulse events for the dashboard ticker. Excludes the
 *  current viewer's own activity so the feed feels like "the room," not
 *  a mirror. */
export async function getRecentPulseEvents(
  viewerUserId: string,
): Promise<PulseEvent[]> {
  const since = new Date(Date.now() - PULSE_WINDOW_HOURS * 60 * 60 * 1000);
  const today = startOfCentralDay();
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [meals, checkIns, streakMealRows] = await Promise.all([
    prisma.mealLog.findMany({
      where: {
        createdAt: { gte: since },
        userId: { not: viewerUserId },
        user: {
          role: "CLIENT",
          subscriptionStatus: { in: ["trialing", "active", "comped"] },
          profile: { isNot: null },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        createdAt: true,
        shortName: true,
        description: true,
        userId: true,
        user: { select: { profile: { select: { name: true } } } },
      },
    }),
    prisma.weeklyCheckIn.findMany({
      where: {
        createdAt: { gte: since },
        userId: { not: viewerUserId },
        user: {
          role: "CLIENT",
          subscriptionStatus: { in: ["trialing", "active", "comped"] },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        userId: true,
        user: { select: { profile: { select: { name: true } } } },
      },
    }),
    // For streak detection we need 14 days of meal logs per non-viewer
    // client. Group in memory.
    prisma.mealLog.findMany({
      where: {
        createdAt: { gte: fourteenDaysAgo },
        userId: { not: viewerUserId },
        user: {
          role: "CLIENT",
          subscriptionStatus: { in: ["trialing", "active", "comped"] },
        },
      },
      select: {
        userId: true,
        createdAt: true,
        user: { select: { profile: { select: { name: true } } } },
      },
    }),
  ]);

  const events: PulseEvent[] = [];

  for (const m of meals) {
    const first = firstNameFor(m.user.profile?.name);
    if (!first) continue;
    const time = mealTimeOfDay(m.createdAt);
    const label = m.shortName ?? truncate(m.description, 36);
    events.push({
      id: `meal-${m.id}`,
      kind: "MEAL_LOGGED",
      firstName: first,
      copy: `${first} just logged ${time} · ${label}`,
      at: m.createdAt,
    });
  }

  for (const c of checkIns) {
    const first = firstNameFor(c.user.profile?.name);
    if (!first) continue;
    events.push({
      id: `checkin-${c.id}`,
      kind: "CHECKIN_DONE",
      firstName: first,
      copy: `${first} just finished her Sunday check-in`,
      at: c.createdAt,
    });
  }

  // Detect streak milestones reached IN THIS WINDOW (i.e. yesterday's
  // log put her over a threshold). We bucket meals by user + central day,
  // compute today's consecutive streak ending yesterday, then surface
  // 3/5/7/14/30 milestones.
  const STREAK_MILESTONES = new Set([3, 5, 7, 14, 30]);
  const byUser = new Map<
    string,
    { name: string | null | undefined; days: Set<string> }
  >();
  for (const r of streakMealRows) {
    const key = centralDayKey(r.createdAt);
    const entry = byUser.get(r.userId);
    if (entry) {
      entry.days.add(key);
    } else {
      byUser.set(r.userId, {
        name: r.user.profile?.name,
        days: new Set([key]),
      });
    }
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  for (const [userId, entry] of Array.from(byUser.entries())) {
    const first = firstNameFor(entry.name);
    if (!first) continue;
    let streak = 0;
    const cursor = new Date(yesterday);
    for (let i = 0; i < 14; i++) {
      if (!entry.days.has(centralDayKey(cursor))) break;
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (STREAK_MILESTONES.has(streak)) {
      events.push({
        id: `streak-${userId}-${streak}`,
        kind: "STREAK_HIT",
        firstName: first,
        copy: `${first} just locked in ${streak} straight days`,
        // Stamp at yesterday's "end-of-day" Central time so streaks
        // sort sensibly against today's meals/check-ins.
        at: new Date(today.getTime() - 1),
      });
    }
  }

  // Newest first, cap, dedupe by event id.
  const seen = new Set<string>();
  const sorted = events
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, MAX_EVENTS);

  return sorted;
}

function firstNameFor(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

function mealTimeOfDay(d: Date): string {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "2-digit",
      hour12: false,
    }).format(d),
    10,
  );
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 19) return "dinner";
  return "a late meal";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function centralDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
