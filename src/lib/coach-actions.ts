"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

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

/* ──────────────────────────────────────────────────────────── */

const RewriteSchema = z.object({
  draft: z
    .string()
    .min(1, "Type a message first.")
    .max(4000, "Message is too long to rewrite — under 4000 characters."),
});

export type RewriteCoachMessageResult =
  | { ok: true; rewritten: string }
  | { ok: false; error: string };

/**
 * Voice-rewrite the coach's draft message in Sean's R.I.S.E.-aware tone.
 * Coach-only. Doesn't touch the DB; the rewrite just replaces the textarea
 * value client-side before Send is tapped. Original text never persists.
 *
 * System prompt is the verbatim spec the coach provided so the voice stays
 * consistent and is easy to tune. Don't shorten it.
 */
const REWRITE_SYSTEM_PROMPT = `You are rewriting messages for Sean, a nutrition coach. Sean's voice is:
- Direct, warm, no-BS. He's a coach who cares, not a guru or salesman.
- Speaks like a real person who's been through it — Sean went from 241 lbs to fit, so he understands the struggle firsthand
- Casual but never sloppy. Uses contractions, short sentences, occasional profanity is fine but not constant
- No fluff, no 'crush your goals,' no 'transformation journey' language
- Doesn't shame the client. Recognizes what happened, reframes it as a system issue (not a moral failing), gives one small specific fix, sets the next expectation
- Uses the R.I.S.E. formula for any negative client update (missed meals, fell off, binged, no steps):
  R = Recognize what she said, no judgment
  I = Interpret it as a system issue, not her fault
  S = Solve with ONE small specific fix doable now
  E = Expect — reset standard, forward momentum, clear next action
- Keep responses under 5 sentences when possible
- Always end with a concrete next step

Rewrite the user's message in Sean's voice. If it's a negative client update, apply R.I.S.E. If it's a general coaching message (encouragement, check-in, instruction), keep it warm, direct, and end with a clear action. Return ONLY the rewritten message — no preamble, no explanation, no quotes around it.`;

export async function rewriteCoachMessage(
  formData: FormData
): Promise<RewriteCoachMessageResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  if (!isAnthropicConfigured) {
    return {
      ok: false,
      error: "AI rewrite isn't configured. Set ANTHROPIC_API_KEY in Railway env vars.",
    };
  }

  const parsed = RewriteSchema.safeParse({ draft: formData.get("draft") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Confirm role=COACH. Same gating pattern as sendCoachMessage so this
  // endpoint can't be used by random signed-in clients to burn API budget.
  let coach;
  try {
    coach = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { role: true },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!coach) return { ok: false, error: "Coach record not found." };
  if (coach.role !== "COACH") {
    return { ok: false, error: "Only coaches can rewrite messages." };
  }

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: REWRITE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: parsed.data.draft }],
    });

    // Concatenate any text blocks; the model occasionally returns multiple.
    const rewritten = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim()
      // Strip surrounding quotes if the model wraps the response, despite
      // the system prompt asking it not to. Belt-and-suspenders.
      .replace(/^["“”']+|["“”']+$/g, "")
      .trim();

    if (!rewritten) {
      return { ok: false, error: "Couldn't rewrite — try again." };
    }
    return { ok: true, rewritten };
  } catch (err) {
    console.error("rewriteCoachMessage failed", err);
    return { ok: false, error: "Couldn't rewrite — try again." };
  }
}
