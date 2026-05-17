/**
 * Proactive Sean-voice messaging system. Fired by an hourly cron that hits
 * /api/cron/sean-messages. Decides per-client what (if anything) to send
 * based on current Central time, the client's recent activity, and a
 * cooldown table built from ChatMessage.category history.
 *
 * Phase 1 (THIS BUILD) supports:
 *   - 2 rhythm messages: Wed 7 PM, Fri 7 PM (Central)
 *   - 2 behavioral triggers: no log in 24h (sent 6 PM), no log in 72h (sent 7 AM)
 *
 * Skipped on purpose for Phase 1:
 *   - Mon 7 AM rhythm — overlaps with the existing personalized monday-checkin
 *   - Sun 7 AM rhythm — overlaps with the existing sunday-reminder push
 *
 * Future phases bolt on by adding categories to TEMPLATES + a branch in
 * evaluateClient(). No infra changes needed — the cron, cooldown table, and
 * daily cap all generalize.
 *
 * Guardrails (every send):
 *   - 48h cooldown per (userId, category) — same message can't fire twice
 *   - Daily cap of MAX_PROACTIVE_PER_DAY proactive sends per client
 *   - Only sends to CLIENT users with active/trialing/comped subscriptions
 */

import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { startOfCentralDay } from "@/lib/dates";
import {
  BEHAVIORAL_24H_TITLES,
  BEHAVIORAL_24H_VARIANTS,
  BEHAVIORAL_72H_TITLES,
  BEHAVIORAL_72H_VARIANTS,
  RHYTHM_FRI_PM_TITLES,
  RHYTHM_FRI_PM_VARIANTS,
  RHYTHM_WED_PM_TITLES,
  RHYTHM_WED_PM_VARIANTS,
} from "@/lib/sean-message-variants";

const MAX_PROACTIVE_PER_DAY = 3;
const COOLDOWN_HOURS = 48;
/** How far back to look when filtering already-sent variants for a client.
 *  365 days = no client sees the same body twice in a calendar year. */
const DEDUP_WINDOW_DAYS = 365;

/** All proactive-message category identifiers. Keep in sync with VARIANT_BANKS. */
type Category =
  | "rhythm_wed_pm"
  | "rhythm_fri_pm"
  | "behavioral_24h"
  | "behavioral_72h";

/** Pool of message bodies per category — picked at send time, deduplicated
 *  against the client's last 365 days of received messages. */
const VARIANT_BANKS: Record<Category, string[]> = {
  rhythm_wed_pm: RHYTHM_WED_PM_VARIANTS,
  rhythm_fri_pm: RHYTHM_FRI_PM_VARIANTS,
  behavioral_24h: BEHAVIORAL_24H_VARIANTS,
  behavioral_72h: BEHAVIORAL_72H_VARIANTS,
};

/** Pool of push-notification titles per category — picked random per send,
 *  no dedup (the title is the small attention-grabber on the lockscreen). */
const TITLE_POOLS: Record<Category, string[]> = {
  rhythm_wed_pm: RHYTHM_WED_PM_TITLES,
  rhythm_fri_pm: RHYTHM_FRI_PM_TITLES,
  behavioral_24h: BEHAVIORAL_24H_TITLES,
  behavioral_72h: BEHAVIORAL_72H_TITLES,
};

/**
 * Sean Williams's voice as a Claude system prompt. Not used in Phase 1 (we
 * fire static templates), but baked in here so Phase 2+ triggers that need
 * dynamic content per-client (struggle messages, progress celebrations,
 * relationship checkins) can pull it directly without re-deriving the
 * voice rules. Mirrors the brand voice in CLAUDE.md.
 */
