"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitWaist } from "@/lib/weekly-review";

/**
 * Server action for the weekly waist measurement (the third step of the Sunday
 * ritual). One row per ISO week — re-submitting the same week overwrites.
 */

const SubmitSchema = z.object({
  waistIn: z.coerce.number().min(15).max(80),
});

export type SubmitWaistResult = { ok: true } | { ok: false; error: string };

export async function submitWaistAction(
  input: z.infer<typeof SubmitSchema>,
): Promise<SubmitWaistResult> {
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
    return { ok: false, error: "Complete onboarding first." };
  }

  await submitWaist(user.id, parsed.data.waistIn);

  revalidatePath("/dashboard");
  revalidatePath("/profile");
  return { ok: true };
}
