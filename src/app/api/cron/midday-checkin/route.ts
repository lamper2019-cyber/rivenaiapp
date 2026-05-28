import { NextResponse } from "next/server";
import { runDailyCheckInBatch } from "@/lib/sean-daily-checkins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Midday Sean check-in. Fires daily ~1 PM CT — conditional on her
 * not having logged any meal today. The runDailyCheckInBatch helper
 * filters by today's MealLogs for the midday slot specifically.
 *
 * Suggested Railway cron: 18 0 * * *  UTC (1 PM CDT / 12 PM CST).
 * Auth: Authorization: Bearer $CRON_SECRET
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

  const result = await runDailyCheckInBatch("midday");
  return NextResponse.json({ ok: true, ...result });
}
