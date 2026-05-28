import { prisma } from "@/lib/prisma";
import type { Profile } from "@prisma/client";
import { startOfCentralDay } from "@/lib/dates";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import {
  CHAT_MODEL,
  CHAT_PERSONA_PROMPT,
  buildLiveContext,
  type ChatContextMeal,
  type ChatContextCheckIn,
} from "@/lib/chat-prompt";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Auto-reply scheduler for the unified "Sean" thread.
 *
 * When a client sends Sean a message, we don't reply instantly — that
 * gives away that an AI is on the other side. Instead we queue a reply
 * via PendingAiReply with a randomized scheduledFor in the ~90-130
 * second range — every reply lands within ~2 minutes, with small jitter
 * so two consecutive replies don't have the same gap.
 *
 * Distribution (Sean's tightened spec):
 *   - All replies: 90s - 130s (1.5 - 2.2 min)
 *   - Skewed slightly toward the back of the window (~110s mean)
 *
 * The "Sean's reading..." indicator on the client doesn't appear
 * immediately when she sends — it shows up ~60 seconds in, then holds
 * until the reply lands. So her experience is: send → quiet for ~60s
 * → "Sean's reading" → ~60s later → his reply.
 *
 * The cron at /api/cron/process-ai-replies fires every minute, picks
 * due rows, generates the reply via Claude, inserts it as a COACH
 * ChatMessage with aiGenerated=true. Clients see "from Sean" — the
 * aiGenerated flag is invisible to them; only the coach dashboard
 * surfaces it.
 */

const HISTORY_LIMIT = 20;
const RECENT_MEAL_HOURS = 36;
const STREAK_WINDOW_DAYS = 14;

/** Pick a randomized delay in milliseconds matching Sean's spec.
 *  Every reply lands within ~2 minutes (90-130s window). The skew is
 *  toward the back half of the window so most replies feel like ~2 min
 *  rather than near-instant. */
export function pickAiReplyDelayMs(): number {
  // Bias the random toward the back of the range: r ** 0.6 pulls the
  // mean upward without making it deterministic.
  const r = 1 - Math.pow(1 - Math.random(), 0.6);
  // 90s - 130s window
  return 90_000 + r * 40_000;
}

/**
 * Queue an AI auto-reply on the unified thread. Called from the
 * sendToSean server action right after persisting the client's USER
 * message. Idempotent: if another pending reply already exists for
 * this user, we leave the earlier one alone — the cron picks them up
 * in order and the AI sees the full conversation either way.
 *
 * Returns the inserted row's id (useful for debugging / coach UI).
 */
export async function scheduleAiReply(opts: {
  userId: string;
  triggerMessageId: string;
}): Promise<{ id: string; scheduledFor: Date }> {
  const delayMs = pickAiReplyDelayMs();
  const scheduledFor = new Date(Date.now() + delayMs);
  const row = await prisma.pendingAiReply.create({
    data: {
      userId: opts.userId,
      triggerMessageId: opts.triggerMessageId,
      scheduledFor,
      status: "pending",
    },
    select: { id: true, scheduledFor: true },
  });
  return row;
}

/**
 * Process one due AI reply: generate the Sean-voice response via
 * Claude using the same live-context prompt the /chat stream uses,
 * insert it as a COACH ChatMessage with aiGenerated=true, mark the
 * pending row sent.
 *
 * Called by the cron route. Wrapped in try/catch so one bad reply
 * doesn't block the next one in the queue. On failure the row is
 * marked status="failed" with the error message captured.
 */
export async function processPendingReply(pendingId: string): Promise<{
  ok: true;
  messageId: string;
} | { ok: false; error: string }> {
  if (!isAnthropicConfigured) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not set." };
  }

  const pending = await prisma.pendingAiReply.findUnique({
    where: { id: pendingId },
    select: { id: true, userId: true, status: true },
  });
  if (!pending) return { ok: false, error: "Pending row not found." };
  if (pending.status !== "pending") {
    return { ok: false, error: `Already ${pending.status}.` };
  }

  // Atomic claim: flip to "processing" so a parallel cron tick doesn't
  // double-fire the same reply. We use updateMany with a WHERE on the
  // current status so the claim only succeeds if it's still pending.
  const claim = await prisma.pendingAiReply.updateMany({
    where: { id: pendingId, status: "pending" },
    data: { status: "processing" },
  });
  if (claim.count === 0) {
    return { ok: false, error: "Already claimed by another worker." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: pending.userId },
      include: { profile: true },
    });
    if (!user || !user.profile) {
      throw new Error("User profile missing.");
    }
    const profile = user.profile;

    // Build the same live context the /chat stream uses, so the AI
    // sees today's totals, recent meals (with flag reasons), latest
    // check-in, and streak.
    const today = startOfCentralDay();
    const recentMealCutoff = new Date(
      Date.now() - RECENT_MEAL_HOURS * 60 * 60 * 1000,
    );
    const [
      todayTotalsRow,
      recentMealRows,
      latestCheckInRow,
      streakMealRows,
    ] = await Promise.all([
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
            gte: new Date(Date.now() - STREAK_WINDOW_DAYS * 86_400_000),
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
    const streakDays = computeStreakEndingYesterday(
      streakMealRows.map((r) => r.createdAt),
    );
    const liveContext = buildLiveContext({
      profile,
      todayTotals,
      recentMeals,
      latestCheckIn,
      streakDays,
    });

    // Pull recent unified-thread history. Everything on the Sean thread
    // is kind=COACH; the role column carries the directional info
    // (USER = her side, ASSISTANT = Sean side). Auto-replies and real
    // Sean replies both come through with role=ASSISTANT — fine for
    // the API because both look like "Sean talking" to the model.
    const historyDesc = await prisma.chatMessage.findMany({
      where: { userId: user.id, kind: "COACH" },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { role: true, content: true, imageUrls: true },
    });
    const history = historyDesc.reverse();
    const apiMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role === "USER" ? "user" : "assistant",
      content: buildMessageContent(m.content, m.imageUrls),
    }));
    if (apiMessages.length === 0) {
      // Defensive: cron shouldn't fire with no history, but if it does
      // just bail without an empty Claude call.
      throw new Error("No history for this user.");
    }

    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
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
    });

    const text = response.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      )
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) throw new Error("Empty response from Claude.");

    // Insert as a COACH-kind ChatMessage with aiGenerated=true. Looks
    // like real Sean to the client; the aiGenerated flag only the coach
    // dashboard reads.
    const created = await prisma.chatMessage.create({
      data: {
        userId: user.id,
        role: "ASSISTANT",
        kind: "COACH",
        content: text,
        aiGenerated: true,
      },
      select: { id: true },
    });

    await prisma.pendingAiReply.update({
      where: { id: pendingId },
      data: { status: "sent", sentAt: new Date() },
    });

    return { ok: true, messageId: created.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await prisma.pendingAiReply.update({
      where: { id: pendingId },
      data: { status: "failed", errorMessage: msg, sentAt: new Date() },
    });
    return { ok: false, error: msg };
  }
}

function buildMessageContent(
  text: string,
  imageUrls: string[],
): Anthropic.MessageParam["content"] {
  if (imageUrls.length === 0) return text;
  return [
    ...imageUrls.map<Anthropic.ImageBlockParam>((url) => ({
      type: "image",
      source: { type: "url", url },
    })),
    { type: "text", text },
  ];
}

/** Count consecutive central-time days of meal logs ending yesterday. */
function computeStreakEndingYesterday(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const days = new Set<string>();
  for (const d of dates) days.add(centralDayKey(d));
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (let i = 0; i < STREAK_WINDOW_DAYS; i++) {
    const k = centralDayKey(cursor);
    if (!days.has(k)) break;
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

// Profile imported to satisfy buildLiveContext signature.
export type { Profile };
