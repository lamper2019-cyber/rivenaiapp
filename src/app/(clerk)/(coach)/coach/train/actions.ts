"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EXERCISES_BY_KEY } from "@/lib/workout";

/**
 * Save one exercise's working numbers from the /coach/train board.
 *
 * The client sends absolute values (not deltas) so a double-tap or a stale
 * tab can't silently compound an increment. `weightChangedAt` only moves when
 * the WEIGHT actually changes — that timestamp is the progression signal
 * ("this has sat at 50 for two weeks"), so bumping it on a sets/reps tweak
 * would quietly reset the thing the board exists to show.
 */

const SaveSchema = z.object({
  exerciseKey: z.string().min(1),
  sets: z.coerce.number().int().min(1).max(20),
  reps: z.coerce.number().int().min(1).max(100),
  weightLb: z.coerce.number().int().min(0).max(1000),
});

export type SaveWorkoutResult = { ok: true } | { ok: false; error: string };

export async function saveWorkoutSetting(
  input: z.infer<typeof SaveSchema>,
): Promise<SaveWorkoutResult> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { exerciseKey, sets, reps, weightLb } = parsed.data;

  // Only keys from the static plan — never let an arbitrary string create rows.
  if (!EXERCISES_BY_KEY[exerciseKey]) {
    return { ok: false, error: "Unknown exercise." };
  }

  const { userId: clerkId } = auth();
  if (!clerkId) return { ok: false, error: "Not signed in." };

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, role: true },
  });
  if (!user) return { ok: false, error: "Not signed in." };
  if (user.role !== "COACH") return { ok: false, error: "Coach only." };

  const existing = await prisma.workoutSetting.findUnique({
    where: { userId_exerciseKey: { userId: user.id, exerciseKey } },
    select: { weightLb: true },
  });

  if (!existing) {
    await prisma.workoutSetting.create({
      data: { userId: user.id, exerciseKey, sets, reps, weightLb },
    });
  } else {
    await prisma.workoutSetting.update({
      where: { userId_exerciseKey: { userId: user.id, exerciseKey } },
      data: {
        sets,
        reps,
        weightLb,
        // Only stamp when the weight genuinely moved.
        ...(existing.weightLb !== weightLb ? { weightChangedAt: new Date() } : {}),
      },
    });
  }

  revalidatePath("/coach/train");
  return { ok: true };
}
