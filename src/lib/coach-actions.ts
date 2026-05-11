"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

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

  // Fan out a phone push. Best-effort — never blocks the action result.
  await sendPushToUser(client.id, {
    title: "Message from Sean",
    body: preview(parsed.data.content, 120),
    url: "/chat",
    tag: `coach-msg-${message.id}`,
  });

  revalidatePath("/chat");
  revalidatePath("/dashboard");
  revalidatePath(`/coach/clients/${client.id}`);
  return { ok: true, messageId: message.id };
}

/**
 * Trim a chat message for use as a push notification body. iOS truncates
 * around 110 chars in the lock-screen preview; keep it tight.
 */
function preview(content: string, max: number): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1).trimEnd() + "…";
}

/* ──────────────────────────────────────────────────────────── */

const UpdateTargetsSchema = z.object({
  clientUserId: z.string().min(1),
  cutCalories: z.coerce.number().int().min(800).max(5000),
  proteinFloor: z.coerce.number().int().min(30).max(400),
});

export type UpdateClientTargetsResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Coach updates a client's daily calorie and protein targets.
 *
 * Side effect: posts a COACH message into the client's chat announcing the
 * change. That message lights up the home-screen "Message from Sean" chip
 * (the client's localStorage tracks the latest seen coach message id).
 */
export async function updateClientTargets(
  formData: FormData
): Promise<UpdateClientTargetsResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  const parsed = UpdateTargetsSchema.safeParse({
    clientUserId: formData.get("clientUserId"),
    cutCalories: formData.get("cutCalories"),
    proteinFloor: formData.get("proteinFloor"),
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
  if (!coach) return { ok: false, error: "Coach record not found." };
  if (coach.role !== "COACH") {
    return { ok: false, error: "Only coaches can edit client targets." };
  }

  const client = await prisma.user.findUnique({
    where: { id: parsed.data.clientUserId },
    select: {
      id: true,
      role: true,
      profile: {
        select: { cutCalories: true, proteinFloor: true },
      },
    },
  });
  if (!client) return { ok: false, error: "Client not found." };
  if (client.role !== "CLIENT") {
    return { ok: false, error: "Recipient must be a client." };
  }
  if (!client.profile) {
    return { ok: false, error: "Client hasn't finished onboarding yet." };
  }

  const oldCal = client.profile.cutCalories;
  const oldProtein = client.profile.proteinFloor;
  const newCal = parsed.data.cutCalories;
  const newProtein = parsed.data.proteinFloor;

  // No-op guard so we don't spam the chat when nothing actually changed.
  if (oldCal === newCal && oldProtein === newProtein) {
    return { ok: false, error: "No changes to save." };
  }

  await prisma.profile.update({
    where: { userId: client.id },
    data: { cutCalories: newCal, proteinFloor: newProtein },
  });

  const announcement = buildTargetChangeAnnouncement({
    oldCal,
    newCal,
    oldProtein,
    newProtein,
  });

  const message = await prisma.chatMessage.create({
    data: {
      userId: client.id,
      role: "ASSISTANT",
      kind: "COACH",
      senderUserId: coach.id,
      content: announcement,
    },
    select: { id: true },
  });

  // Phone push so the client sees the change land in real time.
  await sendPushToUser(client.id, {
    title: "Sean updated your targets",
    body: preview(announcement, 120),
    url: "/chat",
    tag: `coach-targets-${message.id}`,
  });

  revalidatePath("/chat");
  revalidatePath("/dashboard");
  revalidatePath(`/coach/clients/${client.id}`);
  return { ok: true, messageId: message.id };
}

function buildTargetChangeAnnouncement(args: {
  oldCal: number;
  newCal: number;
  oldProtein: number;
  newProtein: number;
}): string {
  const calChanged = args.oldCal !== args.newCal;
  const proteinChanged = args.oldProtein !== args.newProtein;

  if (calChanged && proteinChanged) {
    return `New targets, effective today: ${args.newCal} calories and ${args.newProtein}g protein. Numbers move when you move — trust them and eat with intention.`;
  }
  if (calChanged) {
    const direction = args.newCal > args.oldCal ? "Bumped" : "Pulled back";
    return `${direction} your daily calories to ${args.newCal}. Trust the new target — it's calibrated to where your body is right now.`;
  }
  // proteinChanged only
  const direction = args.newProtein > args.oldProtein ? "Raising" : "Adjusting";
  return `${direction} your protein floor to ${args.newProtein}g. Hit it every day — that's non-negotiable.`;
}
