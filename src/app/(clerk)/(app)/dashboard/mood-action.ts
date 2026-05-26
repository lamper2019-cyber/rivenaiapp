"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import { MOOD_KINDS } from "@/lib/daily-mood";

/**
 * Persist today's mood for the signed-in client. Upserts on
 * (userId, centralDate) so re-tapping later in the day updates instead of
 * stacking rows. Coaches can tap too — the dashboard ribbon is visible to
 * everyone who's signed in.
 *
 * No push, no notification, no streak. The whole point is that this is a
 * single-tap-with-no-strings community moment.
 */

const SetMoodSchema = z.object({
  mood: z.enum(MOOD_KINDS as [string, ...string[]]),
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
      update: { mood: parsed.data.mood },
    });
  } catch {
    return { ok: false, error: "Couldn't save right now. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
