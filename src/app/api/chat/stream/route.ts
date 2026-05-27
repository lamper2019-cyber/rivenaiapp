import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import {
  CHAT_MODEL,
  CHAT_PERSONA_PROMPT,
  buildLiveContext,
  type ChatContextMeal,
  type ChatContextCheckIn,
} from "@/lib/chat-prompt";
import { analyzeMeal, persistMealLog } from "@/lib/meal-pipeline";
import { getTodayCalorieTarget } from "@/lib/calorie-schedule";
import type { ChatRole } from "@prisma/client";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  message: z
    .string()
    .min(1, "Message is required")
    .max(2000, "Keep messages under 2000 characters")
    .transform((s) => s.trim()),
  imageUrls: z
    .array(z.string().url())
    .max(4, "At most 4 images per message")
    .optional()
    .default([]),
});

const HISTORY_LIMIT = 20;
const RECENT_MEAL_HOURS = 36;
const STREAK_WINDOW_DAYS = 14;
const TOOL_LOOP_MAX_ITERATIONS = 4;

const LOG_MEAL_TOOL: Anthropic.Tool = {
  name: "log_meal",
  description:
    "Save a meal log to the client's RIVEN account. Call this when she tells you she ate something — anything from a one-line mention to a detailed description with stated calorie counts. The downstream pipeline applies the +35% overestimation buffer (or honors her explicit numbers when she gave them) and persists a MealLog row plus updates today's totals. After the tool returns, weave the macros into your Sean-voice reply; do NOT estimate macros yourself.",
  input_schema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description:
          "Full natural-language description of what she ate, preserving any stated calorie counts she mentioned (e.g. 'chicken caesar salad, she said about 400 cal'). The meal-analysis prompt downstream handles brand recognition, portion estimation, and the trust-explicit-numbers rule.",
      },
    },
    required: ["description"],
  },
};

