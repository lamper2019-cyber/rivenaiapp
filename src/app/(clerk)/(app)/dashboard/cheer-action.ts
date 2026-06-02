"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

/**
 * Send a 🌹 cheer from one client to another. Called from the dashboard
 * CheerPrompts component. Idempotent per (recipient, sender, context) —
 * the unique constraint on CheerReaction stops a sender from spamming
 * the same trigger.
 *
 * Side effects:
 *  - Inserts a CheerReaction row
 *  - Sends a phone push to the recipient: "N women are rooting for you."
 */

const SendCheerSchema = z.object({
  recipientUserId: z.string().min(1),
  context: z.enum([
    // Hard-day triggers (cheer-candidates.ts)
    "no_log_24h",
    "broke_streak",
    "way_over_target",
    "manual",
    // Win triggers (peer-wins.ts) — same mechanic, positive moments.
    // She can send one rose per (recipient, context) — different
    // contexts are different roses, so a 30-day-streak rose doesn't
    // block a later monthly-checkin rose for the same recipient.
    "win_streak_30",
    "win_streak_60",
    "win_streak_90",
    "win_monthly_checkin",
  ]),
});

export type SendCheerResult =
  | { ok: true; cheerCount: number }
  | { ok: false; error: string };

export async function sendCheer(
  input: z.infer<typeof SendCheerSchema>,
): Promise<SendCheerResult> {
  const parsed = SendCheerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  let sender;
  try {
    sender = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, role: true, subscriptionStatus: true },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!sender) return { ok: false, error: "Account not found." };
  if (sender.id === parsed.data.recipientUserId) {
    return { ok: false, error: "Can't cheer yourself." };
  }

  // Only paying / comped clients can send cheers — keeps the social layer
  // tied to the actual community.
  const okStatuses = ["trialing", "active", "comped"];
  if (
    sender.role !== "CLIENT" ||
    !sender.subscriptionStatus ||
    !okStatuses.includes(sender.subscriptionStatus)
  ) {
    // Coaches can also cheer — RIVEN sending roses is a feature, not a bug.
    if (sender.role !== "COACH") {
      return { ok: false, error: "Only active members can send cheers." };
    }
  }

  // Try the insert. The unique constraint catches double-sends cleanly.
  try {
    await prisma.cheerReaction.create({
      data: {
        recipientUserId: parsed.data.recipientUserId,
        senderUserId: sender.id,
        context: parsed.data.context,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: false, error: "Already cheered this context." };
    }
    return { ok: false, error: "Couldn't send right now. Try again." };
  }

  // Throttle: only push if cheerLastPushAt is null or > 10 min ago.
  // The dashboard card surfaces every cheer regardless — push is a
  // bonus channel, not the truth.
  const TEN_MIN_MS = 10 * 60 * 1000;
  const recipient = await prisma.user.findUnique({
    where: { id: parsed.data.recipientUserId },
    select: { cheerLastPushAt: true },
  });
  const lastPush = recipient?.cheerLastPushAt?.getTime() ?? 0;
  const shouldPush = Date.now() - lastPush > TEN_MIN_MS;

  // Count this Monday-to-now cheers (matches the dashboard card window
  // — Mon–Sun ISO week). Used as the push-body number so it lines up
  // with what she'll see when she opens the app.
  const weekStart = isoWeekStart(new Date());
  const weekCount = await prisma.cheerReaction.count({
    where: {
      recipientUserId: parsed.data.recipientUserId,
      createdAt: { gte: weekStart },
    },
  });

  if (shouldPush) {
    const pushBody =
      weekCount === 1
        ? "Someone in RIVEN sent you a 🌹."
        : `${weekCount} women in RIVEN have your back this week.`;
    try {
      await sendPushToUser(parsed.data.recipientUserId, {
        title: "A 🌹 from your sisters",
        body: pushBody,
        url: "/dashboard",
        tag: `cheer-${parsed.data.recipientUserId}`,
      });
      await prisma.user.update({
        where: { id: parsed.data.recipientUserId },
        data: { cheerLastPushAt: new Date() },
      });
    } catch {
      /* push failure shouldn't surface — the DB row is the truth */
    }
  }

  revalidatePath("/dashboard");
  return { ok: true, cheerCount: weekCount };
}

/**
 * Mark the falling-roses ceremony as seen. Bumps cheersLastSeenAt so
 * the next dashboard load doesn't replay the same roses, and sets
 * firstCheerCeremonySeenAt if this was her very first ceremony.
 *
 * Idempotent — safe to call from useEffect cleanup, double-clicks, etc.
 */
export type MarkCheersAsSeenResult =
  | { ok: true }
  | { ok: false; error: string };

export async function markCheersAsSeen(): Promise<MarkCheersAsSeenResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, firstCheerCeremonySeenAt: true },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Account not found." };

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      cheersLastSeenAt: now,
      // Only set firstCheerCeremonySeenAt on the first time through;
      // never overwrite once it's been recorded.
      ...(user.firstCheerCeremonySeenAt === null
        ? { firstCheerCeremonySeenAt: now }
        : {}),
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

/** Monday 00:00:00 of the current ISO week (local). Inline so this file
 *  doesn't pull a UI lib. Mirrors src/lib/week.ts but server-only. */
function isoWeekStart(now: Date): Date {
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + offsetToMonday);
  return monday;
}
