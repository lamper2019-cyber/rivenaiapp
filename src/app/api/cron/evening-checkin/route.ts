import { NextResponse } from "next/server";
import { runDailyCheckInBatch } from "@/lib/sean-daily-checkins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Evening RIVEN check-in. Fires daily ~8 PM CT.
 *
 * Suggested Railway cron: 1 1 * * *  UTC (8 PM CDT / 7 PM CST).
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * Picks the day's evening-bank variant, sends to every active client
 * who hasn't received a COACH message in the last 4 hours.
 */
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

  const result = await runDailyCheckInBatch("evening");
  return NextResponse.json({ ok: true, ...result });
}
