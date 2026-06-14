"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setWeighForDay, deleteWeighForDay } from "@/lib/daily-weigh-in";

/**
 * Account weight-log editor actions. She can re-log a day she typed wrong,
 * backfill a day she missed, or delete a stray row — for today or any past
 * day. Scoped to the signed-in client (clerkId), so a leaked endpoint can
 * never touch another account's history.
 */

export type WeightLogResult = { ok: true } | { ok: false; error: string };

const DayKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Bad date.")
  .refine((k) => k <= new Date().toISOString().slice(0, 10), {
    message: "Can't log a day that hasn't happened yet.",
  });

const SetSchema = z.object({
  dayKey: DayKey,
  weight: z.coerce.number().min(70).max(700),
});

async function dbUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
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
  if (!user?.profile) return { ok: false, error: "Finish onboarding first." };
  return { ok: true, userId: user.id };
}

/** Add or correct a day's weight (re-log a typo or backfill a missed day). */
export async function setWeightForDayAction(
  input: z.infer<typeof SetSchema>,
): Promise<WeightLogResult> {
  const parsed = SetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  }
  const who = await dbUserId();
  if (!who.ok) return who;

  try {
    await setWeighForDay({
      userId: who.userId,
      dayKey: parsed.data.dayKey,
      weight: parsed.data.weight,
    });
  } catch {
    return { ok: false, error: "Couldn't save that. Try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

const DeleteSchema = z.object({ dayKey: DayKey });

/** Delete a day's weigh-in (logged it by mistake). */
export async function deleteWeightForDayAction(
  input: z.infer<typeof DeleteSchema>,
): Promise<WeightLogResult> {
  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad date." };
  const who = await dbUserId();
  if (!who.ok) return who;

  try {
    await deleteWeighForDay({ userId: who.userId, dayKey: parsed.data.dayKey });
  } catch {
    return { ok: false, error: "Couldn't delete that. Try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}
