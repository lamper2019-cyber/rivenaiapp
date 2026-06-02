"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import {
  runMondayCheckinBatch,
  type MondayCheckinBatchResult,
} from "@/lib/monday-checkin";
import { DAY_KEYS, type DayKey } from "@/lib/calorie-schedule";

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
 * RIVEN (or any user with role=COACH) sends a personal message that lands in
 * the named client's chat thread, styled as a RIVEN message.
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
    return { ok: false, error: "Only coaches can send RIVEN messages." };
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
  // Deep-link to /dashboard so she lands on the SeanPromptHeadline
  // showing the new message (the /chat thread is retired).
  await sendPushToUser(client.id, {
    title: "Message from RIVEN",
    body: preview(parsed.data.content, 120),
    url: "/dashboard",
    tag: `coach-msg-${message.id}`,
  });

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
 * change. That message lights up the home-screen "Message from RIVEN" chip
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
  // Deep-links to /dashboard since /chat is retired — the targets
  // announcement will surface in the SeanPromptHeadline.
  await sendPushToUser(client.id, {
    title: "RIVEN updated your targets",
    body: preview(announcement, 120),
    url: "/dashboard",
    tag: `coach-targets-${message.id}`,
  });

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
 * Voice-rewrite the coach's draft message in RIVEN's R.I.S.E.-aware tone.
 * Coach-only. Doesn't touch the DB; the rewrite just replaces the textarea
 * value client-side before Send is tapped. Original text never persists.
 *
 * System prompt is the verbatim spec the coach provided so the voice stays
 * consistent and is easy to tune. Don't shorten it.
 */
const REWRITE_SYSTEM_PROMPT = `You are rewriting messages for RIVEN, a nutrition coach. RIVEN's voice is:
- Direct, warm, no-BS. He's a coach who cares, not a guru or salesman.
- Speaks like a real person who's been through it — RIVEN went from 241 lbs to fit, so he understands the struggle firsthand
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

Rewrite the user's message in RIVEN's voice. If it's a negative client update, apply R.I.S.E. If it's a general coaching message (encouragement, check-in, instruction), keep it warm, direct, and end with a clear action. Return ONLY the rewritten message — no preamble, no explanation, no quotes around it.`;

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

/* ──────────────────────────────────────────────────────────── */

export type TriggerMondayCheckinsResult =
  | ({ ok: true } & MondayCheckinBatchResult)
  | { ok: false; error: string };

/**
 * Manual trigger for the Monday check-in batch. Same work as the scheduled
 * cron route, but gated by Clerk + role=COACH instead of CRON_SECRET so
 * RIVEN can fire it from the coach profile page (useful for previewing
 * voice + verifying the system before the cron service is wired up, and
 * for catching up if a Monday gets missed).
 */
export async function triggerMondayCheckinBatch(): Promise<TriggerMondayCheckinsResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

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
    return { ok: false, error: "Only coaches can run this." };
  }

  if (!isAnthropicConfigured) {
    return {
      ok: false,
      error: "AI rewrite isn't configured. Set ANTHROPIC_API_KEY on Railway.",
    };
  }

  const result = await runMondayCheckinBatch();

  revalidatePath("/messages");
  revalidatePath("/dashboard");
  revalidatePath("/coach/clients");

  return { ok: true, ...result };
}

// ─────────────────────── Calorie cycling (per-client) ───────────────────────

const ScheduleDaysSchema = z.object({
  Sun: z.coerce.number().int().min(800).max(5000),
  Mon: z.coerce.number().int().min(800).max(5000),
  Tue: z.coerce.number().int().min(800).max(5000),
  Wed: z.coerce.number().int().min(800).max(5000),
  Thu: z.coerce.number().int().min(800).max(5000),
  Fri: z.coerce.number().int().min(800).max(5000),
  Sat: z.coerce.number().int().min(800).max(5000),
});

const SetCalorieScheduleSchema = z.object({
  clientUserId: z.string().min(1),
  action: z.enum(["set", "clear"]),
});

export type SetClientCalorieScheduleResult =
  | { ok: true; cleared: boolean }
  | { ok: false; error: string };

/**
 * Coach sets (or clears) a per-day-of-week calorie cycle on one client's
 * Profile. The downstream helper getTodayCalorieTarget() in calorie-schedule.ts
 * resolves whichever value applies to today's Central-time day; clearing
 * reverts the client to the flat cutCalories on her Profile.
 *
 * No chat-announcement side effect (unlike updateClientTargets) — calorie
 * cycling is something RIVEN configures in advance, often without telling
 * the client up front. He can announce manually via /coach if he wants.
 */
