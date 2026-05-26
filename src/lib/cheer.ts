import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";

/**
 * Cheer mechanic — when a client's having a hard day, surface a soft
 * "send her a 🌹" prompt to OTHER active clients. One tap, she gets a
 * push notification: "3 women are rooting for you."
 *
 * Hard-day detection (any one fires):
 *   - no log at exactly 2, 4, or 6 central-days since her most recent
 *     log (escalating rungs — the card doesn't show every single day she
 *     hasn't logged, only at these three milestones)
 *   - 3+ day streak that broke yesterday
 *   - way-over yesterday (totalCal > target × 1.5)
 *
 * The CheerReaction table has a unique constraint on (recipient, sender,
 * context) so the same sender can't double-spam the same trigger. Once
 * sent, the prompt disappears for that sender.
 */

export type CheerContext =
  | "no_log_24h"
  | "broke_streak"
  | "way_over_target";

export type CheerCandidate = {
  recipientUserId: string;
  firstName: string;
  context: CheerContext;
  /** Plain-language reason shown to the cheerer. Already in Sean's voice. */
  reason: string;
  /** Number of cheers already sent to this recipient for this context.
   *  Used to render "3 women are rooting for her" beside the button. */
  cheerCountForContext: number;
};

const ACTIVE_STATUSES = ["trialing", "active", "comped"];
const ACTIVE_FILTER = {
  role: "CLIENT" as const,
  subscriptionStatus: { in: ACTIVE_STATUSES },
};

/**
 * Build the list of candidates the viewer should see "send her a 🌹"
 * prompts for. Excludes the viewer herself. Excludes contexts she's
 * already cheered (no double-cheers).
 */
/** Days-since-last-log rungs at which the "hasn't logged" cheer card fires.
 *  Only these three windows — not every day she's silent. */
const NO_LOG_RUNG_DAYS = [2, 4, 6];

export async function getCheerCandidates(viewerUserId: string): Promise<CheerCandidate[]> {
  const today = startOfCentralDay();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const fifteenDaysAgo = new Date(today);
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

  // Pull every active client (minus the viewer) with the data we need to
  // evaluate each hard-day rule.
  const clients = await prisma.user.findMany({
    where: {
      ...ACTIVE_FILTER,
      id: { not: viewerUserId },
      profile: { isNot: null },
    },
    select: {
      id: true,
      profile: { select: { name: true, cutCalories: true } },
      dailyTotals: {
        where: { date: yesterday },
        take: 1,
        select: { totalCalories: true },
      },
      mealLogs: {
        where: { createdAt: { gte: fifteenDaysAgo } },
        select: { createdAt: true },
      },
    },
  });

  if (clients.length === 0) return [];

  // What's the viewer already cheered? Pull once, set-of "recipient|context".
  const alreadyCheered = await prisma.cheerReaction.findMany({
    where: {
      senderUserId: viewerUserId,
      recipientUserId: { in: clients.map((c) => c.id) },
    },
    select: { recipientUserId: true, context: true },
  });
  const cheeredSet = new Set(
    alreadyCheered.map((r) => `${r.recipientUserId}|${r.context}`),
  );

  // For "3 women are rooting" counts: total cheers per (recipient, context).
  const cheerCounts = await prisma.cheerReaction.groupBy({
    by: ["recipientUserId", "context"],
    where: { recipientUserId: { in: clients.map((c) => c.id) } },
    _count: { _all: true },
  });
  const countMap = new Map<string, number>();
  for (const row of cheerCounts) {
    countMap.set(`${row.recipientUserId}|${row.context}`, row._count._all);
  }

  const candidates: CheerCandidate[] = [];

  for (const client of clients) {
    const profile = client.profile!;
    const firstName = (profile.name ?? "").trim().split(/\s+/)[0];
    if (!firstName) continue;

    // ── rule 1: no log at exactly 2/4/6 days ─────────────────────────
    // The card escalates in three rungs instead of pinging every day.
    // Compute the central-day gap between today and her most recent log;
    // fire only when that gap matches one of NO_LOG_RUNG_DAYS. Clients
    // who've never logged at all (mostRecent === null) don't trigger —
    // that's an onboarding issue, not a peer-cheer one.
    const mostRecent = client.mealLogs.reduce<Date | null>((latest, m) => {
      return !latest || m.createdAt > latest ? m.createdAt : latest;
    }, null);
    if (mostRecent) {
      const mostRecentDay = startOfCentralDay(mostRecent);
      const gapDays = Math.round(
        (today.getTime() - mostRecentDay.getTime()) / 86_400_000,
      );
      if (NO_LOG_RUNG_DAYS.includes(gapDays)) {
        const key = `${client.id}|no_log_24h`;
        if (!cheeredSet.has(key)) {
          candidates.push({
            recipientUserId: client.id,
            firstName,
            context: "no_log_24h",
            reason: `${firstName} hasn't logged — send her a 🌹`,
            cheerCountForContext: countMap.get(key) ?? 0,
          });
          continue; // one prompt per recipient, even if multiple rules fire
        }
      }
    }

    // ── rule 2: broke a 3+ day streak yesterday ──────────────────────
    const loggedDays = new Set(
      client.mealLogs.map((m) => centralDayKey(m.createdAt)),
    );
    const yesterdayLogged = loggedDays.has(centralDayKey(yesterday));
    if (!yesterdayLogged) {
      // Walk backward from 2-days-ago to find a streak.
      let streakBeforeBreak = 0;
      const cursor = new Date(twoDaysAgo);
      for (let i = 0; i < 14; i++) {
        if (!loggedDays.has(centralDayKey(cursor))) break;
        streakBeforeBreak++;
        cursor.setDate(cursor.getDate() - 1);
      }
      if (streakBeforeBreak >= 3) {
        const key = `${client.id}|broke_streak`;
        if (!cheeredSet.has(key)) {
          candidates.push({
            recipientUserId: client.id,
            firstName,
            context: "broke_streak",
            reason: `${firstName}'s ${streakBeforeBreak}-day streak broke — send her a 🌹`,
            cheerCountForContext: countMap.get(key) ?? 0,
          });
          continue;
        }
      }
    }

    // ── rule 3: way over yesterday's target (×1.5) ───────────────────
    const yesterdayTotal = client.dailyTotals[0]?.totalCalories ?? 0;
    if (
      yesterdayTotal > 0 &&
      profile.cutCalories > 0 &&
      yesterdayTotal > profile.cutCalories * 1.5
    ) {
      const key = `${client.id}|way_over_target`;
      if (!cheeredSet.has(key)) {
        candidates.push({
          recipientUserId: client.id,
          firstName,
          context: "way_over_target",
          reason: `${firstName} had a heavy day — send her a 🌹`,
          cheerCountForContext: countMap.get(key) ?? 0,
        });
      }
    }
  }

  // Cap so the dashboard isn't a wall of cheer prompts; show 3 most relevant.
  return candidates.slice(0, 3);
}

function centralDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
