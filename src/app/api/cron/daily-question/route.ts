import { NextResponse } from "next/server";
import { getUnansweredClientIds } from "@/lib/daily-question";
import { questionForDate } from "@/lib/daily-question-bank";
import { sendPushToUser } from "@/lib/push";

/**
 * The daily-question invite — ONE soft push at ~9:00a CT to members who
 * haven't answered today's Circle question yet. An invitation, not a nag:
 * fires once a day, only for the un-answered, never repeats, and reads
 * warm. Members who already answered hear nothing.
 *
 * Railway cron: schedule `0 14 * * *` (14:00 UTC = 9:00a CDT) with the
 * standard start command pointing at this route. Gated by CRON_SECRET.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not set." }, { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const question = questionForDate();
  const userIds = await getUnansweredClientIds();

  let sent = 0;
  for (const userId of userIds) {
    try {
      await sendPushToUser(userId, {
        title: "The Circle",
        body: `Today's question: ${question.question} Tap your answer.`,
        url: "/dashboard", // the card is on home — answer where she lands
        tag: `daily-question-${userId}`,
      });
      sent++;
    } catch {
      // one bad subscription never kills the batch
    }
  }

  return NextResponse.json({ candidates: userIds.length, sent });
}
