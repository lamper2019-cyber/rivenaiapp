import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import { sendPushToUser } from "@/lib/push";

/**
 * The RIVEN coach brain — the running implementation of the decision tree
 * (docs/RIVEN-COACH-DECISION-TREE.md). Reads the DAILY WEIGH-IN + meal logs and
 * sends the explicit, RIVEN-voice nudges, enforcing the frequency ledger.
 *
 * Three slots map to the tree's daily checkpoints:
 *   morning   (~10:30a CT) — weigh nudge if she hasn't weighed today
 *   afternoon (~3:00p CT)  — FINAL weigh nudge if still not weighed
 *   evening   (~7:30p CT)  — food nudge if nothing logged today
 *
 * Ledger: at most ONE RIVEN coaching push per day, per member. The morning
 * slot runs first, so weight is prioritized; if a RIVEN nudge already went out
 * today, later slots stay silent. (This is the ≤1 push/day rule — weight first.)
 *
 * IMPORTANT: retire the old morning/midday/evening-checkin Railway crons when
 * switching to this — otherwise members get the old food prompts AND these.
 */

const ACTIVE_STATUSES = ["trialing", "active", "comped"];
const DAY_MS = 24 * 60 * 60 * 1000;

export type RivenSlot = "morning" | "afternoon" | "evening";

export type RivenCoachResult = {
  slot: RivenSlot;
  candidates: number;
  sent: number;
  skippedDone: number; // already weighed/logged → nothing to say
  skippedLedger: number; // already got a RIVEN push today
};

/** Weekday name N days ago, in Central — for "haven't seen you since Tuesday". */
function weekdayNDaysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "America/Chicago",
  });
}

/** MORNING weigh nudge copy, by days since her last weigh-in (null = never). */
function morningWeighCopy(daysSince: number | null): string | null {
  if (daysSince === 0) return null; // weighed today → silent
  if (daysSince === null)
    return "Let's get your first weight in. Step on the scale — one number, that's it.";
  if (daysSince === 1)
    return "Morning. You haven't logged today's weight yet. Step on the scale — one number, that's it.";
  if (daysSince === 2)
    return "Two days, no weight. You need to weigh in today — one number.";
  if (daysSince <= 4)
    return `Haven't seen a weight since ${weekdayNDaysAgo(daysSince)}. You need to weigh in. One tap.`;
  return `It's been ${daysSince} days. No shame — but you need to get back on the scale. Start today.`;
}

/** AFTERNOON weigh nudge — the explicit, final reminder of the day. */
function afternoonWeighCopy(daysSince: number | null): string | null {
  if (daysSince === 0) return null;
  return "We still don't have today's weight. You need to weigh in today — do it before the day gets away.";
}

/** EVENING food nudge copy, by days since her last meal log (null = never). */
function eveningFoodCopy(daysSince: number | null): string | null {
  if (daysSince === 0) return null; // logged today → silent
  if (daysSince === null || daysSince === 1)
    return "It's evening and your log's still empty. You need to log what you ate today — voice it, takes 5 seconds.";
  if (daysSince === 2)
    return "You haven't logged in a couple days. You need to log your food — every meal. Start with the next one.";
  if (daysSince === 3)
    return "Real talk: I can't coach what I can't see. You need to log — start now, the next meal.";
  return `It's been ${daysSince} days off the log. You need to log. Just the next meal. That's the win.`;
}

export async function runRivenCoach(slot: RivenSlot): Promise<RivenCoachResult> {
  const today = startOfCentralDay();

  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      subscriptionStatus: { in: ACTIVE_STATUSES },
      profile: { isNot: null },
    },
    select: {
      id: true,
      // Most recent weigh-in (for the weigh ladder).
      dailyWeighIns: { orderBy: { day: "desc" }, take: 1, select: { day: true } },
      // Most recent meal log (for the food ladder).
      mealLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      // Already got a RIVEN coaching push today? → the ≤1/day ledger.
      chatMessages: {
        where: { kind: "COACH", category: { startsWith: "riven_" }, createdAt: { gte: today } },
        take: 1,
        select: { id: true },
      },
    },
  });

  let sent = 0, skippedDone = 0, skippedLedger = 0;

  for (const c of clients) {
    // Days since last weigh-in (DailyWeighIn.day is start-of-day).
    const lastWeigh = c.dailyWeighIns[0]?.day ?? null;
    const daysSinceWeigh = lastWeigh
      ? Math.round((today.getTime() - lastWeigh.getTime()) / DAY_MS)
      : null;

    // Days since last food log.
    const lastMeal = c.mealLogs[0]?.createdAt ?? null;
    const daysSinceFood = lastMeal
      ? Math.round((today.getTime() - startOfCentralDay(lastMeal).getTime()) / DAY_MS)
      : null;

    const copy =
      slot === "morning"
        ? morningWeighCopy(daysSinceWeigh)
        : slot === "afternoon"
          ? afternoonWeighCopy(daysSinceWeigh)
          : eveningFoodCopy(daysSinceFood);

    if (!copy) {
      skippedDone++;
      continue;
    }
    // Ledger: one RIVEN coaching push per day.
    if (c.chatMessages.length > 0) {
      skippedLedger++;
      continue;
    }

    try {
      await sendRivenNudge(c.id, slot, copy);
      sent++;
    } catch {
      // one bad client never kills the batch
    }
  }

  return { slot, candidates: clients.length, sent, skippedDone, skippedLedger };
}

async function sendRivenNudge(userId: string, slot: RivenSlot, text: string): Promise<void> {
  await prisma.chatMessage.create({
    data: {
      userId,
      role: "ASSISTANT",
      kind: "COACH",
      content: text,
      category: `riven_${slot}`, // tags these as the decision-tree nudges
    },
  });
  try {
    await sendPushToUser(userId, {
      title: "RIVEN",
      body: text.slice(0, 140),
      url: "/dashboard",
      tag: `riven-coach-${userId}`,
    });
  } catch {
    /* push failure is fine — the message lands when she opens the app */
  }
}
