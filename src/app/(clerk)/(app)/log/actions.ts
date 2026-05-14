"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import {
  getAnthropicClient,
  isAnthropicConfigured,
  MEAL_LOGGING_MODEL,
  RIVEN_SYSTEM_PROMPT,
} from "@/lib/anthropic";

const MEAL_DESCRIPTION_MAX = 500;

const MealAnalysisSchema = z.object({
  calories: z.number().int().min(0).max(5000),
  protein: z.number().int().min(0).max(500),
  fat: z.number().int().min(0).max(500),
  carbs: z.number().int().min(0).max(2000),
  shortName: z.string().min(1).max(80),
  processedFlag: z.boolean(),
  flagReason: z.string().max(400),
  coaching: z.string().min(1).max(1000),
});

export type MealAnalysis = z.infer<typeof MealAnalysisSchema>;

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

  const userMessage = buildUserMessage({
    profile: {
      name: profile.name,
      cutCalories: profile.cutCalories,
      proteinFloor: profile.proteinFloor,
    },
    todayTotals: currentTotals,
    description,
  });

  // Call Claude with structured output. messages.parse() validates against the
  // Zod schema and returns parsed_output as a typed object.
  let analysis: MealAnalysis;
  try {
    const client = getAnthropicClient();
    const response = await client.messages.parse({
      model: MEAL_LOGGING_MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: RIVEN_SYSTEM_PROMPT,
          // Cacheable on prompts ≥ 2048 tokens (Sonnet 4.6 threshold). Below that
          // it silently no-ops, which is fine — no cost penalty.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
      // Anthropic deprecated the top-level `output_format` parameter — must use
      // `output_config.format` with the Zod helper now.
      output_config: { format: zodOutputFormat(MealAnalysisSchema) },
    });
    if (!response.parsed_output) {
      return {
        ok: false,
        error: "Claude returned an unparseable response. Try rephrasing your meal description.",
      };
    }
    analysis = response.parsed_output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Claude API error: ${msg}` };
  }

  // Date range for "today" in Central time — used to scope the sum-recompute
  // below. Same bounds the undo flow uses, so writes and reads always agree.
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Use an interactive transaction so we can: (1) create the meal log,
  // (2) re-sum ALL of today's meal logs (including the one just created),
  // (3) upsert DailyTotals with that authoritative sum. This is more robust
  // than increment/decrement math — past bugs (e.g. the recent TZ-fix
  // migration that left some users with mis-bucketed DailyTotals rows)
  // self-heal on the next log/undo because we're always recomputing from
  // source-of-truth MealLog rows, never blindly adding deltas to a row
  // that may already be drifted.
  const txResult = await prisma.$transaction(async (tx) => {
    const created = await tx.mealLog.create({
      data: {
        userId: user.id,
        description,
        shortName: analysis.shortName,
        calories: analysis.calories,
        protein: analysis.protein,
        fat: analysis.fat,
        carbs: analysis.carbs,
        aiResponse: analysis.coaching,
        processedFlag: analysis.processedFlag,
        flagReason: analysis.flagReason || null,
      },
    });
    const todayMeals = await tx.mealLog.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: today, lt: tomorrow },
      },
      select: { calories: true, protein: true, fat: true, carbs: true },
    });
    const sums = todayMeals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        fat: acc.fat + m.fat,
        carbs: acc.carbs + m.carbs,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 },
    );
    await tx.dailyTotals.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      // Preserve totalSteps when overwriting macro totals. Steps are managed
      // by a separate action and aren't part of this recompute.
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
    return { mealLog: created, sums };
  });

  revalidatePath("/log");
  revalidatePath("/dashboard");

  return {
    ok: true,
    analysis,
    totals: txResult.sums,
    mealLogId: txResult.mealLog.id,
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

export type RecentMealRow = {
  id: string;
  description: string;
  shortName: string | null;
  calories: number;
  protein: number;
  processedFlag: boolean;
  createdAt: Date;
};

export async function getRecentMeals(limit = 8): Promise<RecentMealRow[]> {
  const { userId } = auth();
  if (!userId) return [];
  try {
    const user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) return [];
    return await prisma.mealLog.findMany({
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
      },
    });
  } catch {
    return [];
  }
}

export type FrequentMealRow = {
  shortName: string;
  count: number;
  // The most recent matching log's id — used so a one-tap "log this again"
  // can pre-fill the textarea with the prior description without having to
  // round-trip another query.
  lastDescription: string;
  avgCalories: number;
  processedFlag: boolean;
};

/**
 * Top N most-logged meals over the last 30 days, grouped by shortName.
 * Drives the "Frequent" section on /log. Skips rows with null shortName
 * (legacy data) so the section only ever shows clean labels.
 */
export async function getFrequentMeals(limit = 5): Promise<FrequentMealRow[]> {
  const { userId } = auth();
  if (!userId) return [];
  try {
    const user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) return [];

    const since = new Date();
    since.setDate(since.getDate() - 30);

    // Group by shortName, count occurrences, average calories.
    const grouped = await prisma.mealLog.groupBy({
      by: ["shortName"],
      where: {
        userId: user.id,
        createdAt: { gte: since },
        shortName: { not: null },
      },
      _count: { _all: true },
      _avg: { calories: true },
      orderBy: { _count: { shortName: "desc" } },
      take: limit,
    });

    // For each group, look up the most recent description + processedFlag.
    const rows = await Promise.all(
      grouped.map(async (g) => {
        const latest = await prisma.mealLog.findFirst({
          where: {
            userId: user.id,
            shortName: g.shortName,
            createdAt: { gte: since },
          },
          orderBy: { createdAt: "desc" },
          select: { description: true, processedFlag: true },
        });
        return {
          shortName: g.shortName ?? "",
          count: g._count._all,
          lastDescription: latest?.description ?? "",
          avgCalories: Math.round(g._avg.calories ?? 0),
          processedFlag: latest?.processedFlag ?? false,
        };
      }),
    );
    return rows.filter((r) => r.shortName.length > 0);
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

function buildUserMessage(args: {
  profile: { name: string; cutCalories: number; proteinFloor: number };
  todayTotals: { calories: number; protein: number; fat: number; carbs: number };
  description: string;
}): string {
  const { profile, todayTotals, description } = args;
  const caloriesRemaining = profile.cutCalories - todayTotals.calories;
  const proteinRemaining = profile.proteinFloor - todayTotals.protein;

  return `CLIENT: ${profile.name}

DAILY TARGETS
- Calories (cut): ${profile.cutCalories}
- Protein floor: ${profile.proteinFloor}g

TODAY SO FAR
- Calories: ${todayTotals.calories} / ${profile.cutCalories} (${caloriesRemaining > 0 ? `${caloriesRemaining} remaining` : `${Math.abs(caloriesRemaining)} over`})
- Protein: ${todayTotals.protein}g / ${profile.proteinFloor}g (${proteinRemaining > 0 ? `${proteinRemaining}g still to hit floor` : `floor met`})
- Fat: ${todayTotals.fat}g
- Carbs: ${todayTotals.carbs}g

MEAL TO ANALYZE
"${description}"`;
}

