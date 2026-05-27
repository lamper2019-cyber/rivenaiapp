"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

/**
 * Sean replies to a client thread from the messaging dashboard. The
 * reply:
 *   1. Inserts a COACH-kind ChatMessage with aiGenerated=false +
 *      senderUserId = Sean's User.id
 *   2. Cancels any queued PendingAiReply for this client — Sean
 *      answered, no need for the AI to also chime in 3 minutes from
 *      now (would be confusing for the client to get two replies)
 *   3. Pushes the client so she gets the notification immediately
 *
 * Gated to COACH role. Coach name is hardcoded "Sean" on the client
 * side (CLAUDE.md rule); we don't surface senderUserId in the client
 * UI, just store it for audit.
 */

const ReplySchema = z.object({
  clientUserId: z.string().min(1),
  message: z
    .string()
    .min(1, "Write something.")
    .max(2000, "Keep messages under 2000 characters")
    .transform((s) => s.trim()),
});

export type CoachReplyResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendCoachReply(
  input: z.infer<typeof ReplySchema>,
): Promise<CoachReplyResult> {
  const parsed = ReplySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys.",
    };
  }

  let coach;
  try {
    coach = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, role: true },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!coach) return { ok: false, error: "Account not found." };
  if (coach.role !== "COACH") {
    return { ok: false, error: "Only coaches can reply here." };
  }

  // Confirm the recipient exists and is a client.
  const recipient = await prisma.user.findUnique({
    where: { id: parsed.data.clientUserId },
    select: { id: true, role: true },
  });
  if (!recipient || recipient.role !== "CLIENT") {
    return { ok: false, error: "Client not found." };
  }

  // Create the reply.
  const message = await prisma.chatMessage.create({
    data: {
      userId: parsed.data.clientUserId,
      role: "ASSISTANT",
      kind: "COACH",
      senderUserId: coach.id,
      content: parsed.data.message,
      aiGenerated: false,
    },
    select: { id: true },
  });

  // Cancel any queued AI auto-reply for this client — Sean wrote back
  // himself, the AI doesn't also need to chime in. Mark as "cancelled"
  // so the cron skips it but we keep the row for analytics.
  await prisma.pendingAiReply.updateMany({
    where: { userId: parsed.data.clientUserId, status: "pending" },
    data: { status: "cancelled", sentAt: new Date() },
  });

  // Push the client so the notification lands fast. If push is
  // unconfigured or the subscription is dead, swallow — the message
  // still lands in her thread on next /chat visit.
  try {
    await sendPushToUser(parsed.data.clientUserId, {
      title: "Sean wrote you",
      body: parsed.data.message.slice(0, 140),
      url: "/chat",
      tag: `sean-${parsed.data.clientUserId}`,
    });
  } catch {
    /* push failure is fine — the DB row is the truth */
  }

  revalidatePath("/coach/messages");
  revalidatePath("/chat");
  return { ok: true, messageId: message.id };
}
