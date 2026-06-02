import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUser, isPushConfigured } from "@/lib/push";
import { buildCommandCenter } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Weekly "Monday read" — pushes Sean a short content digest from the Command
 * Center: his top post, and the auto-detected pattern. Keeps him in the loop
 * without opening the dashboard.
 *
 * Schedule (cron-job.org / Railway, like the others):
 *   POST https://rivenmethod.com/api/cron/weekly-digest
 *   Authorization: Bearer $CRON_SECRET   ·   Mondays, e.g. `0 13 * * 1`
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "CRON_SECRET not set." }, { status: 503 });
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isPushConfigured) return NextResponse.json({ error: "Push not configured." }, { status: 503 });

  const coach = await prisma.user.findFirst({ where: { role: "COACH" } });
  if (!coach) return NextResponse.json({ error: "No coach user found." }, { status: 404 });

  const cc = await buildCommandCenter();
  if (!cc.hasData) {
    return NextResponse.json({ ok: true, skipped: "no post data yet" });
  }

  const top = cc.posts[0];
  const topLabel = (top?.hook || top?.caption || "your top post").slice(0, 70);
  const body = `Top post: "${topLabel}" — ${top?.reach ?? 0} reached. ${cc.pattern ?? ""}`.slice(0, 180);

  const res = await sendPushToUser(coach.id, {
    title: "Your week on IG",
    body,
    url: "/coach/insights",
    tag: "weekly-digest",
  });

  return NextResponse.json({ ok: true, push: res, body });
}