export async function setClientCalorieSchedule(
  formData: FormData,
): Promise<SetClientCalorieScheduleResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  const parsed = SetCalorieScheduleSchema.safeParse({
    clientUserId: formData.get("clientUserId"),
    action: formData.get("action"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  let coach;
  try {
    coach = await prisma.user.findUnique({ where: { clerkId: userId } });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!coach) return { ok: false, error: "Coach record not found." };
  if (coach.role !== "COACH") {
    return { ok: false, error: "Only coaches can edit calorie schedules." };
  }

  const client = await prisma.user.findUnique({
    where: { id: parsed.data.clientUserId },
    select: { id: true, role: true, profile: { select: { id: true } } },
  });
  if (!client) return { ok: false, error: "Client not found." };
  if (client.role !== "CLIENT") {
    return { ok: false, error: "Recipient must be a client." };
  }
  if (!client.profile) {
    return { ok: false, error: "Client hasn't finished onboarding yet." };
  }

  if (parsed.data.action === "clear") {
    await prisma.profile.update({
      where: { id: client.profile.id },
      // Prisma JSON nullability gotcha: passing JS `null` won't clear the
      // column — Prisma.DbNull explicitly sets the cell to SQL NULL.
      data: { dailyCalorieSchedule: Prisma.DbNull },
    });
    revalidatePath(`/coach/clients/${client.id}`);
    revalidatePath("/dashboard");
    return { ok: true, cleared: true };
  }

  // action === "set"
  const daysRaw: Record<string, FormDataEntryValue | null> = {};
  for (const k of DAY_KEYS) daysRaw[k] = formData.get(k);
  const daysParsed = ScheduleDaysSchema.safeParse(daysRaw);
  if (!daysParsed.success) {
    return {
      ok: false,
      error:
        daysParsed.error.issues[0]?.message ??
        "All seven days need a calorie number between 800 and 5000.",
    };
  }

  // Re-key in canonical DAY_KEYS order so the JSONB row reads cleanly.
  const normalized = Object.fromEntries(
    DAY_KEYS.map((k: DayKey) => [k, daysParsed.data[k]]),
  );

  await prisma.profile.update({
    where: { id: client.profile.id },
    data: { dailyCalorieSchedule: normalized },
  });

  revalidatePath(`/coach/clients/${client.id}`);
  revalidatePath("/dashboard");
  return { ok: true, cleared: false };
}

// ─────────────────────── Comp management (per-client + bulk) ───────────────────────

const SetClientCompSchema = z.object({
  clientUserId: z.string().min(1),
  // "on" sets subscriptionStatus="comped" (paywall bypass, Stripe webhook
  // explicitly won't overwrite it). "off" clears the status to null so she
  // gets routed through the regular paywall on her next page load.
  comp: z.enum(["on", "off"]),
});

export type SetClientCompResult =
  | { ok: true; comp: boolean }
  | { ok: false; error: string };

/**
 * Flip a single client between comped (free forever, paywall bypass) and
 * not-comped (cleared status → hits /pricing on next visit). Coach-only.
 */
export async function setClientComp(
  formData: FormData,
): Promise<SetClientCompResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  const parsed = SetClientCompSchema.safeParse({
    clientUserId: formData.get("clientUserId"),
    comp: formData.get("comp"),
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
    return { ok: false, error: "Only coaches can change comp status." };
  }

  const client = await prisma.user.findUnique({
    where: { id: parsed.data.clientUserId },
    select: { id: true, role: true },
  });
  if (!client) return { ok: false, error: "Client not found." };
  if (client.role !== "CLIENT") {
    return { ok: false, error: "Recipient must be a client." };
  }

  const turningOn = parsed.data.comp === "on";
  await prisma.user.update({
    where: { id: client.id },
    data: { subscriptionStatus: turningOn ? "comped" : null },
  });

  revalidatePath(`/coach/clients/${client.id}`);
  revalidatePath("/coach/clients");
  revalidatePath("/dashboard");
  return { ok: true, comp: turningOn };
}

export type CompAllClientsResult =
  | { ok: true; comped: number; total: number; alreadyComped: number }
  | { ok: false; error: string };

/**
 * Bulk-comp every existing CLIENT user — RIVEN's "grandfather them all in
 * for now" button. Skips anyone already on `comped` so the report counts
 * are honest. Safe to run multiple times; idempotent. Future signups still
 * go through the normal /pricing + Stripe flow.
 */
export async function compAllExistingClients(): Promise<CompAllClientsResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  let coach;
  try {
    coach = await prisma.user.findUnique({ where: { clerkId: userId } });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!coach) return { ok: false, error: "Coach record not found." };
  if (coach.role !== "COACH") {
    return { ok: false, error: "Only coaches can bulk-comp clients." };
  }

  const allClients = await prisma.user.count({ where: { role: "CLIENT" } });
  const alreadyComped = await prisma.user.count({
    where: { role: "CLIENT", subscriptionStatus: "comped" },
  });

  const { count } = await prisma.user.updateMany({
    where: {
      role: "CLIENT",
      OR: [
        { subscriptionStatus: { not: "comped" } },
        { subscriptionStatus: null },
      ],
    },
    data: { subscriptionStatus: "comped" },
  });

  revalidatePath("/coach/clients");
  revalidatePath("/coach/profile");
  revalidatePath("/dashboard");

  return {
    ok: true,
    comped: count,
    total: allClients,
    alreadyComped,
  };
}

// ─────────────────────── Leads (quiz funnel) ───────────────────────

const DeleteLeadSchema = z.object({
  leadId: z.string().min(1),
});

export type DeleteLeadResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Coach deletes a single quiz lead. Hard delete — the Lead row has no FK
 * relations (convertedToUserId is a loose string by design), so nothing
 * cascades and no client data is touched.
 */
export async function deleteLead(
  formData: FormData,
): Promise<DeleteLeadResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  const parsed = DeleteLeadSchema.safeParse({ leadId: formData.get("leadId") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

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
    return { ok: false, error: "Only coaches can delete leads." };
  }

  try {
    await prisma.lead.delete({ where: { id: parsed.data.leadId } });
  } catch (err) {
    // P2025 = record to delete does not exist. Treat as already-gone success
    // so a double-tap from the UI doesn't flash a scary error.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      revalidatePath("/coach/leads");
      return { ok: true };
    }
    console.error("deleteLead failed", err);
    return { ok: false, error: "Couldn't delete — try again." };
  }

  revalidatePath("/coach/leads");
  return { ok: true };
}

