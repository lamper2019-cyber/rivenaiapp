"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitMonthlyWeight } from "@/lib/monthly-weight-checkin";

/**
 * Server action for the 30-day weight slider on /dashboard.
 *
 * Sliders constrain the range client-side, but we re-validate here
 * — a stale tab could send a 0 or a typo'd value from devtools, and
 * the schema check is cheap.
 */

const SubmitSchema = z.object({
  weight: z.coerce.number().min(70).max(700),
  waist: z.coerce.number().min(15).max(100),
});

export type SubmitMonthlyWeightResult =
  | { ok: true; checkInId: string }
  | { ok: false; error: string };

export async function submitMonthlyWeightAction(
  input: z.infer<typeof SubmitSchema>,
): Promise<SubmitMonthlyWeightResult> {
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
    return {
      ok: false,
      error: "Complete onboarding before logging your weight.",
    };
  }

  const result = await submitMonthlyWeight({
    userId: user.id,
    weight: parsed.data.weight,
    waist: parsed.data.waist,
  });

  revalidatePath("/dashboard");
  revalidatePath("/profile");
  return { ok: true, checkInId: result.id };
}
