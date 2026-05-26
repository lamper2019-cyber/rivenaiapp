import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import {
  getAnthropicClient,
  MEAL_LOGGING_MODEL,
  RIVEN_SYSTEM_PROMPT,
} from "@/lib/anthropic";

/**
 * Shared meal-analysis + persistence pipeline.
 *
 * Used by:
 *  - /log/actions.ts (the structured form submission)
 *  - /api/chat/stream (the log_meal tool — RIVEN AI logs meals from chat)
 *
 * Anything that wants to turn a free-text meal description into a saved
 * MealLog row + updated DailyTotals goes through here. One source of truth
 * for the Claude call, the schema, and the recompute transaction.
 */

const MealItemSchema = z.object({
  name: z.string().min(1).max(60),
  calories: z.number().int().min(0).max(3000),
  protein: z.number().int().min(0).max(200),
  fat: z.number().int().min(0).max(300),
  carbs: z.number().int().min(0).max(800),
});
export type MealItem = z.infer<typeof MealItemSchema>;

export const MealAnalysisSchema = z.object({
  calories: z.number().int().min(0).max(5000),
  protein: z.number().int().min(0).max(500),
  fat: z.number().int().min(0).max(500),
  carbs: z.number().int().min(0).max(2000),
  shortName: z.string().min(1).max(80),
  // Per-item breakdown — at least one item, max 12. Single-component meals
  // get a one-element array. Sum should ~match the top-level totals (Claude
  // is reminded in the prompt; small rounding drift is acceptable).
  items: z.array(MealItemSchema).min(1).max(12),
  processedFlag: z.boolean(),
  flagReason: z.string().max(400),
  coaching: z.string().min(1).max(1000),
});

export type MealAnalysis = z.infer<typeof MealAnalysisSchema>;

export type MealPipelineTotals = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

/**
 * Run a meal description through Claude with the established meal-logging
 * system prompt (35% buffer, trust-explicit-numbers, items breakdown,
 * processedFlag, two-sentence coaching). Returns the structured analysis
 * or throws if Claude returns an unparseable response.
 */
export async function analyzeMeal(args: {
  profile: { name: string; cutCalories: number; proteinFloor: number };
  todayTotals: MealPipelineTotals;
  description: string;
  /** Last ~30 days of this client's flagReason strings (most recent first).
   *  Passed to Claude so it doesn't reuse the same angle / fact / symptom
   *  combination two meals in a row. Optional — callers that don't have
   *  the data handy can omit. */
  recentFlagReasons?: string[];
}): Promise<MealAnalysis> {
  const userMessage = buildMealUserMessage(args);

  const client = getAnthropicClient();
  const response = await client.messages.parse({
    model: MEAL_LOGGING_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: RIVEN_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
    output_config: { format: zodOutputFormat(MealAnalysisSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude returned an unparseable meal analysis.");
  }
  return response.parsed_output;
}

/**
 * Persist a MealLog row + recompute the day's totals from MealLog source-of-
 * truth. Mirrors the transaction in /log/actions.ts so the chat log path and
 * the structured log path produce identical DB state.
 */
export async function persistMealLog(args: {
  userId: string;
  description: string;
  analysis: MealAnalysis;
}): Promise<{ mealLogId: string; sums: MealPipelineTotals }> {
  const { userId, description, analysis } = args;
  const today = startOfCentralDay();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return prisma.$transaction(async (tx) => {
    const created = await tx.mealLog.create({
      data: {
        userId,
        description,
        shortName: analysis.shortName,
        calories: analysis.calories,
        protein: analysis.protein,
        fat: analysis.fat,
        carbs: analysis.carbs,
        aiResponse: analysis.coaching,
        items: analysis.items,
        processedFlag: analysis.processedFlag,
        flagReason: analysis.flagReason || null,
      },
    });
    const todayMeals = await tx.mealLog.findMany({
      where: {
        userId,
        createdAt: { gte: today, lt: tomorrow },
      },
      select: { calories: true, protein: true, fat: true, carbs: true },
    });
    const sums = todayMeals.reduce<MealPipelineTotals>(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        fat: acc.fat + m.fat,
        carbs: acc.carbs + m.carbs,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 },
    );
    await tx.dailyTotals.upsert({
      where: { userId_date: { userId, date: today } },
      // Preserve totalSteps — steps are managed by a separate action.
      update: {
        totalCalories: sums.calories,
        totalProtein: sums.protein,
        totalFat: sums.fat,
        totalCarbs: sums.carbs,
      },
      create: {
        userId,
        date: today,
        totalCalories: sums.calories,
        totalProtein: sums.protein,
        totalFat: sums.fat,
        totalCarbs: sums.carbs,
      },
    });
    return { mealLogId: created.id, sums };
  });
}

function buildMealUserMessage(args: {
  profile: { name: string; cutCalories: number; proteinFloor: number };
  todayTotals: MealPipelineTotals;
  description: string;
  recentFlagReasons?: string[];
}): string {
  const { profile, todayTotals, description, recentFlagReasons } = args;
  const caloriesRemaining = profile.cutCalories - todayTotals.calories;
  const proteinRemaining = profile.proteinFloor - todayTotals.protein;

  // Pass up to the last 8 flagReasons so Claude has enough variety to
  // avoid — but not so much that the prompt balloons. Filter empties.
  const recentFlags = (recentFlagReasons ?? [])
    .filter((s) => s && s.trim().length > 0)
    .slice(0, 8);

  const recentFlagsBlock = recentFlags.length
    ? `\nRECENT FLAG REASONS (DO NOT REPEAT THESE — use a different fact and a different symptom):\n${recentFlags
        .map((r, i) => `${i + 1}. ${r}`)
        .join("\n")}\n`
    : "";

  return `CLIENT: ${profile.name}

DAILY TARGETS
- Calories (cut): ${profile.cutCalories}
- Protein floor: ${profile.proteinFloor}g

TODAY SO FAR
- Calories: ${todayTotals.calories} / ${profile.cutCalories} (${caloriesRemaining > 0 ? `${caloriesRemaining} remaining` : `${Math.abs(caloriesRemaining)} over`})
- Protein: ${todayTotals.protein}g / ${profile.proteinFloor}g (${proteinRemaining > 0 ? `${proteinRemaining}g still to hit floor` : `floor met`})
- Fat: ${todayTotals.fat}g
- Carbs: ${todayTotals.carbs}g
${recentFlagsBlock}
MEAL TO ANALYZE
${description}

Return the structured object per the system prompt.`;
}
