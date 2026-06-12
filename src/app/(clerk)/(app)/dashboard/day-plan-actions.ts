"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lockDaySlot, swapDaySlot } from "@/lib/day-plan";

/**
 * Server actions for the day-plan card on /dashboard — "Lock it in" and
 * "Swap" on a planned meal slot. Both end in revalidatePath so the card
 * re-renders with the plan's new state (and a swap re-runs the rebalance).
 */

const SlotSchema = z.object({
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
});

export type DayPlanActionResult = { ok: true } | { ok: false; error: string };

async function resolveDbUserId(): Promise<
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
      select: { id: true },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Account not found." };
  return { ok: true, userId: user.id };
}

export async function lockDaySlotAction(
  input: z.infer<typeof SlotSchema>,
): Promise<DayPlanActionResult> {
  const parsed = SlotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid slot." };

  const who = await resolveDbUserId();
  if (!who.ok) return who;

  try {
    await lockDaySlot(who.userId, parsed.data.slot);
  } catch {
    return { ok: false, error: "Couldn't lock that in. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function swapDaySlotAction(
  input: z.infer<typeof SlotSchema>,
): Promise<DayPlanActionResult> {
  const parsed = SlotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid slot." };

  const who = await resolveDbUserId();
  if (!who.ok) return who;

  try {
    await swapDaySlot(who.userId, parsed.data.slot);
  } catch {
    return { ok: false, error: "Couldn't swap that. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
