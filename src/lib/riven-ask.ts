import { prisma } from "@/lib/prisma";
import {
  getAnthropicClient,
  isAnthropicConfigured,
  MEAL_LOGGING_MODEL,
  RIVEN_SYSTEM_PROMPT,
} from "@/lib/anthropic";
import { sumTodayMealMacros } from "@/lib/meal-pipeline";
import { getRollingWeeklyAverage } from "@/lib/daily-weigh-in";
import { resolveTodayCalorieTarget } from "@/lib/calorie-banking";

/**
 * Ask RIVEN — the two-way text brain. She types (or speaks) a question and
 * RIVEN answers from HER real numbers, in voice. This is the "coach in her
 * pocket" — cheap (a fraction of a cent per reply with the system prompt
 * cached), so it runs on every question, not gated.
 *
 * Scope guardrails live in the prompt: RIVEN answers about her plan, food,
 * weight, and habits using the data below — it does not give medical advice
 * and it always points back to the simple next action.
 */

export type AskTurn = { role: "user" | "assistant"; content: string };

export type AskResult =
  | { ok: true; answer: string }
  | { ok: false; error: string };

export async function answerForMember(
  userId: string,
  question: string,
  history: AskTurn[] = [],
): Promise<AskResult> {
  if (!isAnthropicConfigured) {
    return { ok: false, error: "RIVEN's brain isn't configured yet." };
  }

  const q = question.trim().slice(0, 500);
  if (!q) return { ok: false, error: "Ask me something." };

  // Gather HER context. Best-effort — a slow query degrades the data block,
  // never blocks the answer.
  const profile = await prisma.profile
    .findUnique({
      where: { userId },
      select: {
        name: true,
        cutCalories: true,
        proteinFloor: true,
        goalWeight: true,
        currentWeight: true,
        startWeight: true,
      },
    })
    .catch(() => null);
  if (!profile) return { ok: false, error: "Finish onboarding first." };

  const [today, weekly, banked] = await Promise.all([
    sumTodayMealMacros(userId).catch(() => ({ calories: 0, protein: 0, fat: 0, carbs: 0 })),
    getRollingWeeklyAverage(userId).catch(() => null),
    resolveTodayCalorieTarget(userId, { cutCalories: profile.cutCalories } as never).catch(
      () => ({ target: profile.cutCalories }),
    ),
  ]);

  const calTarget = banked?.target ?? profile.cutCalories;
  const calLeft = calTarget - today.calories;
  const proteinLeft = profile.proteinFloor - today.protein;

  const dataBlock = `HER DATA RIGHT NOW (use these exact numbers — never invent):
- Name: ${profile.name.split(/\s+/)[0]}
- Today's calories: ${today.calories} of ${calTarget} (${calLeft > 0 ? `${calLeft} left` : `${Math.abs(calLeft)} over`})
- Today's protein: ${today.protein}g of ${profile.proteinFloor}g floor (${proteinLeft > 0 ? `${proteinLeft}g to go` : "floor met"})
- 7-day average weight: ${weekly ? `${weekly.avg} lb (from ${weekly.count} weigh-ins)` : "not enough weigh-ins yet"}
- Goal weight: ${profile.goalWeight} lb · current: ${profile.currentWeight} lb · started: ${profile.startWeight} lb`;

  const system = `${RIVEN_SYSTEM_PROMPT}

You are answering a direct question from this member inside the app. Rules:
- Answer from HER DATA below. Quote her real numbers; never make numbers up.
- Two to four sentences, max. One concrete next action.
- Food/plan/weight/habits only. For anything medical (meds, pain, conditions, pregnancy) say that's a conversation for her doctor or Sean — don't advise.
- RIVEN's voice: direct, warm, calm. No therapy clichés, no "great question," no emoji.

${dataBlock}`;

  const messages = [
    ...history.slice(-6).map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: q },
  ];

  try {
    const client = getAnthropicClient();
    const resp = await client.messages.create({
      model: MEAL_LOGGING_MODEL, // Sonnet — same model the app already uses
      max_tokens: 400,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
    });
    const answer = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (!answer) return { ok: false, error: "Didn't catch that — ask me again." };
    return { ok: true, answer };
  } catch {
    return { ok: false, error: "RIVEN's tied up for a sec — try again." };
  }
}
