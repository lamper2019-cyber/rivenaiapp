import { prisma } from "@/lib/prisma";
import { startOfIsoWeek } from "@/lib/week";

/**
 * Sunday Daily Ritual data layer. The schema is in prisma; this file
 * answers the questions /dashboard + /coach/profile actually ask:
 *
 *   - What's this week's prompt?
 *   - Who has answered, what did they write, what reactions did they get?
 *   - Is the ritual "open" right now? (= today is Sunday in Central time)
 */

export type SundayReactionKind = "heart" | "fire";

export const SUNDAY_REACTION_KINDS: SundayReactionKind[] = ["heart", "fire"];

export const SUNDAY_REACTION_LABEL: Record<SundayReactionKind, string> = {
  heart: "❤️",
  fire: "🔥",
};

export type SundayAnswerSummary = {
  id: string;
  firstName: string;
  body: string;
  createdAt: Date;
  isMine: boolean;
  reactionCounts: Record<SundayReactionKind, number>;
  myReactions: Record<SundayReactionKind, boolean>;
};

export type SundayRitualSnapshot = {
  isOpen: boolean;
  weekStart: Date;
  prompt: { id: string; question: string } | null;
  myAnswer: { id: string; body: string } | null;
  others: SundayAnswerSummary[];
};

const ACTIVE_STATUSES = ["trialing", "active", "comped"];

/** "Open" === today's day-of-week is Sunday in Central time. */
export function isRitualOpen(now: Date = new Date()): boolean {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
    }).format(now) === "Sun"
  );
}

export async function getSundayRitualSnapshot(
  viewerUserId: string,
): Promise<SundayRitualSnapshot> {
  const weekStart = startOfIsoWeek(new Date());
  const isOpen = isRitualOpen();

  const prompt = await prisma.sundayPrompt.findUnique({
    where: { weekStart },
    select: { id: true, question: true },
  });

  if (!prompt) {
    return { isOpen, weekStart, prompt: null, myAnswer: null, others: [] };
  }

  // Pull answers + their reactions in one shot. Filter to active clients
  // so canceled/incomplete accounts don't show in the room. The coach IS
  // allowed to answer (Sean modeling community is part of the value).
  const answers = await prisma.sundayPromptAnswer.findMany({
    where: {
      promptId: prompt.id,
      OR: [
        {
          user: {
            role: "CLIENT",
            subscriptionStatus: { in: ACTIVE_STATUSES },
          },
        },
        { user: { role: "COACH" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      userId: true,
      user: { select: { profile: { select: { name: true } } } },
      reactions: {
        select: { userId: true, kind: true },
      },
    },
  });

  let myAnswer: SundayRitualSnapshot["myAnswer"] = null;
  const others: SundayAnswerSummary[] = [];

  for (const a of answers) {
    const firstName =
      (a.user.profile?.name ?? "").trim().split(/\s+/)[0] || "A RIVEN member";
    if (a.userId === viewerUserId) {
      myAnswer = { id: a.id, body: a.body };
    }
    const reactionCounts: Record<SundayReactionKind, number> = {
      heart: 0,
      fire: 0,
    };
    const myReactions: Record<SundayReactionKind, boolean> = {
      heart: false,
      fire: false,
    };
    for (const r of a.reactions) {
      if ((SUNDAY_REACTION_KINDS as string[]).includes(r.kind)) {
        const k = r.kind as SundayReactionKind;
        reactionCounts[k]++;
        if (r.userId === viewerUserId) myReactions[k] = true;
      }
    }
    others.push({
      id: a.id,
      firstName,
      body: a.body,
      createdAt: a.createdAt,
      isMine: a.userId === viewerUserId,
      reactionCounts,
      myReactions,
    });
  }

  return { isOpen, weekStart, prompt, myAnswer, others };
}

/** Coach helper: get this week's prompt for the editor form. */
export async function getCurrentWeekPrompt() {
  const weekStart = startOfIsoWeek(new Date());
  return prisma.sundayPrompt.findUnique({
    where: { weekStart },
    select: { id: true, question: true, weekStart: true, updatedAt: true },
  });
}
