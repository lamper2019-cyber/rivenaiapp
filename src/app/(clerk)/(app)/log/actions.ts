"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import { isAnthropicConfigured } from "@/lib/anthropic";
import {
  analyzeMeal,
  persistMealLog,
  type MealAnalysis,
} from "@/lib/meal-pipeline";
import { getTodayCalorieTarget } from "@/lib/calorie-schedule";

const MEAL_DESCRIPTION_MAX = 500;

export type LogMealResult =
  | {
      ok: true;
      analysis: MealAnalysis;
      totals: { calories: number; protein: number; fat: number; carbs: number };
      mealLogId: string;
    }
  | { ok: false; error: string };

const InputSchema = z.object({
  description: z
    .string()
    .min(1, "Describe what you ate")
    .max(MEAL_DESCRIPTION_MAX, `Keep it under ${MEAL_DESCRIPTION_MAX} characters`)
    .transform((s) => s.trim()),
});

export async function logMeal(formData: FormData): Promise<LogMealResult> {
  const parsed = InputSchema.safeParse({ description: formData.get("description") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { description } = parsed.data;

  if (!isAnthropicConfigured) {
    return {
      ok: false,
      error:
        "Add ANTHROPIC_API_KEY to .env.local. Get a key from console.anthropic.com → API Keys.",
    };
  }

  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured
        ? "Please sign in and try again."
        : "Add real Clerk keys to .env.local to log meals (the form renders here for design preview).",
    };
  }

  // Load profile (for targets) and today's totals.
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });
  } catch {
    return {
      ok: false,
      error: "Database not connected. Run `npx prisma migrate dev --name init` against Railway Postgres.",
    };
  }

  if (!user || !user.profile) {
    return {
      ok: false,
      error: "Complete onboarding before logging meals.",
    };
  }
  const profile = user.profile;

  const today = startOfCentralDay();
  const todayTotals = await prisma.dailyTotals.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  });

  const currentTotals = {
    calories: todayTotals?.totalCalories ?? 0,
    protein: todayTotals?.totalProtein ?? 0,
    fat: todayTotals?.totalFat ?? 0,
    carbs: todayTotals?.totalCarbs ?? 0,
  };

  // Analyze + persist via the shared pipeline (also used by the RIVEN AI
  // chat tool — both paths land in the same MealLog + DailyTotals state).
  let analysis: MealAnalysis;
  try {
    analysis = await analyzeMeal({
      profile: {
        name: profile.name,
        // Today's target — honors per-day calorie cycling when the
        // client has a schedule set; falls back to flat cutCalories.
        cutCalories: getTodayCalorieTarget(profile),
        proteinFloor: profile.proteinFloor,
      },
      todayTotals: currentTotals,
      description,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Claude API error: ${msg}` };
  }

  const { mealLogId, sums } = await persistMealLog({
    userId: user.id,
    description,
    analysis,
  });

  revalidatePath("/log");
  revalidatePath("/dashboard");

  return {
    ok: true,
    analysis,
    totals: sums,
    mealLogId,
  };
}

export type UndoLastMealResult =
  | {
      ok: true;
      undone: { id: string; description: string; calories: number; protein: number };
      totals: { calories: number; protein: number; fat: number; carbs: number };
    }
  | { ok: false; error: string };

/**
 * Delete the most recent meal log for the signed-in user and decrement
 * today's totals by exactly that meal's macros. Only undoes meals logged on
 * the current calendar day — yesterday's accidental meal won't accidentally
 * un-rewind today's scoreboard.
 */
export async function undoLastMeal(): Promise<UndoLastMealResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { clerkId: userId } });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Complete onboarding first." };

  const today = startOfCentralDay();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const lastMeal = await prisma.mealLog.findFirst({
    where: {
      userId: user.id,
      createdAt: { gte: today, lt: tomorrow },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      description: true,
      calories: true,
      protein: true,
      fat: true,
      carbs: true,
    },
  });

  if (!lastMeal) {
    return {
      ok: false,
      error: "No meal logged today to undo.",
    };
  }

  // Delete the meal, then recompute today's DailyTotals from the SUM of the
  // remaining meals — never blindly decrement. This is robust against the
  // TZ-fix migration drift (where some users had MealLogs counted in OLD
  // UTC-midnight DailyTotals buckets but the current row is at the new
  // Central-midnight key — decrementing would have driven the row negative).
  // Same pattern as logMeal: the DailyTotals row is always exactly the sum
  // of the matching MealLog rows.
  const updatedTotals = await prisma.$transaction(async (tx) => {
    await tx.mealLog.delete({ where: { id: lastMeal.id } });
    const remaining = await tx.mealLog.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: today, lt: tomorrow },
      },
      select: { calories: true, protein: true, fat: true, carbs: true },
    });
    const sums = remaining.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        fat: acc.fat + m.fat,
        carbs: acc.carbs + m.carbs,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 },
    );
    // The row should exist (we just deleted from it), but use upsert
    // defensively so a missing row doesn't 500. totalSteps preserved.
    await tx.dailyTotals.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: {
        totalCalories: sums.calories,
        totalProtein: sums.protein,
        totalFat: sums.fat,
        totalCarbs: sums.carbs,
      },
      create: {
        userId: user.id,
        date: today,
        totalCalories: sums.calories,
        totalProtein: sums.protein,
        totalFat: sums.fat,
        totalCarbs: sums.carbs,
      },
    });
    return sums;
  });

  revalidatePath("/log");
  revalidatePath("/dashboard");

  return {
    ok: true,
    undone: {
      id: lastMeal.id,
      description: lastMeal.description,
      calories: lastMeal.calories,
      protein: lastMeal.protein,
    },
    totals: updatedTotals,
  };
}

export type RecentMealItem = {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type RecentMealRow = {
  id: string;
  description: string;
  shortName: string | null;
  calories: number;
  protein: number;
  processedFlag: boolean;
  createdAt: Date;
  items: RecentMealItem[];
};

export async function getRecentMeals(limit = 8): Promise<RecentMealRow[]> {
  const { userId } = auth();
  if (!userId) return [];
  try {
    const user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) return [];
    const rows = await prisma.mealLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        description: true,
        shortName: true,
        calories: true,
        protein: true,
        processedFlag: true,
        createdAt: true,
        items: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      description: r.description,
      shortName: r.shortName,
      calories: r.calories,
      protein: r.protein,
      processedFlag: r.processedFlag,
      createdAt: r.createdAt,
      items: parseItemsJson(r.items),
    }));
  } catch {
    return [];
  }
}

/**
 * Defensive parser for the MealLog.items JSON column. Rejects anything
 * that doesn't look like a valid item array so a corrupt row never crashes
 * rendering — UI falls back to the combined shortName for legacy rows.
 */
function parseItemsJson(raw: unknown): RecentMealItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentMealItem[] = [];
  for (const x of raw) {
    if (
      x &&
      typeof x === "object" &&
      typeof (x as { name?: unknown }).name === "string" &&
      typeof (x as { calories?: unknown }).calories === "number"
    ) {
      const item = x as Record<string, unknown>;
      out.push({
        name: item.name as string,
        calories: item.calories as number,
        protein: typeof item.protein === "number" ? item.protein : 0,
        fat: typeof item.fat === "number" ? item.fat : 0,
        carbs: typeof item.carbs === "number" ? item.carbs : 0,
      });
    }
  }
  return out;
}

export type FrequentItemRow = {
  name: string;
  count: number;
  avgCalories: number;
};

/**
 * Top N most-logged individual food items over the last 30 days, aggregated
 * across all MealLog.items arrays. So if she logs "Big Mac, fries, chips"
 * and another day "Big Mac, salad", Big Mac surfaces as count=2, NOT as
 * two separate combo-shortName buckets.
 *
 * Drives the "Frequent" section on /log. One tap pre-fills the textarea
 * with just that item's name.
 */
export async function getFrequentMeals(limit = 5): Promise<FrequentItemRow[]> {
  const { userId } = auth();
  if (!userId) return [];
  try {
    const user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) return [];

    const since = new Date();
    since.setDate(since.getDate() - 30);

    // Pull every MealLog's items array over the window. Volume is small
    // (a couple hundred rows per client over 30d), aggregating in JS is fine.
    const rows = await prisma.mealLog.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
      select: { items: true },
    });

    const tally = new Map<string, { count: number; calorieSum: number }>();
    for (const row of rows) {
      for (const item of parseItemsJson(row.items)) {
        // Normalize on lower-case for grouping so casing variations don't
        // create separate buckets ("Big Mac" vs "big mac"). Display uses
        // the first-encountered casing.
        const key = item.name.trim().toLowerCase();
        if (!key) continue;
        const existing = tally.get(key);
        if (existing) {
          existing.count += 1;
          existing.calorieSum += item.calories;
        } else {
          tally.set(key, { count: 1, calorieSum: item.calories });
        }
      }
    }

    // Need a separate display-name map since the tally key is lower-cased.
    const displayName = new Map<string, string>();
    for (const row of rows) {
      for (const item of parseItemsJson(row.items)) {
        const key = item.name.trim().toLowerCase();
        if (key && !displayName.has(key)) {
          displayName.set(key, item.name.trim());
        }
      }
    }

    const ranked: FrequentItemRow[] = Array.from(tally.entries())
      .map(([key, v]) => ({
        name: displayName.get(key) ?? key,
        count: v.count,
        avgCalories: Math.round(v.calorieSum / v.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    return ranked;
  } catch {
    return [];
  }
}

export async function getTodayTotals() {
  const { userId } = auth();
  if (!userId) return null;
  try {
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: { profile: { select: { cutCalories: true, proteinFloor: true } } },
    });
    if (!user || !user.profile) return null;
    const today = startOfCentralDay();
    const totals = await prisma.dailyTotals.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    });
    return {
      cutCalories: user.profile.cutCalories,
      proteinFloor: user.profile.proteinFloor,
      caloriesToday: totals?.totalCalories ?? 0,
      proteinToday: totals?.totalProtein ?? 0,
    };
  } catch {
    return null;
  }
}

