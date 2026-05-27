"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import { MOOD_CAUSES, MOOD_KINDS } from "@/lib/daily-mood";

/**
 * Persist today's mood (and optional cause) for the signed-in client.
 * Upserts on (userId, centralDate) so re-tapping later in the day updates
 * instead of stacking rows. Coaches can tap too — the dashboard ribbon
 * is visible to everyone who's signed in.
 *
 * No push, no notification, no streak. This is a single-tap-with-no-
 * strings community moment.
 */

const SetMoodSchema = z.object({
  mood: z.enum(MOOD_KINDS as [string, ...string[]]),
});

const SetMoodCauseSchema = z.object({
  cause: z.enum(MOOD_CAUSES as [string, ...string[]]),
});

export type SetMoodResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setMyMood(
  input: z.infer<typeof SetMoodSchema>,
): Promise<SetMoodResult> {
  const parsed = SetMoodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid mood" };
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
      select: { id: true },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Account not found." };

  const today = startOfCentralDay();

  try {
    await prisma.dailyMood.upsert({
      where: {
        userId_centralDate: { userId: user.id, centralDate: today },
      },
      create: {
        userId: user.id,
        centralDate: today,
        mood: parsed.data.mood,
      },
      // Re-tapping a different mood mid-day clears the previous cause
      // — the "why" the day was meh at noon might not match the why
      // it's good at 9 PM. Keeping the old cause attached would lie.
      update: { mood: parsed.data.mood, cause: null },
    });
  } catch {
    return { ok: false, error: "Couldn't save right now. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Optional follow-up tap. After she picks a mood she gets a soft
 * "what's making it ___?" question — sleep / food / stress. This sets
 * the cause column on today's DailyMood row. Idempotent; re-tapping
 * a different cause updates.
 */
export async function setMyMoodCause(
  input: z.infer<typeof SetMoodCauseSchema>,
): Promise<SetMoodResult> {
  const parsed = SetMoodCauseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid cause" };
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
      select: { id: true },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Account not found." };

  const today = startOfCentralDay();

  // Only update an existing row — if she hasn't tapped a mood yet for
  // today, we have nothing to attach a cause to. The UI should never
  // call this before setMyMood, but defend the order anyway.
  const existing = await prisma.dailyMood.findUnique({
    where: { userId_centralDate: { userId: user.id, centralDate: today } },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, error: "Pick a mood first." };
  }

  try {
    await prisma.dailyMood.update({
      where: { id: existing.id },
      data: { cause: parsed.data.cause },
    });
  } catch {
    return { ok: false, error: "Couldn't save right now. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
