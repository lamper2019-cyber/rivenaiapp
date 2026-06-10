"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitDailyWeight } from "@/lib/daily-weigh-in";

/**
 * Server action for the DAILY weight slider on /dashboard. Weight-only (the
 * waist + photos live in the monthly check-in). Re-validates the range server-
 * side — a stale tab could send a typo'd value.
 */

const SubmitSchema = z.object({
  weight: z.coerce.number().min(70).max(700),
});

export type SubmitDailyWeightResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitDailyWeightAction(
  input: z.infer<typeof SubmitSchema>,
): Promise<SubmitDailyWeightResult> {
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
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
      select: { id: true, profile: { select: { id: true } } },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Account not found." };
  if (!user.profile) {
    return { ok: false, error: "Complete onboarding before logging your weight." };
  }

  await submitDailyWeight({ userId: user.id, weight: parsed.data.weight });

  revalidatePath("/dashboard");
  revalidatePath("/profile");
  return { ok: true };
}
