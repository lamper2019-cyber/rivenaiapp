import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runMondayCheckinBatch } from "@/lib/monday-checkin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // ~13 min safety net; the batch itself runs
// 5 clients in parallel and should finish in under 3 min for ≤50 clients.

/**
 * Monday-morning RIVEN check-in (scheduled).
 *
 * Protected by CRON_SECRET. Schedule from Railway:
 *   POST https://rivenmethod.com/api/cron/monday-checkin
 *   Authorization: Bearer $CRON_SECRET
 *   Cron expression: 0 12 * * 1   (Mon 12:00 UTC = 7 AM CDT)
 *
 * The same batch logic is also reachable via the "Send Monday check-ins now"
 * button on the coach profile page (server action, Clerk + role=COACH gated).
 * Both routes call `runMondayCheckinBatch` so behavior stays identical.
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set." },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runMondayCheckinBatch();

  revalidatePath("/messages");
  revalidatePath("/dashboard");

  return NextResponse.json({
    ok: true,
    clientsTargeted: result.clientsTargeted,
    sent: result.sent,
    skipped: result.skipped,
    errors: result.errors.slice(0, 10), // cap response size
  });
}
