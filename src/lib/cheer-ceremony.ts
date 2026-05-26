import { prisma } from "@/lib/prisma";

/**
 * Falling-roses ceremony — the cinematic overlay that fires on the
 * dashboard when she has unseen cheers waiting. This file is the data
 * side: who sent her roses, was this her first-ever ceremony, etc.
 *
 * Cap: we show the most recent 6 with sender names. If she has 7+ unseen,
 * the remainder fold into a single "...and N more this week from women
 * you'll see in the room" line, so a vacation-week pile-up doesn't turn
 * into a 30-second animation.
 *
 * The actual "mark these as seen" write happens in the server action
 * (markCheersAsSeen), not here — this is pure read.
 */

export type CeremonyRose = {
  id: string;
  firstName: string;
  createdAt: Date;
};

export type CheerCeremonySnapshot = {
  roses: CeremonyRose[];
  overflowCount: number;
  isFirstCeremony: boolean;
};

const ROSE_DISPLAY_CAP = 6;

export async function getCheerCeremonyState(
  recipientUserId: string,
): Promise<CheerCeremonySnapshot | null> {
  const user = await prisma.user.findUnique({
    where: { id: recipientUserId },
    select: {
      cheersLastSeenAt: true,
      firstCheerCeremonySeenAt: true,
    },
  });
  if (!user) return null;

  // Pull every rose newer than her last-seen mark. If she's never
  // experienced the ceremony, cheersLastSeenAt is null and we look at
  // her entire CheerReaction history (which is fine — first ceremony
  // is supposed to be the full backlog catching her up).
  const where = {
    recipientUserId,
    ...(user.cheersLastSeenAt
      ? { createdAt: { gt: user.cheersLastSeenAt } }
      : {}),
  };

  // Take ROSE_DISPLAY_CAP + 1 so we know whether there's an overflow.
  // Sender name comes from Profile.name (first word) — if a sender has
  // no profile (shouldn't happen for active clients), fall back to a
  // safe placeholder.
  const unseen = await prisma.cheerReaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: ROSE_DISPLAY_CAP + 1,
    select: {
      id: true,
      createdAt: true,
      sender: {
        select: {
          profile: { select: { name: true } },
        },
      },
    },
  });

  if (unseen.length === 0) return null;

  // Also count any roses beyond the take limit so the summary line
  // ("and N more this week") is accurate.
  let totalUnseen = unseen.length;
  if (unseen.length > ROSE_DISPLAY_CAP) {
    totalUnseen = await prisma.cheerReaction.count({ where });
  }

  const overflowCount = Math.max(0, totalUnseen - ROSE_DISPLAY_CAP);

  const roses: CeremonyRose[] = unseen.slice(0, ROSE_DISPLAY_CAP).map((r) => ({
    id: r.id,
    firstName: extractFirstName(r.sender?.profile?.name),
    createdAt: r.createdAt,
  }));

  return {
    roses,
    overflowCount,
    isFirstCeremony: user.firstCheerCeremonySeenAt === null,
  };
}

function extractFirstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "A RIVEN sister";
  return trimmed.split(/\s+/)[0];
}
