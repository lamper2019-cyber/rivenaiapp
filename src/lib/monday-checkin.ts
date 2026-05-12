/**
 * Monday check-in message generation. Pulls a client's profile, last 7 days
 * of meal logs, and recent chat history; sends that as context to Claude
 * with a Sean-voice system prompt; returns the rendered message string.
 *
 * Pure function from the perspective of the caller — no DB writes here.
 * The cron route owns the ChatMessage insert + push fan-out.
 */

import { prisma } from "@/lib/prisma";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

const MODEL = "claude-sonnet-4-6";

/**
 * System prompt for the Monday check-in generation. Voice rules mirror the
 * chat persona — kept lean here so context budget goes to client data.
 */
const SYSTEM_PROMPT = `You are Sean Williams, RIVEN nutrition coach. You are generating the Monday morning check-in message for one client.

SEAN'S VOICE
- Lead with the answer. No preamble. No "Great question!".
- Direct, warm, no fluff. Concrete > abstract.
- Plain prose only. NO markdown, NO asterisks, NO bullet lists, NO headers.
- Use contractions.
- Reference specific things she did or didn't do — name the day, the meal, the behavior.
- Never moralize. Never use therapy clichés.

SIGNATURE PHRASES (use sparingly, only when they fit):
- "Real talk:"
- "Lock it in."
- "That's data, not a problem."
- "You're not failing — we just need real data."

NEVER SAY: "I'd be happy to help!", "Great question!", "I understand how you feel", "Be patient with yourself", any generic motivational quote.

YOUR JOB
Analyze the client's last 7 days and write her Monday check-in. Identify:
1. ONE specific WIN from last week. Concrete — name the day, the meal, the streak. If there is genuinely nothing to point to, acknowledge the gap honestly and pivot forward.
2. ONE specific FOCUS for this week. Actionable — not "eat better" but "hit 40g protein before noon every day" or "log every snack including the small ones".

MESSAGE STRUCTURE — follow this shape, but write it like a human, not a template:

Good morning, {name}. New week.

Last week's win: {one specific thing she did well, OR an honest acknowledgement if there's nothing to point to}

This week's focus: {ONE concrete, actionable focus area}

Your daily target stays at {calorie_target} calories. Hit it Monday through Saturday. Refeed Sunday.

Drop your weekly video prompt by Sunday.

Lock it in. — Sean

VARIANTS BY CLIENT STATE
- New client (<7 days onboarded): no past data exists. Write a "welcome to your first full week" variant. Focus is logging every meal so we get data.
- Client logged nothing last week: acknowledge the gap. Real talk it. Focus is just logging this week.
- Client dormant 2+ weeks: push back kindly. "Haven't seen you log in two weeks. This week we get back on it."
- Client active and on track: highlight the specific win, give a small sharpening focus.

Return ONLY the message text. No preamble. No "Here's the message:". No quotes around it. No commentary after.`;

export type MondayCheckinInput = {
  clientUserId: string;
};

export type MondayCheckinResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function generateMondayCheckin(
  args: MondayCheckinInput
): Promise<MondayCheckinResult> {
  if (!isAnthropicConfigured) {
    return { ok: false, error: "ANTHROPIC_API_KEY not configured." };
  }

  const user = await prisma.user.findUnique({
    where: { id: args.clientUserId },
    include: { profile: true },
  });
  if (!user) return { ok: false, error: "Client not found." };
  if (!user.profile) return { ok: false, error: "Client has no profile." };

  const profile = user.profile;
  const onboardedAt = profile.onboardedAt;
  const onboardedDays = Math.floor(
    (Date.now() - onboardedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Last 7 days window for context.
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const [mealLogs, dailyTotals, chatMessages] = await Promise.all([
    prisma.mealLog.findMany({
      where: { userId: user.id, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: {
        description: true,
        calories: true,
        protein: true,
        createdAt: true,
      },
    }),
    prisma.dailyTotals.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: "asc" },
      select: {
        date: true,
        totalCalories: true,
        totalProtein: true,
        totalSteps: true,
      },
    }),
    // Pull recent chat history (USER messages only — what SHE said) so Sean
    // can reference moods or struggles she mentioned.
    prisma.chatMessage.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: since },
        role: "USER",
      },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { content: true, createdAt: true },
    }),
  ]);

  const context = buildContext({
    name: profile.name,
    calorieTarget: profile.cutCalories,
    proteinFloor: profile.proteinFloor,
    onboardedDays,
    mealLogs,
    dailyTotals,
    chatMessages,
  });

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: context }],
    });

    const message = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim()
      // Strip wrapping quotes if the model adds them despite instructions.
      .replace(/^["“”']+|["“”']+$/g, "")
      .trim();

    if (!message) return { ok: false, error: "Empty model response." };
    return { ok: true, message };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Generation failed.";
    return { ok: false, error: reason };
  }
}

