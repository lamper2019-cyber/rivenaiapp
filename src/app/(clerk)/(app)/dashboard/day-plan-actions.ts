"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  lockDaySlot,
  swapDaySlot,
  eatDaySlot,
  rateYesterdayDinner,
} from "@/lib/day-plan";
import { getMeal } from "@/lib/meal-bank";

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

/**
 * EAT-IT-LOGS-IT: "I ate it" on a planned pick → real MealLog with the
 * bank's macros, through the same pipeline as voice logging. One tap.
 */
export async function ateDaySlotAction(
  input: z.infer<typeof SlotSchema>,
): Promise<DayPlanActionResult> {
  const parsed = SlotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid slot." };

  const who = await resolveDbUserId();
  if (!who.ok) return who;

  try {
    await eatDaySlot(who.userId, parsed.data.slot);
  } catch {
    return { ok: false, error: "Couldn't log that. Try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/log");
  return { ok: true };
}

const RateSchema = z.object({
  verdict: z.enum(["good", "heavy", "told"]),
});

/**
 * The "How'd it sit?" answer on the RIVEN moment. Records the rating (which
 * tunes her future picks) and dedups the moment for the day.
 */
export async function rateYesterdayDinnerAction(
  input: z.infer<typeof RateSchema>,
): Promise<DayPlanActionResult> {
  const parsed = RateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid answer." };

  const who = await resolveDbUserId();
  if (!who.ok) return who;

  try {
    await rateYesterdayDinner(who.userId, parsed.data.verdict);
  } catch {
    return { ok: false, error: "Couldn't save that. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

const VenueMealSchema = z.object({
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  mealId: z.string().min(1).max(80),
});

/**
 * Eating out: "That's what I got" — repoints the slot to the venue smart
 * order AND logs it in one move. Validates the meal is a real venue order
 * so the client can't log arbitrary ids.
 */
export async function ateVenueMealAction(
  input: z.infer<typeof VenueMealSchema>,
): Promise<DayPlanActionResult> {
  const parsed = VenueMealSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid order." };

  const meal = getMeal(parsed.data.mealId);
  if (!meal || !meal.venue) return { ok: false, error: "Unknown order." };

  const who = await resolveDbUserId();
  if (!who.ok) return who;

  try {
    await eatDaySlot(who.userId, parsed.data.slot, parsed.data.mealId);
  } catch {
    return { ok: false, error: "Couldn't log that. Try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/log");
  return { ok: true };
}
