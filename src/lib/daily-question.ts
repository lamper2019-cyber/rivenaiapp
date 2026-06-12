import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import {
  questionForDate,
  centralDateKey,
  type DailyQuestion,
} from "@/lib/daily-question-bank";

/**
 * The Circle's daily question — data layer.
 *
 * The question itself is code (daily-question-bank.ts), keyed by the Central
 * calendar date — no cron posts it, it's simply "today's question" the moment
 * anyone looks. Only the ANSWERS live in the DB (DailyAnswer, one row per
 * member per day).
 *
 * Two surfaces read this:
 *   /dashboard — the home card: question + chips, or "You said X →
 *                see what the room said" once answered (the pull into
 *                the Circle).
 *   /circle    — the pinned block at the top of the room: the question +
 *                everyone's answers, names attached. Small-room scale —
 *                a list of women's answers reads warmer than a bar chart.
 */

export type RoomAnswer = {
  firstName: string;
  /** The display text — the chip label she tapped, or her own words. */
  text: string;
  isMine: boolean;
};

export type DailyQuestionSnapshot = {
  question: DailyQuestion;
  /** The viewer's answer (chip key or custom flag), null if not yet. */
  myChoice: string | null;
  myBody: string | null;
  /** Everyone who's answered today, oldest first. */
  answers: RoomAnswer[];
  answeredCount: number;
};

const ACTIVE_STATUSES = ["trialing", "active", "comped"];

export async function getDailyQuestionSnapshot(
  viewerUserId: string,
): Promise<DailyQuestionSnapshot> {
  const question = questionForDate();
  const today = startOfCentralDay();

  const rows = await prisma.dailyAnswer.findMany({
    where: {
      day: today,
      user: {
        OR: [
          { role: "CLIENT", subscriptionStatus: { in: ACTIVE_STATUSES } },
          { role: "COACH" },
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      userId: true,
      choice: true,
      body: true,
      user: { select: { profile: { select: { name: true } } } },
    },
  });

  const labelFor = (choice: string | null): string | null =>
    choice
      ? question.options.find((o) => o.key === choice)?.label ?? null
      : null;

  let myChoice: string | null = null;
  let myBody: string | null = null;
  const answers: RoomAnswer[] = [];

  for (const r of rows) {
    const text = r.body?.trim() || labelFor(r.choice);
    if (!text) continue;
    const isMine = r.userId === viewerUserId;
    if (isMine) {
      myChoice = r.choice;
      myBody = r.body;
    }
    answers.push({
      firstName:
        (r.user.profile?.name ?? "").trim().split(/\s+/)[0] || "A member",
      text,
      isMine,
    });
  }

  return { question, myChoice, myBody, answers, answeredCount: answers.length };
}

/**
 * Record (or change) the viewer's answer for today. Chip OR own words —
 * exactly one. Upsert: tapping a different chip later just updates.
 */
export async function answerDailyQuestion(
  userId: string,
  args: { choice?: string; body?: string },
): Promise<void> {
  const question = questionForDate();
  const today = startOfCentralDay();

  const choice =
    args.choice && question.options.some((o) => o.key === args.choice)
      ? args.choice
      : null;
  const body = args.body?.trim().slice(0, 280) || null;
  if (!choice && !body) throw new Error("Pick a chip or say it your way.");

  await prisma.dailyAnswer.upsert({
    where: { userId_day: { userId, day: today } },
    update: { questionKey: question.key, choice, body: choice ? null : body },
    create: {
      userId,
      day: today,
      questionKey: question.key,
      choice,
      body: choice ? null : body,
    },
  });
}

/**
 * For the 9am invite cron: active clients with push subscriptions who
 * haven't answered today. The push is an INVITATION, not a nag — it fires
 * once, only for the un-answered, and never repeats.
 */
export async function getUnansweredClientIds(): Promise<string[]> {
  const today = startOfCentralDay();
  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      subscriptionStatus: { in: ACTIVE_STATUSES },
      profile: { isNot: null },
      pushSubscriptions: { some: {} },
      dailyAnswers: { none: { day: today } },
    },
    select: { id: true },
  });
  return clients.map((c) => c.id);
}

export { centralDateKey };