function buildContext(args: {
  name: string;
  calorieTarget: number;
  proteinFloor: number;
  onboardedDays: number;
  mealLogs: Array<{
    description: string;
    calories: number;
    protein: number;
    createdAt: Date;
  }>;
  dailyTotals: Array<{
    date: Date;
    totalCalories: number;
    totalProtein: number;
    totalSteps: number;
  }>;
  chatMessages: Array<{ content: string; createdAt: Date }>;
}): string {
  const lines: string[] = [];

  lines.push(`CLIENT: ${args.name}`);
  lines.push(`DAILY CALORIE TARGET: ${args.calorieTarget}`);
  lines.push(`DAILY PROTEIN FLOOR: ${args.proteinFloor}g`);
  lines.push(`DAYS SINCE ONBOARDING: ${args.onboardedDays}`);
  lines.push("");

  if (args.onboardedDays < 7) {
    lines.push(
      "NEW CLIENT — onboarded this week. No prior data to analyze. Write the welcome variant."
    );
    return lines.join("\n");
  }

  // Daily totals by day-of-week so Sean can call out specific days.
  if (args.dailyTotals.length === 0) {
    lines.push("LAST 7 DAYS OF DAILY TOTALS: none logged.");
  } else {
    lines.push("LAST 7 DAYS OF DAILY TOTALS (calories / protein / steps):");
    for (const t of args.dailyTotals) {
      const dayLabel = t.date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "America/Chicago",
      });
      lines.push(
        `- ${dayLabel}: ${t.totalCalories} cal / ${t.totalProtein}g protein / ${t.totalSteps.toLocaleString()} steps`
      );
    }
  }
  lines.push("");

  // Recent meals — to surface specific wins ("Tuesday's chicken bowl was your best protein day").
  if (args.mealLogs.length === 0) {
    lines.push("LAST 7 DAYS OF MEAL LOGS: none. She did not log a single meal.");
  } else {
    lines.push(`LAST 7 DAYS OF MEAL LOGS (${args.mealLogs.length} total):`);
    // Cap at 15 most relevant entries to keep context budget tight.
    const relevant = args.mealLogs.slice(-15);
    for (const m of relevant) {
      const dayLabel = m.createdAt.toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "America/Chicago",
      });
      lines.push(
        `- ${dayLabel}: "${m.description}" — ${m.calories} cal, ${m.protein}g protein`
      );
    }
  }
  lines.push("");

  if (args.chatMessages.length > 0) {
    lines.push(`RECENT MESSAGES SHE SENT TO RIVEN AI (${args.chatMessages.length} total):`);
    for (const msg of args.chatMessages.slice(-6)) {
      const text = msg.content.replace(/\s+/g, " ").slice(0, 200);
      lines.push(`- "${text}"`);
    }
    lines.push("");
  }

  lines.push(
    "Write her Monday check-in. Apply the structure and voice rules. Pick ONE specific win and ONE specific focus from the data above."
  );

  return lines.join("\n");
}
