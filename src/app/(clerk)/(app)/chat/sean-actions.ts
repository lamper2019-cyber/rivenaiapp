"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleAiReply } from "@/lib/sean-auto-reply";

/**
 * Client-side action: she sends Sean a message on the unified thread.
 *
 * Two flows go through this single action:
 *
 *   - Free-text / voice transcript: pass `message` only.
 *   - Tap-reply chip: pass `message` (the chip's value) + chipMessageId
 *     (the Sean-side message whose chips she tapped). Action marks
 *     that row's chipsRepliedAt so the chips collapse server-side.
 *
 * Either way the effect is the same downstream:
 *   1. Persist her USER message (kind=COACH).
 *   2. Schedule an AI auto-reply (~90-130s delay).
 *   3. Optionally cancel any earlier pending reply if she's mid-thread.
 */

const SendSchema = z.object({
  message: z
    .string()
    .min(1, "Message is required")
    .max(2000, "Keep messages under 2000 characters")
    .transform((s) => s.trim()),
  imageUrls: z
    .array(z.string().url())
    .max(4, "At most 4 images per message")
    .optional()
    .default([]),
  /** The Sean message whose chips she tapped. Used to mark chipsRepliedAt
   *  so the chips don't re-render. Only set when this is a chip reply. */
  chipMessageId: z.string().optional(),
});

export type SendToSeanResult =
  | { ok: true; messageId: string; pendingReplyId: string; scheduledFor: string }
  | { ok: false; error: string };

export async function sendToSean(
  input: z.infer<typeof SendSchema>,
): Promise<SendToSeanResult> {
  const parsed = SendSchema.safeParse(input);
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
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, profile: { select: { id: true } } },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Account not found." };
  if (!user.profile) {
    return { ok: false, error: "Complete onboarding before messaging Sean." };
  }

  // 1. Persist her message. Always kind=COACH role=USER on the unified
  //    thread — the existing ChatMessageKind enum has only {AI, COACH},
  //    so the role column carries direction.
  const userMessage = await prisma.chatMessage.create({
    data: {
      userId: user.id,
      role: "USER",
      kind: "COACH",
      content: parsed.data.message,
      imageUrls: parsed.data.imageUrls ?? [],
    },
    select: { id: true },
  });

  // 1b. If this is a chip-reply, stamp chipsRepliedAt on the Sean
  //     message so the chips collapse on next render. Defensive update
  //     gated to that user's own messages so a stale client can't
  //     mark someone else's row.
  if (parsed.data.chipMessageId) {
    await prisma.chatMessage.updateMany({
      where: {
        id: parsed.data.chipMessageId,
        userId: user.id,
        chipsRepliedAt: null,
      },
      data: { chipsRepliedAt: new Date() },
    });
  }

  // 2. Schedule the AI auto-reply.
  const pending = await scheduleAiReply({
    userId: user.id,
    triggerMessageId: userMessage.id,
  });

  revalidatePath("/chat");
  return {
    ok: true,
    messageId: userMessage.id,
    pendingReplyId: pending.id,
    scheduledFor: pending.scheduledFor.toISOString(),
  };
}
