import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import {
  pickVariant,
  type DailyPromptVariant,
} from "@/lib/sean-daily-prompts";
import { sendPushToUser } from "@/lib/push";

/**
 * Shared logic for the 3x/day Sean check-in crons.
 *
 *   morning  ~8 AM CT — every active client
 *   midday   ~1 PM CT — active clients with NO MealLog today (nudge)
 *   evening  ~8 PM CT — every active client
 *
 * Each tick:
 *   1. List active client User ids
 *   2. Filter by slot-specific criteria (midday gates on no log today)
 *   3. Cooldown: skip clients who got any COACH message in the last
 *      4 hours so we don't pile pings
 *   4. Pick the slot's variant (deterministic by date so the bank
 *      rotates day-over-day; the picker handles the offset)
 *   5. For each eligible client: create a COACH ChatMessage with
 *      chipOptions set, then fire a push
 *
 * Returns a small summary for the cron route response.
 */

const ACTIVE_STATUSES = ["trialing", "active", "comped"];
const COOLDOWN_MS = 4 * 60 * 60 * 1000;

export type CheckInSlot = "morning" | "midday" | "evening";

export type CheckInBatchResult = {
  slot: CheckInSlot;
  variantText: string;
  candidates: number;
  sent: number;
  skippedCooldown: number;
  skippedLoggedAlready: number; // midday only
};

export async function runDailyCheckInBatch(
  slot: CheckInSlot,
): Promise<CheckInBatchResult> {
  const variant = pickVariant(slot, new Date());
  const today = startOfCentralDay();
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS);

  // Active clients with profiles. We don't push to anyone without a
  // profile — they haven't completed onboarding yet.
  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      subscriptionStatus: { in: ACTIVE_STATUSES },
      profile: { isNot: null },
    },
    select: {
      id: true,
      // Recent COACH messages — drives the 4h cooldown filter.
      chatMessages: {
        where: { kind: "COACH", createdAt: { gte: cooldownCutoff } },
        take: 1,
        select: { id: true },
      },
      // Today's meals — drives the midday "skip if she logged" filter.
      mealLogs:
        slot === "midday"
          ? {
              where: { createdAt: { gte: today } },
              take: 1,
              select: { id: true },
            }
          : false,
    },
  });

  let sent = 0;
  let skippedCooldown = 0;
  let skippedLoggedAlready = 0;
  const candidates = clients.length;

  for (const client of clients) {
    if (client.chatMessages.length > 0) {
      skippedCooldown++;
      continue;
    }
    if (slot === "midday" && client.mealLogs && client.mealLogs.length > 0) {
      skippedLoggedAlready++;
      continue;
    }
    try {
      await sendCheckInTo(client.id, variant);
      sent++;
    } catch {
      // Don't let one bad client kill the batch.
    }
  }

  return {
    slot,
    variantText: variant.text,
    candidates,
    sent,
    skippedCooldown,
    skippedLoggedAlready,
  };
}

async function sendCheckInTo(
  clientUserId: string,
  variant: DailyPromptVariant,
): Promise<void> {
  // The check-in message is a COACH-kind ChatMessage on the unified
  // Sean thread, with chipOptions set. aiGenerated stays false — this
  // is a system-templated proactive prompt, not an AI-composed
  // reply.
  await prisma.chatMessage.create({
    data: {
      userId: clientUserId,
      role: "ASSISTANT",
      kind: "COACH",
      content: variant.text,
      chipOptions: variant.chips,
      // category lives in the proactive-messaging system; tagging
      // daily check-ins lets future analytics distinguish them from
      // Monday batches.
      category: "daily_checkin",
    },
  });

  // Push notification — deep-links to /dashboard so she lands directly
  // on the new SeanPromptHeadline at the top of the page rather than
  // having to find the Sean tab. Same tag per client so a stale
  // notification gets replaced rather than stacking.
  try {
    await sendPushToUser(clientUserId, {
      title: "Sean wrote you",
      body: variant.text.slice(0, 140),
      url: "/dashboard",
      tag: `daily-checkin-${clientUserId}`,
    });
  } catch {
    /* push failure is fine — the message still lands when she opens the app */
  }
}
