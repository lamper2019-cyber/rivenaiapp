import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processPendingReply } from "@/lib/sean-auto-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sequential AI calls can take a few seconds each; give the route
// room to process a small batch without hitting Vercel's default
// timeout.
export const maxDuration = 60;

/**
 * Process due AI auto-replies on the unified "Sean" thread.
 *
 * Suggested external schedule: every 1 minute via Railway cron, hits:
 *   POST https://yourdomain.com/api/cron/process-ai-replies
 *   Authorization: Bearer $CRON_SECRET
 *
 * Each tick:
 *   1. Find up to BATCH_SIZE pending replies with scheduledFor <= now()
 *   2. Process them sequentially (so they don't all hammer the API)
 *   3. Each one generates a Sean-voice reply and inserts a COACH
 *      ChatMessage. processPendingReply handles atomic claim so this
 *      route is safe to overlap with another tick.
 *
 * Note: the route returns 200 even when individual replies fail —
 * those rows get marked status="failed" with the error stored. The
 * route only returns non-200 when something catastrophic happens
 * (DB down, missing secret).
 */
const BATCH_SIZE = 20;

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set in .env.local." },
      { status: 503 },
    );
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.pendingAiReply.findMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of due) {
    const r = await processPendingReply(row.id);
    if (r.ok) sent++;
    else {
      failed++;
      errors.push(r.error);
    }
  }

  return NextResponse.json({
    ok: true,
    found: due.length,
    sent,
    failed,
    errors: errors.slice(0, 5),
  });
}
