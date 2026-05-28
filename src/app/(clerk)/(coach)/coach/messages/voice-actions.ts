"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

/**
 * Voice moment actions for the coach dashboard:
 *
 *   - sendVoiceMoment: Sean recorded a 60-second voice memo for a
 *     queued milestone. Creates a COACH-kind ChatMessage with the
 *     audio URL + duration, flips the VoiceMoment to "recorded",
 *     pushes the client. The audio renders as a player bubble in
 *     her unified Sean thread.
 *
 *   - skipVoiceMoment: Sean chose not to record for this trigger.
 *     Flips the row to "skipped" so the queue clears. Nothing gets
 *     sent to the client.
 *
 * Both gated to COACH role.
 */

const SendSchema = z.object({
  voiceMomentId: z.string().min(1),
  audioUrl: z.string().url(),
  durationSec: z.number().int().min(1).max(120),
});

const SkipSchema = z.object({
  voiceMomentId: z.string().min(1),
});

export type VoiceMomentResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

export async function sendVoiceMoment(
  input: z.infer<typeof SendSchema>,
): Promise<VoiceMomentResult> {
  const parsed = SendSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const coach = await requireCoach();
  if ("error" in coach) return coach;

  const moment = await prisma.voiceMoment.findUnique({
    where: { id: parsed.data.voiceMomentId },
    select: {
      id: true,
      recipientUserId: true,
      status: true,
      triggerKind: true,
    },
  });
  if (!moment) return { ok: false, error: "Voice moment not found." };
  if (moment.status !== "queued") {
    return { ok: false, error: `Already ${moment.status}.` };
  }

  // Create the COACH-kind audio message. Plain content stays empty —
  // the player bubble keys off audioUrl. senderUserId = Sean (coach)
  // so the audit trail shows it was him, even though clients see
  // every COACH message as just "from Sean."
  const message = await prisma.chatMessage.create({
    data: {
      userId: moment.recipientUserId,
      role: "ASSISTANT",
      kind: "COACH",
      senderUserId: coach.id,
      content: "",
      audioUrl: parsed.data.audioUrl,
      audioDurationSec: parsed.data.durationSec,
      aiGenerated: false,
    },
    select: { id: true },
  });

  await prisma.voiceMoment.update({
    where: { id: moment.id },
    data: {
      status: "recorded",
      audioUrl: parsed.data.audioUrl,
      durationSec: parsed.data.durationSec,
      deliveredMessageId: message.id,
      recordedAt: new Date(),
    },
  });

  // Cancel any queued AI auto-reply for this client — a voice memo
  // from Sean is a much stronger signal than a text reply, no need
  // for the AI to also chime in.
  await prisma.pendingAiReply.updateMany({
    where: { userId: moment.recipientUserId, status: "pending" },
    data: { status: "cancelled", sentAt: new Date() },
  });

  // Push to the client. Different copy than text replies so she
  // knows what to expect when she opens the app.
  try {
    await sendPushToUser(moment.recipientUserId, {
      title: "Sean recorded you a voice memo",
      body: "Tap to listen.",
      url: "/dashboard",
      tag: `voice-${moment.recipientUserId}`,
    });
  } catch {
    /* push failure shouldn't surface — the DB row is the truth */
  }

  revalidatePath("/coach/messages");
  revalidatePath("/dashboard");
  return { ok: true, messageId: message.id };
}

export async function skipVoiceMoment(
  input: z.infer<typeof SkipSchema>,
): Promise<VoiceMomentResult> {
  const parsed = SkipSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const coach = await requireCoach();
  if ("error" in coach) return coach;

  await prisma.voiceMoment.updateMany({
    where: { id: parsed.data.voiceMomentId, status: "queued" },
    data: { status: "skipped" },
  });

  revalidatePath("/coach/messages");
  return { ok: true };
}

async function requireCoach(): Promise<
  { id: string } | { ok: false; error: string }
> {
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
    return { ok: false, error: "Only coaches can record voice moments." };
  }
  return { id: coach.id };
}