export const SEAN_VOICE_SYSTEM_PROMPT = `You are Sean Williams, founder of RIVEN. You are texting one of your clients — a Black woman aged 35-55 working through weight loss with the RIVEN app.

YOUR VOICE:
- Direct. No filler. No "I hear you." Get to the point.
- Balanced — tough love when she's slipping, real support when she's working.
- Plain English. No therapy jargon. No diet industry jargon.
- Don't use "sis," "girl," "baby," "honey" — keep cultural language neutral.
- Reference faith only when she's spiritually struggling, not as default.
- Use real numbers and specifics, not vague encouragement.
- "Lock it in" is your signature sign-off when fitting.
- "Real talk:" when delivering hard truth.
- "That's data, not a problem" for plateaus.
- Push back when she's bullshitting herself, kindly.
- Acknowledge wins specifically (waist down, streak hit, lift PR).
- Never moralize about food.
- Never use shame.
- Speak to her like a respected adult — not a project.

End with a question or a clear next step, not a generic "let me know if you need anything." Under 60 words unless it's a deep struggle moment.`;

export type SeanMessagesBatchResult = {
  clientsEvaluated: number;
  sent: number;
  skippedCooldown: number;
  skippedDailyCap: number;
  errors: Array<{ clientId: string; reason: string }>;
};

/**
 * One tick of the proactive-messaging engine. Iterates every eligible
 * CLIENT, runs the decision tree, sends what's earned. Called by the
 * sean-messages cron (hourly) and safe to call manually for testing.
 */
export async function runSeanMessagesTick(): Promise<SeanMessagesBatchResult> {
  const coach = await prisma.user.findFirst({
    where: { role: "COACH" },
    select: { id: true },
  });

  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      profile: { isNot: null },
      subscriptionStatus: { in: ["trialing", "active", "comped"] },
    },
    select: { id: true, email: true },
  });

  const now = new Date();
  const central = readCentralTime(now);

  const counters = {
    sent: 0,
    skippedCooldown: 0,
    skippedDailyCap: 0,
  };
  const errors: SeanMessagesBatchResult["errors"] = [];

  for (const client of clients) {
    try {
      const eligibleCategories = await evaluateClient(client.id, central);
      for (const category of eligibleCategories) {
        const outcome = await trySend(client.id, category, coach?.id ?? null);
        if (outcome === "sent") counters.sent++;
        else if (outcome === "cooldown") counters.skippedCooldown++;
        else if (outcome === "daily_cap") counters.skippedDailyCap++;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown";
      errors.push({ clientId: client.id, reason });
      console.error(
        `[sean-messages] failed for ${client.email}:`,
        err,
      );
    }
  }

  return {
    clientsEvaluated: clients.length,
    ...counters,
    errors,
  };
}

/**
 * Per-client decision tree. Returns the list of categories that COULD fire
 * for this client at this tick — guardrails (cooldown, daily cap) are
 * applied later in trySend().
 *
 * Order matters: each branch is independent (a client could earn both a
 * rhythm message AND a behavioral 24h on the same tick). The daily cap
 * keeps total sends sane.
 */
async function evaluateClient(
  userId: string,
  central: { hour: number; weekday: string },
): Promise<Category[]> {
  const eligible: Category[] = [];

  // === RHYTHM CHECK ===
  // Fire at the top of the relevant hour. Cron is hourly so each rhythm
  // message fires once per day at most.
  if (central.weekday === "Wednesday" && central.hour === 19) {
    eligible.push("rhythm_wed_pm");
  }
  if (central.weekday === "Friday" && central.hour === 19) {
    eligible.push("rhythm_fri_pm");
  }

  // === BEHAVIORAL CHECK ===
  // 24h check: fire at 6 PM Central if last meal log was 24-72 hours ago.
  // 72h check: fire at 7 AM Central if last meal log was 72+ hours ago.
  if (central.hour === 18 || central.hour === 7) {
    const lastMeal = await prisma.mealLog.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const hoursSince = lastMeal
      ? (Date.now() - lastMeal.createdAt.getTime()) / (1000 * 60 * 60)
      : Number.POSITIVE_INFINITY;

    if (central.hour === 18 && hoursSince >= 24 && hoursSince < 72) {
      eligible.push("behavioral_24h");
    }
    if (central.hour === 7 && hoursSince >= 72) {
      eligible.push("behavioral_72h");
    }
  }

  return eligible;
}

type SendOutcome = "sent" | "cooldown" | "daily_cap" | "skipped";

