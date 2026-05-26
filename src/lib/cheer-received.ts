import { prisma } from "@/lib/prisma";
import { startOfIsoWeek } from "@/lib/week";

/**
 * "🌹 N women have your back this week" — the dashboard surface that
 * makes peer cheers visible without relying on push notifications
 * (which iOS PWAs are flaky about). Counted Mon–Sun in ISO week so the
 * count resets each Monday alongside the Sunday-ritual cadence.
 */

export type CheerReceivedSummary = {
  count: number;
  mostRecentContext: string | null;
};

const CONTEXT_PHRASES: Record<string, string> = {
  no_log_24h: "the day you went quiet",
  broke_streak: "your streak that broke",
  way_over_target: "your heavy day",
  manual: "you, just because",
};

export async function getCheerReceivedThisWeek(
  recipientUserId: string,
): Promise<CheerReceivedSummary> {
  const weekStart = startOfIsoWeek(new Date());

  const [count, mostRecent] = await Promise.all([
    prisma.cheerReaction.count({
      where: {
        recipientUserId,
        createdAt: { gte: weekStart },
      },
    }),
    prisma.cheerReaction.findFirst({
      where: {
        recipientUserId,
        createdAt: { gte: weekStart },
      },
      orderBy: { createdAt: "desc" },
      select: { context: true },
    }),
  ]);

  const mostRecentContext = mostRecent
    ? CONTEXT_PHRASES[mostRecent.context] ?? null
    : null;

  return { count, mostRecentContext };
}
