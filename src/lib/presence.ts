import { prisma } from "@/lib/prisma";

/**
 * Presence tracking — drives the "Tracy and Adrienne are in RIVEN
 * right now" indicator on /dashboard.
 *
 * markUserPresent stamps User.lastDashboardSeenAt to now() — called
 * inside loadDashboardData so every dashboard hit refreshes presence.
 *
 * getOtherClientsPresent returns the first names of clients (minus
 * the viewer) who've opened /dashboard within the last 15 minutes.
 * Limited to active subscriptions so canceled accounts don't show.
 */

const PRESENCE_WINDOW_MS = 15 * 60 * 1000;
const ACTIVE_STATUSES = ["trialing", "active", "comped"];

export async function markUserPresent(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastDashboardSeenAt: new Date() },
    });
  } catch {
    // Presence is best-effort — a write failure shouldn't block the
    // dashboard render.
  }
}

export async function getOtherClientsPresent(
  viewerUserId: string,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - PRESENCE_WINDOW_MS);
  const rows = await prisma.user.findMany({
    where: {
      id: { not: viewerUserId },
      role: "CLIENT",
      subscriptionStatus: { in: ACTIVE_STATUSES },
      lastDashboardSeenAt: { gte: cutoff },
      profile: { isNot: null },
    },
    select: {
      profile: { select: { name: true } },
    },
    orderBy: { lastDashboardSeenAt: "desc" },
    take: 8,
  });
  const firstNames: string[] = [];
  for (const r of rows) {
    const first = (r.profile?.name ?? "").trim().split(/\s+/)[0];
    if (first) firstNames.push(first);
  }
  return firstNames;
}
