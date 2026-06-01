"use server";

import { revalidatePath } from "next/cache";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type SetBankingResult =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };

/**
 * Client-controlled "Smooth my week" toggle (calorie banking).
 *
 * Writes Profile.calorieBankingEnabled for the signed-in client only — scoped
 * by clerkId, so a leaked endpoint can never flip another account. When ON,
 * the resolver in src/lib/calorie-banking.ts rolls yesterday's leftover/overage
 * into today's target (clamped to cutCalories ± 600). The coach's daily average
 * (cutCalories) and the protein floor never move — this only smooths calories.
 */
export async function setMyCalorieBanking(
  enabled: boolean,
): Promise<SetBankingResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured
        ? "Please sign in and try again."
        : "Add real Clerk keys to .env.local.",
    };
  }

  try {
    // updateMany keyed on the relation so we never touch another client's row
    // and don't throw if the profile is somehow missing.
    const res = await prisma.profile.updateMany({
      where: { user: { clerkId: userId } },
      data: { calorieBankingEnabled: enabled },
    });
    if (res.count === 0) {
      return { ok: false, error: "Finish onboarding first." };
    }
  } catch {
    return { ok: false, error: "Couldn't save that just now. Try again." };
  }

  // Both surfaces read the resolved target; refresh them so the new number
  // shows up without a manual reload.
  revalidatePath("/dashboard");
  revalidatePath("/log");
  return { ok: true, enabled };
}
