import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import { sendPushToUser } from "@/lib/push";

/**
 * The RIVEN coach brain — the running implementation of the decision tree
 * (docs/RIVEN-COACH-DECISION-TREE.md). Reads the DAILY WEIGH-IN + meal logs and
 * sends the explicit, RIVEN-voice nudges.
 *
 * Four slots map to the tree's daily checkpoints:
 *   morning   (~10:30a CT) — weigh nudge if she hasn't weighed today
 *   midday    (~12:30p CT) — breakfast/food nudge if nothing logged today
 *   afternoon (~3:00p CT)  — FINAL weigh nudge if still not weighed
 *   evening   (~7:30p CT)  — food nudge if still nothing logged today
 *
 * Frequency ledger — TWO INDEPENDENT TRACKS so weight and food never crowd
 * each other out, and she never gets nagged twice for the same thing:
 *   • ≤ 1 WEIGHT push/day  (morning OR afternoon — whichever fires first)
 *   • ≤ 1 FOOD push/day    (midday OR evening — whichever fires first)
 * → at most 2 RIVEN pushes in a day (one about weight, one about food).
 *
 * IMPORTANT: retire the old morning/midday/evening-checkin behavior when
 * switching to this (repoint those crons here) so members don't get both.
 */

const ACTIVE_STATUSES = ["trialing", "active", "comped"];
const DAY_MS = 24 * 60 * 60 * 1000;

export type RivenSlot = "morning" | "midday" | "afternoon" | "evening";

const isWeighSlot = (s: RivenSlot) => s === "morning" || s === "afternoon";

export type RivenCoachResult = {
  slot: RivenSlot;
  candidates: number;
  sent: number;
  skippedDone: number; // already weighed/logged → nothing to say
  skippedLedger: number; // already got that track's push today
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

/** MIDDAY breakfast/food nudge — first food touch of the day. */
function middayFoodCopy(daysSince: number | null): string | null {
  if (daysSince === 0) return null; // already logged today → silent
  return "You need to log your breakfast. Not sure what counts? Ask me — that's what I'm here for.";
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
  const weighTrack = isWeighSlot(slot);

  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      subscriptionStatus: { in: ACTIVE_STATUSES },
      profile: { isNot: null },
    },
    select: {
      id: true,
      dailyWeighIns: { orderBy: { day: "desc" }, take: 1, select: { day: true } },
      mealLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      // Today's RIVEN coaching pushes — used for the per-TRACK daily cap.
      chatMessages: {
        where: { kind: "COACH", category: { startsWith: "riven_" }, createdAt: { gte: today } },
        select: { category: true },
      },
    },
  });

  let sent = 0, skippedDone = 0, skippedLedger = 0;

  for (const c of clients) {
    const lastWeigh = c.dailyWeighIns[0]?.day ?? null;
    const daysSinceWeigh = lastWeigh
      ? Math.round((today.getTime() - lastWeigh.getTime()) / DAY_MS)
      : null;

    const lastMeal = c.mealLogs[0]?.createdAt ?? null;
    const daysSinceFood = lastMeal
      ? Math.round((today.getTime() - startOfCentralDay(lastMeal).getTime()) / DAY_MS)
      : null;

    const copy =
      slot === "morning"
        ? morningWeighCopy(daysSinceWeigh)
        : slot === "afternoon"
          ? afternoonWeighCopy(daysSinceWeigh)
          : slot === "midday"
            ? middayFoodCopy(daysSinceFood)
            : eveningFoodCopy(daysSinceFood);

    if (!copy) {
      skippedDone++;
      continue;
    }

    // Per-track cap: skip if this track already pushed today.
    const trackPrefix = weighTrack ? "riven_weigh_" : "riven_food_";
    const alreadyPushedTrack = c.chatMessages.some((m) =>
      (m.category ?? "").startsWith(trackPrefix),
    );
    if (alreadyPushedTrack) {
      skippedLedger++;
      continue;
    }

    try {
      await sendRivenNudge(c.id, slot, copy, weighTrack);
      sent++;
    } catch {
      // one bad client never kills the batch
    }
  }

  return { slot, candidates: clients.length, sent, skippedDone, skippedLedger };
}

async function sendRivenNudge(
  userId: string,
  slot: RivenSlot,
  text: string,
  weighTrack: boolean,
): Promise<void> {
  const track = weighTrack ? "weigh" : "food";
  await prisma.chatMessage.create({
    data: {
      userId,
      role: "ASSISTANT",
      kind: "COACH",
      content: text,
      category: `riven_${track}_${slot}`, // track prefix drives the per-track cap
    },
  });
  try {
    await sendPushToUser(userId, {
      title: "RIVEN",
      body: text.slice(0, 140),
      url: "/dashboard",
      // Separate tags so a weight push and a food push don't overwrite each other.
      tag: `riven-coach-${track}-${userId}`,
    });
  } catch {
    /* push failure is fine — the message lands when she opens the app */
  }
}