// ─────────────────────── Sunday ritual prompt editor ───────────────────────

const TAP_KINDS_SET = new Set(["pulse", "this_or_that", "is_this_you"] as const);
type TapKind = "pulse" | "this_or_that" | "is_this_you";

const OptionSchema = z.object({
  key: z.string().min(1).max(64).transform((s) => s.trim()),
  label: z.string().min(1).max(200).transform((s) => s.trim()),
});

const SundayPromptSchema = z.object({
  question: z
    .string()
    .min(1, "Write something — even one line works.")
    .max(500, "Keep the prompt under 500 characters")
    .transform((s) => s.trim()),
  kind: z.enum(["pulse", "this_or_that", "is_this_you"]),
  options: z.array(OptionSchema).min(2).max(4),
});

export type SetSundayPromptResult =
  | { ok: true; weekStart: string }
  | { ok: false; error: string };

/**
 * Coach writes / updates this week's Sunday ritual prompt. Keyed by ISO
 * weekStart so each week gets one prompt; running this multiple times
 * the same week just edits everything (idempotent).
 *
 * Three tap-based formats live here (pulse / this_or_that / is_this_you).
 * The legacy "open" written format is retired for new prompts — historical
 * prompts still render in replay mode, but the editor doesn't surface it
 * as a choice anymore.
 */
export async function setSundayPrompt(
  formData: FormData,
): Promise<SetSundayPromptResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  let coach;
  try {
    coach = await prisma.user.findUnique({ where: { clerkId: userId } });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!coach) return { ok: false, error: "Coach record not found." };
  if (coach.role !== "COACH") {
    return { ok: false, error: "Only coaches can set the Sunday prompt." };
  }

  // Options arrive as a JSON-encoded array under one field. The editor
  // serializes its UI state before submit; we parse + zod-validate here.
  let optionsRaw: unknown;
  try {
    const optionsStr = formData.get("options");
    optionsRaw =
      typeof optionsStr === "string" && optionsStr.length > 0
        ? JSON.parse(optionsStr)
        : [];
  } catch {
    return { ok: false, error: "Options were malformed — try again." };
  }

  const kindRaw = formData.get("kind");
  if (typeof kindRaw !== "string" || !TAP_KINDS_SET.has(kindRaw as TapKind)) {
    return { ok: false, error: "Pick a format." };
  }

  const parsed = SundayPromptSchema.safeParse({
    question: formData.get("question"),
    kind: kindRaw,
    options: optionsRaw,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  // this_or_that needs exactly 2 options; pulse / is_this_you need 3.
  const expected = parsed.data.kind === "this_or_that" ? 2 : 3;
  if (parsed.data.options.length !== expected) {
    return {
      ok: false,
      error: `${
        parsed.data.kind === "this_or_that" ? "This or that" : "This format"
      } needs ${expected} options.`,
    };
  }

  // Keys must be unique within a prompt — the tally column is keyed by them.
  const keys = new Set(parsed.data.options.map((o) => o.key));
  if (keys.size !== parsed.data.options.length) {
    return { ok: false, error: "Option keys must be unique." };
  }

  // ISO week start (Monday) — inline to avoid circular dep with @/lib/week.
  // Equivalent to startOfIsoWeek(new Date()).
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + offsetToMonday);

  await prisma.sundayPrompt.upsert({
    where: { weekStart: monday },
    create: {
      weekStart: monday,
      question: parsed.data.question,
      kind: parsed.data.kind,
      options: parsed.data.options,
    },
    update: {
      question: parsed.data.question,
      kind: parsed.data.kind,
      options: parsed.data.options,
    },
  });

  revalidatePath("/coach/profile");
  revalidatePath("/dashboard");
  return { ok: true, weekStart: monday.toISOString() };
}
