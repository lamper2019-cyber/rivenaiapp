"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SendSchema = z.object({
  clientUserId: z.string().min(1),
  content: z
    .string()
    .min(1, "Message is required")
    .max(4000)
    .transform((s) => s.trim()),
});

export type SendCoachMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Sean (or any user with role=COACH) sends a personal message that lands in
 * the named client's chat thread, styled as a Sean message.
 *
 * Designed to be called from the coach dashboard. Will refuse for non-coaches.
 */
export async function sendCoachMessage(
  formData: FormData
): Promise<SendCoachMessageResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  const parsed = SendSchema.safeParse({
    clientUserId: formData.get("clientUserId"),
    content: formData.get("content"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let coach;
  try {
    coach = await prisma.user.findUnique({ where: { clerkId: userId } });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!coach) {
    return { ok: false, error: "Coach record not found." };
  }
  if (coach.role !== "COACH") {
    return { ok: false, error: "Only coaches can send Sean messages." };
  }

  const client = await prisma.user.findUnique({
    where: { id: parsed.data.clientUserId },
    select: { id: true, role: true },
  });
  if (!client) return { ok: false, error: "Client not found." };
  if (client.role !== "CLIENT") {
    return { ok: false, error: "Recipient must be a client." };
  }

  const message = await prisma.chatMessage.create({
    data: {
      userId: client.id,
      role: "ASSISTANT",
      kind: "COACH",
      senderUserId: coach.id,
      content: parsed.data.content,
    },
    select: { id: true },
  });

  revalidatePath("/chat");
  return { ok: true, messageId: message.id };
}
