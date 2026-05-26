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
  context: z.enum(["no_log_24h", "broke_streak", "way_over_target", "manual"]),
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
    // Coaches can also cheer — Sean sending roses is a feature, not a bug.
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

  // Count total cheers for this recipient + context (used for push body).
  const cheerCount = await prisma.cheerReaction.count({
    where: {
      recipientUserId: parsed.data.recipientUserId,
      context: parsed.data.context,
    },
  });

  // Push to the recipient. Best-effort; never blocks the result.
  const pushBody =
    cheerCount === 1
      ? "Someone in RIVEN is rooting for you."
      : `${cheerCount} women in RIVEN are rooting for you.`;
  try {
    await sendPushToUser(parsed.data.recipientUserId, {
      title: "A 🌹 from your sisters",
      body: pushBody,
      url: "/dashboard",
      tag: `cheer-${parsed.data.recipientUserId}-${parsed.data.context}`,
    });
  } catch {
    /* push failure shouldn't surface — the DB row is the truth */
  }

  revalidatePath("/dashboard");
  return { ok: true, cheerCount };
}
