"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleAiReply } from "@/lib/sean-auto-reply";

/**
 * Client-side action: she sends Sean a message on the unified thread.
 *
 * Flow:
 *   1. Persist her message as a USER-kind ChatMessage on her thread.
 *   2. Schedule an AI auto-reply (PendingAiReply row with a randomized
 *      delay 1.5-15 min, skewed toward 1-5). The cron picks it up
 *      and writes a COACH ChatMessage that looks indistinguishable
 *      from real Sean.
 *   3. Real Sean can still drop into the same thread manually from the
 *      coach messaging dashboard — his replies go in as COACH with
 *      aiGenerated=false.
 *
 * Returns the message id + the scheduled-reply id so the client can
 * show "Sean is typing..." or similar UI affordances if we add them.
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

  // 1. Persist her message on the unified Sean thread. We use
  //    kind=COACH (= the coach thread) + role=USER (= her side of
  //    the conversation); the existing ChatMessageKind enum has only
  //    {AI, COACH}, so the role column carries the directional
  //    information. Auto-reply + manual Sean reply both come back as
  //    kind=COACH role=ASSISTANT, differentiated by aiGenerated.
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

  // 2. Schedule the AI auto-reply. The cron at /api/cron/process-ai-
  //    replies handles the rest.
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