export async function POST(req: Request) {
  if (!isAnthropicConfigured) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set in .env.local." },
      { status: 503 },
    );
  }

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json(
      {
        error: isClerkConfigured
          ? "Not signed in."
          : "Add real Clerk keys to .env.local to chat with RIVEN.",
      },
      { status: 401 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { message, imageUrls } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { profile: true },
  });
  if (!user || !user.profile) {
    return NextResponse.json(
      { error: "Complete onboarding before chatting with RIVEN." },
      { status: 412 },
    );
  }
  // Local non-null reference so the streaming closure below doesn't lose
  // the narrowing TypeScript got from the guard above.
  const profile = user.profile;

  // Pull recent history (oldest → newest order for the API).
  const historyDesc = await prisma.chatMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { role: true, content: true, imageUrls: true },
  });
  const history = historyDesc.reverse();

  // ── Live context: today's totals, recent meals, latest check-in, streak ──
  // Rebuilt every chat turn so RIVEN AI reads from the freshest data, not a
  // stale snapshot baked into earlier history.

  const today = startOfCentralDay();

  const recentMealCutoff = new Date(
    Date.now() - RECENT_MEAL_HOURS * 60 * 60 * 1000,
  );

  const [todayTotalsRow, recentMealRows, latestCheckInRow, streakMealRows] =
    await Promise.all([
      prisma.dailyTotals.findUnique({
        where: { userId_date: { userId: user.id, date: today } },
      }),
      prisma.mealLog.findMany({
        where: { userId: user.id, createdAt: { gte: recentMealCutoff } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          shortName: true,
          description: true,
          calories: true,
          protein: true,
          processedFlag: true,
          // flagReason joins the context so the AI knows WHY a meal was
          // flagged — lets it call out specifics ("the burger pushed you
          // over because of the bun and the sweet tea") instead of just
          // generic "this was flagged."
          flagReason: true,
          createdAt: true,
        },
      }),
      prisma.weeklyCheckIn.findFirst({
        where: { userId: user.id },
        orderBy: { weekStart: "desc" },
        select: { weekStart: true, weight: true, waist: true },
      }),
      prisma.mealLog.findMany({
        where: {
          userId: user.id,
          createdAt: {
            gte: new Date(
              Date.now() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
            ),
          },
        },
        select: { createdAt: true },
      }),
    ]);

  const todayTotals = todayTotalsRow
    ? {
        calories: todayTotalsRow.totalCalories,
        protein: todayTotalsRow.totalProtein,
      }
    : null;

  const recentMeals: ChatContextMeal[] = recentMealRows.map((m) => ({
    shortName: m.shortName,
    description: m.description,
    calories: m.calories,
    protein: m.protein,
    processedFlag: m.processedFlag,
    // DB column is nullable on legacy rows logged before flagReason was
    // mandatory; normalize to empty string so the context formatter
    // doesn't have to think about null.
    flagReason: m.flagReason ?? "",
    createdAt: m.createdAt,
  }));

  const latestCheckIn: ChatContextCheckIn | null = latestCheckInRow
    ? {
        weekStart: latestCheckInRow.weekStart,
        weight: latestCheckInRow.weight,
        waist: latestCheckInRow.waist,
      }
    : null;

  const streakDays = computeStreakEndingYesterday(streakMealRows.map((r) => r.createdAt));

  const liveContext = buildLiveContext({
    profile,
    todayTotals,
    recentMeals,
    latestCheckIn,
    streakDays,
  });

  // Save the user's message before kicking off the model call so it persists
  // even if streaming fails midway.
  await prisma.chatMessage.create({
    data: {
      userId: user.id,
      role: "USER",
      content: message,
      imageUrls,
    },
  });

  const anthropic = getAnthropicClient();

  // Mutable conversation that the tool-use loop appends to each round.
  const apiMessages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: roleForApi(m.role),
      content: buildMessageContent(m.content, m.imageUrls),
    })),
    {
      role: "user" as const,
      content: buildMessageContent(message, imageUrls),
    },
  ];

  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      let clientGone = false;
      const safeEnqueue = (chunk: string) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          clientGone = true;
        }
      };

      try {
        // Tool-use loop. Each iteration streams Claude's text deltas as they
        // come and, if the turn ends in tool_use, runs the tool, appends the
        // result, and loops. Capped at TOOL_LOOP_MAX_ITERATIONS to prevent
        // runaway models. Most turns end after iteration 0 (no tool needed)
        // or iteration 1 (one log_meal call → final reply).
        for (let iter = 0; iter < TOOL_LOOP_MAX_ITERATIONS; iter++) {
          const stream = anthropic.messages.stream({
            model: CHAT_MODEL,
            // Bumped from 1024 → 1600. "How am I doing this week?" /
            // "look at my meals and tell me what to improve" responses
            // were running out of room mid-stream because they have to
            // reference 5 recent meals AND give a Sean-voice take. 1600
            // gives breathing room; rarely-needed bigger answers can
            // still finish in a follow-up iteration.
            max_tokens: 1600,
            system: [
              { type: "text", text: CHAT_PERSONA_PROMPT },
              {
                type: "text",
                text: liveContext,
                cache_control: { type: "ephemeral" },
              },
            ],
            messages: apiMessages,
            tools: [LOG_MEAL_TOOL],
          });

          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullText += event.delta.text;
              safeEnqueue(event.delta.text);
            }
          }

          const final = await stream.finalMessage();

          if (final.stop_reason !== "tool_use") {
            break;
          }

          // Run every tool_use block in this turn; build a single user
          // message containing the parallel tool_results.
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            try {
              const result = await runChatTool({
                name: block.name,
                input: block.input,
                userId: user.id,
                profile,
                todayTotals,
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(result),
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Unknown error";
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify({ error: msg }),
                is_error: true,
              });
            }
          }

          // Append the assistant turn (with the tool_use blocks) and the
          // tool_result follow-up so the next iteration can continue.
          apiMessages.push({ role: "assistant", content: final.content });
          apiMessages.push({ role: "user", content: toolResults });
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unexpected error from Claude.";
        safeEnqueue(`\n\n[error] ${msg}`);
      } finally {
        if (fullText.trim().length > 0) {
          try {
            await prisma.chatMessage.create({
              data: {
                userId: user.id,
                role: "ASSISTANT",
                content: fullText,
              },
            });
          } catch {
            /* don't crash the stream if the DB write fails */
          }
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      /* Anthropic stream will be GC'd; nothing to do. */
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

// ─────────────────────────── helpers ───────────────────────────

function roleForApi(role: ChatRole): "user" | "assistant" {
  return role === "USER" ? "user" : "assistant";
}

function buildMessageContent(
  text: string,
  imageUrls: string[],
): string | Anthropic.MessageParam["content"] {
  if (imageUrls.length === 0) return text;
  // Image blocks come first so Claude sees the visual context before the question.
  const blocks: Anthropic.ImageBlockParam[] = imageUrls.map((url) => ({
    type: "image",
    source: { type: "url", url },
  }));
  return [...blocks, { type: "text", text }];
}

/** Tool dispatcher — only log_meal today; add more cases as they ship. */
async function runChatTool(args: {
  name: string;
  input: unknown;
  userId: string;
  profile: {
    name: string;
    cutCalories: number;
    proteinFloor: number;
    dailyCalorieSchedule: unknown;
  };
  todayTotals: { calories: number; protein: number } | null;
}) {
  if (args.name !== "log_meal") {
    throw new Error(`Unknown tool: ${args.name}`);
  }
  const parsed = z
    .object({ description: z.string().min(1).max(500) })
    .safeParse(args.input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid log_meal arguments",
    );
  }
  const description = parsed.data.description.trim();

  // Hydrate the macro buckets the meal analyzer expects. Fat/carbs aren't
  // tracked in the lighter chat context but the analyzer mostly uses cal +
  // protein for "remaining" framing — zeros are safe for the others.
  const todayBuckets = {
    calories: args.todayTotals?.calories ?? 0,
    protein: args.todayTotals?.protein ?? 0,
    fat: 0,
    carbs: 0,
  };

  // Last 30 days of flagReasons so Claude rotates the angle in the
  // FLAG KNOWLEDGE BANK instead of repeating the same sentence twice.
  const recentFlagged = await prisma.mealLog.findMany({
    where: {
      userId: args.userId,
      processedFlag: true,
      flagReason: { not: null },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { flagReason: true },
  });
  const recentFlagReasons = recentFlagged
    .map((r) => r.flagReason)
    .filter((s): s is string => !!s);

  const analysis = await analyzeMeal({
    profile: {
      name: args.profile.name,
      // Honors per-day calorie cycling when set; flat cutCalories otherwise.
      cutCalories: getTodayCalorieTarget(args.profile),
      proteinFloor: args.profile.proteinFloor,
    },
    todayTotals: todayBuckets,
    description,
    recentFlagReasons,
  });

  const { mealLogId, sums } = await persistMealLog({
    userId: args.userId,
    description,
    analysis,
  });

  // Returned to Claude as the tool_result. The model uses these fields to
  // write its Sean-voice reply ("logged X cal, that puts you at Y of Z").
  return {
    saved: true,
    mealLogId,
    macros: {
      calories: analysis.calories,
      protein: analysis.protein,
      fat: analysis.fat,
      carbs: analysis.carbs,
    },
    shortName: analysis.shortName,
    items: analysis.items,
    processedFlag: analysis.processedFlag,
    flagReason: analysis.flagReason || null,
    coaching: analysis.coaching,
    todayAfter: sums,
  };
}

/**
 * Count consecutive Central-time days, ending YESTERDAY, with at least one
 * meal log. Mirrors the helper in src/lib/sean-messages.ts but takes a
 * prefetched list of timestamps (the chat route already pulled them for
 * the streak portion of the context).
 */
function computeStreakEndingYesterday(timestamps: Date[]): number {
  if (timestamps.length === 0) return 0;
  const daysLogged = new Set<string>();
  for (const ts of timestamps) {
    daysLogged.add(centralDayKey(ts));
  }
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
    if (!daysLogged.has(centralDayKey(cursor))) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function centralDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
