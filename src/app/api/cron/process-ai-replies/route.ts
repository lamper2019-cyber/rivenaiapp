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
 * [RETIRED 2026-05-27] Sean's "keep it simple" pass removed the
 * /chat thread entirely. Without a typing input there are no client
 * messages for the AI to reply to — sendToSean now skips the
 * scheduler entirely. This route is gated OFF by default to drain
 * cleanly even if Railway hasn't been disabled yet.
 *
 * Set ENABLE_PROCESS_AI_REPLIES=1 in env to revive it (only useful
 * if the /chat thread is also revived).
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

  // Kill switch — defense in depth so a stray scheduled row from
  // before the simplification doesn't get drained and ping a client
  // with an unexpected AI reply.
  if (process.env.ENABLE_PROCESS_AI_REPLIES !== "1") {
    return NextResponse.json({
      ok: true,
      retired: true,
      message:
        "process-ai-replies cron is retired. /chat thread is gone; Sean's coaching is now SeanPromptHeadline-only. Set ENABLE_PROCESS_AI_REPLIES=1 to revive.",
    });
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