/**
 * Send one category to one client, with guardrails. Returns the reason for
 * the outcome so the batch can keep stats.
 *
 * Why we check guardrails per-send rather than upfront: the cooldown table
 * is per-category, and we want partial success — if rhythm_wed_pm is on
 * cooldown but behavioral_24h isn't, the latter should still go.
 */
async function trySend(
  userId: string,
  category: Category,
  coachId: string | null,
): Promise<SendOutcome> {
  // Cooldown: don't fire the same category twice within COOLDOWN_HOURS.
  const cooldownSince = new Date();
  cooldownSince.setHours(cooldownSince.getHours() - COOLDOWN_HOURS);
  const recent = await prisma.chatMessage.findFirst({
    where: {
      userId,
      kind: "COACH",
      category,
      createdAt: { gte: cooldownSince },
    },
    select: { id: true },
  });
  if (recent) return "cooldown";

  // Daily cap: don't send more than MAX_PROACTIVE_PER_DAY proactive
  // messages per client per Central-time day. Sean's manual coach
  // messages don't count (category is null on those).
  const todayStart = startOfCentralDay();
  const sentToday = await prisma.chatMessage.count({
    where: {
      userId,
      kind: "COACH",
      category: { not: null },
      createdAt: { gte: todayStart },
    },
  });
  if (sentToday >= MAX_PROACTIVE_PER_DAY) return "daily_cap";

  const picked = await pickFreshVariant(userId, category);

  const message = await prisma.chatMessage.create({
    data: {
      userId,
      role: "ASSISTANT",
      kind: "COACH",
      senderUserId: coachId,
      content: picked.body,
      category,
    },
    select: { id: true },
  });

  try {
    await sendPushToUser(userId, {
      title: picked.title,
      body: previewLine(picked.body, 110),
      url: "/messages",
      tag: `sean-${category}-${message.id}`,
    });
  } catch (err) {
    // Push failures don't roll back the message — she'll see it on next
    // dashboard load via the coach message chip anyway.
    console.error(`[sean-messages] push failed for ${userId}/${category}:`, err);
  }

  return "sent";
}

/**
 * Pick a body + title for the given client/category that the client has
 * NOT received in the last DEDUP_WINDOW_DAYS days.
 *
 * Algorithm:
 *   1. Query every ChatMessage this client has received in this category
 *      over the dedup window.
 *   2. Build a Set of the content strings they've already seen.
 *   3. Filter the bank to variants whose body is NOT in that Set.
 *   4. Pick random from the unseen pool.
 *   5. If all 100 variants have already been used in the window (very rare
 *      — would require near-max-frequency sends for ~6+ months), fall
 *      back to a random pick from the whole bank. Repeats happen but
 *      always with the longest possible gap, since they were used at
 *      different points throughout the year.
 *
 * Title is picked independently — title-pool is small (~10) on purpose
 * and dedup isn't worth the complexity for the lockscreen line.
 */
async function pickFreshVariant(
  userId: string,
  category: Category,
): Promise<{ title: string; body: string }> {
  const dedupSince = new Date();
  dedupSince.setDate(dedupSince.getDate() - DEDUP_WINDOW_DAYS);

  const recent = await prisma.chatMessage.findMany({
    where: {
      userId,
      kind: "COACH",
      category,
      createdAt: { gte: dedupSince },
    },
    select: { content: true },
  });
  const seen = new Set(recent.map((m) => m.content));

  const bank = VARIANT_BANKS[category];
  const unseen = bank.filter((body) => !seen.has(body));
  const pool = unseen.length > 0 ? unseen : bank;
  const body = pool[Math.floor(Math.random() * pool.length)];

  const titlePool = TITLE_POOLS[category];
  const title = titlePool[Math.floor(Math.random() * titlePool.length)];

  return { title, body };
}

function readCentralTime(d: Date): { hour: number; weekday: string } {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).format(d);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
  }).format(d);
  // Intl with hour12:false sometimes returns "24" for midnight — normalize.
  const hour = parseInt(hourStr, 10) % 24;
  return { hour, weekday };
}

function previewLine(content: string, max: number): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1).trimEnd() + "…";
}
