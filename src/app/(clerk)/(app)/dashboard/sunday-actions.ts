"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isRitualOpen,
  parseOptions,
  SUNDAY_REACTION_KINDS,
} from "@/lib/sunday-ritual";

/**
 * Server actions for the Sunday ritual surface on /dashboard.
 *   - submitSundayAnswer: client posts (or updates) her answer for this
 *     week's prompt. Gated to days when the ritual is open AND the user
 *     is an active client OR the coach.
 *   - toggleSundayReaction: flip a 🌹/💪/🌿 on someone else's answer.
 *     Unique constraint on (answer, user, kind) means this is a toggle:
 *     re-tapping removes the reaction.
 */

const SubmitSchema = z.object({
  promptId: z.string().min(1),
  body: z
    .string()
    .min(1, "Write something — it doesn't have to be long.")
    .max(2000, "Keep it under 2000 characters")
    .transform((s) => s.trim()),
});

export type SubmitSundayAnswerResult =
  | { ok: true; answerId: string }
  | { ok: false; error: string };

export async function submitSundayAnswer(
  input: z.infer<typeof SubmitSchema>,
): Promise<SubmitSundayAnswerResult> {
  if (!isRitualOpen()) {
    return {
      ok: false,
      error: "The ritual is replay-only outside Sunday Central time.",
    };
  }
  const parsed = SubmitSchema.safeParse(input);
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
      error: isClerkConfigured
        ? "Not signed in."
        : "Add Clerk keys to .env.local.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true, subscriptionStatus: true },
  });
  if (!user) return { ok: false, error: "Account not found." };
  const okStatuses = ["trialing", "active", "comped"];
  const canPost =
    user.role === "COACH" ||
    (user.role === "CLIENT" &&
      user.subscriptionStatus !== null &&
      okStatuses.includes(user.subscriptionStatus));
  if (!canPost) {
    return { ok: false, error: "Only active members can join the ritual." };
  }

  // Upsert — one answer per (prompt, user). Re-submitting updates body.
  const answer = await prisma.sundayPromptAnswer.upsert({
    where: {
      promptId_userId: {
        promptId: parsed.data.promptId,
        userId: user.id,
      },
    },
    create: {
      promptId: parsed.data.promptId,
      userId: user.id,
      body: parsed.data.body,
    },
    update: {
      body: parsed.data.body,
    },
    select: { id: true },
  });

  revalidatePath("/dashboard");
  return { ok: true, answerId: answer.id };
}

const ToggleSchema = z.object({
  answerId: z.string().min(1),
  kind: z.enum(["heart", "fire"]),
});

export type ToggleSundayReactionResult =
  | { ok: true; on: boolean }
  | { ok: false; error: string };

export async function toggleSundayReaction(
  input: z.infer<typeof ToggleSchema>,
): Promise<ToggleSundayReactionResult> {
  if (!isRitualOpen()) {
    return {
      ok: false,
      error: "The ritual is replay-only outside Sunday Central time.",
    };
  }
  const parsed = ToggleSchema.safeParse(input);
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
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true, subscriptionStatus: true },
  });
  if (!user) return { ok: false, error: "Account not found." };

  const okStatuses = ["trialing", "active", "comped"];
  if (
    user.role !== "COACH" &&
    !(
      user.role === "CLIENT" &&
      user.subscriptionStatus !== null &&
      okStatuses.includes(user.subscriptionStatus)
    )
  ) {
    return { ok: false, error: "Only active members can react." };
  }

  if (!SUNDAY_REACTION_KINDS.includes(parsed.data.kind)) {
    return { ok: false, error: "Unknown reaction kind." };
  }

  // Toggle: try delete first; if nothing deleted, insert.
  try {
    const deleted = await prisma.sundayPromptReaction.delete({
      where: {
        answerId_userId_kind: {
          answerId: parsed.data.answerId,
          userId: user.id,
          kind: parsed.data.kind,
        },
      },
    });
    if (deleted) {
      revalidatePath("/dashboard");
      return { ok: true, on: false };
    }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      // Not found — fall through to create
    } else {
      return { ok: false, error: "Couldn't update reaction." };
    }
  }

  await prisma.sundayPromptReaction.create({
    data: {
      answerId: parsed.data.answerId,
      userId: user.id,
      kind: parsed.data.kind,
    },
  });
  revalidatePath("/dashboard");
  return { ok: true, on: true };
}

// ─────────────────────── Tap a Sunday choice ───────────────────────

const TapSchema = z.object({
  promptId: z.string().min(1),
  choice: z.string().min(1).max(64),
});

export type TapSundayChoiceResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Server action for the three tap formats (pulse / this-or-that /
 * is-this-you). She picks an option, we upsert her answer with `choice`
 * set. Re-tapping a different option updates instead of creating a second
 * row — the unique on (promptId, userId) handles that.
 *
 * Gated to Sunday Central time so the room only fills on the actual ritual
 * day; off-Sunday the surface renders in replay mode.
 */
export async function tapSundayChoice(
  input: z.infer<typeof TapSchema>,
): Promise<TapSundayChoiceResult> {
  if (!isRitualOpen()) {
    return {
      ok: false,
      error: "The ritual is replay-only outside Sunday Central time.",
    };
  }
  const parsed = TapSchema.safeParse(input);
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

  // Load the prompt + verify the choice is one of its declared options.
  // Otherwise a stale client (or a curious dev tools session) could write
  // arbitrary strings into the tally column.
  const prompt = await prisma.sundayPrompt.findUnique({
    where: { id: parsed.data.promptId },
    select: { id: true, kind: true, options: true },
  });
  if (!prompt) return { ok: false, error: "Prompt not found." };
  if (prompt.kind === "open") {
    return { ok: false, error: "This format doesn't take tap answers." };
  }
  const validKeys = new Set(parseOptions(prompt.options).map((o) => o.key));
  if (!validKeys.has(parsed.data.choice)) {
    return { ok: false, error: "Unknown choice." };
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true, subscriptionStatus: true },
  });
  if (!user) return { ok: false, error: "Account not found." };
  const okStatuses = ["trialing", "active", "comped"];
  const canTap =
    user.role === "COACH" ||
    (user.role === "CLIENT" &&
      user.subscriptionStatus !== null &&
      okStatuses.includes(user.subscriptionStatus));
  if (!canTap) {
    return { ok: false, error: "Only active members can join the ritual." };
  }

  await prisma.sundayPromptAnswer.upsert({
    where: {
      promptId_userId: { promptId: prompt.id, userId: user.id },
    },
    create: {
      promptId: prompt.id,
      userId: user.id,
      choice: parsed.data.choice,
    },
    update: {
      choice: parsed.data.choice,
    },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}
