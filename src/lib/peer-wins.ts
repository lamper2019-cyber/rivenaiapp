import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";

/**
 * Peer-wins detection — the mirror of cheer-candidates.ts.
 *
 * Cheer candidates surface clients having HARD days so peers can send
 * a 🌹 of support. Peer wins surface clients having BIG days so peers
 * can send a 🌹 of celebration.
 *
 * Triggers (today only — wins today are wins today, not yesterday):
 *   - streak_30 / streak_60 / streak_90: she just crossed a milestone
 *     in her current meal-log streak
 *   - monthly_checkin_done: she submitted her monthly check-in today
 *
 * Future triggers can be added by appending to PeerWinContext.
 *
 * The CheerReaction table has the same unique constraint (recipient,
 * sender, context) so a sender can't double-cheer the same win — once
 * she's sent a rose for "Maya's 30-day streak," that card disappears
 * for her.
 */

export type PeerWinContext =
  | "win_streak_30"
  | "win_streak_60"
  | "win_streak_90"
  | "win_monthly_checkin";

export type PeerWinCandidate = {
  recipientUserId: string;
  firstName: string;
  context: PeerWinContext;
  reason: string;
  cheerCountForContext: number;
};

const ACTIVE_STATUSES = ["trialing", "active", "comped"];
const ACTIVE_FILTER = {
  role: "CLIENT" as const,
  subscriptionStatus: { in: ACTIVE_STATUSES },
};

const STREAK_MILESTONES: ReadonlyArray<{ days: number; context: PeerWinContext }> = [
  { days: 30, context: "win_streak_30" },
  { days: 60, context: "win_streak_60" },
  { days: 90, context: "win_streak_90" },
];

export async function getPeerWinCandidates(
  viewerUserId: string,
): Promise<PeerWinCandidate[]> {
  const today = startOfCentralDay();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 100);

  // Pull every active client except the viewer + their recent meal
  // log dates (for streak detection) + today's check-in flag.
  const clients = await prisma.user.findMany({
    where: {
      ...ACTIVE_FILTER,
      id: { not: viewerUserId },
      profile: { isNot: null },
    },
    select: {
      id: true,
      profile: { select: { name: true } },
      mealLogs: {
        where: { createdAt: { gte: ninetyDaysAgo } },
        select: { createdAt: true },
      },
      // Did she submit her monthly check-in today? We look at WeeklyCheckIn
      // (which stores monthly check-ins) ordered desc, check createdAt.
      weeklyCheckIns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  if (clients.length === 0) return [];

  // Already-cheered set: this viewer's existing reactions on any
  // win_* context for these recipients. Used to hide cards she's
  // already cheered.
  const cheered = await prisma.cheerReaction.findMany({
    where: {
      senderUserId: viewerUserId,
      recipientUserId: { in: clients.map((c) => c.id) },
      context: {
        in: STREAK_MILESTONES.map((m) => m.context).concat([
          "win_monthly_checkin",
        ]),
      },
    },
    select: { recipientUserId: true, context: true },
  });
  const cheeredSet = new Set(
    cheered.map((r) => `${r.recipientUserId}|${r.context}`),
  );

  // Total cheers per (recipient, context) — drives the "X women rooting"
  // tally beside the button.
  const counts = await prisma.cheerReaction.groupBy({
    by: ["recipientUserId", "context"],
    where: {
      recipientUserId: { in: clients.map((c) => c.id) },
      context: {
        in: STREAK_MILESTONES.map((m) => m.context).concat([
          "win_monthly_checkin",
        ]),
      },
    },
    _count: { _all: true },
  });
  const countMap = new Map<string, number>();
  for (const row of counts) {
    countMap.set(`${row.recipientUserId}|${row.context}`, row._count._all);
  }

  const candidates: PeerWinCandidate[] = [];

  for (const client of clients) {
    const firstName = (client.profile?.name ?? "").trim().split(/\s+/)[0];
    if (!firstName) continue;

    // ── Monthly check-in done today ────────────────────────────────
    const latestCheckIn = client.weeklyCheckIns[0];
    if (latestCheckIn) {
      const submittedDay = startOfCentralDay(latestCheckIn.createdAt);
      if (submittedDay.getTime() === today.getTime()) {
        const key = `${client.id}|win_monthly_checkin`;
        if (!cheeredSet.has(key)) {
          candidates.push({
            recipientUserId: client.id,
            firstName,
            context: "win_monthly_checkin",
            reason: `${firstName} just finished her monthly check-in — send her a 🌹`,
            cheerCountForContext: countMap.get(key) ?? 0,
          });
          continue;
        }
      }
    }

    // ── Streak milestone hit today ─────────────────────────────────
    const streak = computeStreakEndingToday(client.mealLogs.map((m) => m.createdAt));
    if (streak > 0) {
      // Find the highest milestone she JUST hit (her streak equals
      // a milestone day count). 30 → today is day 30 exactly.
      const matched = STREAK_MILESTONES.find((m) => m.days === streak);
      if (matched) {
        const key = `${client.id}|${matched.context}`;
        if (!cheeredSet.has(key)) {
          candidates.push({
            recipientUserId: client.id,
            firstName,
            context: matched.context,
            reason: `${firstName} just hit her ${matched.days}-day streak — send her a 🌹`,
            cheerCountForContext: countMap.get(key) ?? 0,
          });
        }
      }
    }
  }

  // Cap at 3 most relevant so the dashboard isn't a wall of wins.
  return candidates.slice(0, 3);
}

/**
 * Streak counted UP TO AND INCLUDING today. Differs from the cheer.ts
 * "ending yesterday" variant because peer-wins need today's streak
 * count (so a 30-day milestone hit today shows up today, not tomorrow).
 */
function computeStreakEndingToday(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const days = new Set<string>();
  for (const d of dates) days.add(centralDayKey(d));
  const cursor = new Date();
  let streak = 0;
  for (let i = 0; i < 100; i++) {
    const k = centralDayKey(cursor);
    if (!days.has(k)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function centralDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
