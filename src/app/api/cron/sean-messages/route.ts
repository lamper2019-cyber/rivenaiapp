import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runSeanMessagesTick } from "@/lib/sean-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * Proactive Sean-voice messaging tick.
 *
 * Protected by CRON_SECRET. Schedule from Railway (or any HTTP cron):
 *   POST https://rivenmethod.com/api/cron/sean-messages
 *   Authorization: Bearer $CRON_SECRET
 *   Cron expression: 0 * * * *   (hourly, every hour UTC)
 *
 * The endpoint figures out the current Central time and decides what (if
 * anything) to send per client. Most hours nothing fires — that's intended.
 * Wed 7 PM / Fri 7 PM / 6 PM behavioral / 7 AM behavioral are the only
 * Phase 1 windows that produce sends.
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set." },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSeanMessagesTick();

  // Re-render any page that shows coach messages so the chip / inbox is
  // fresh after a send wave.
  revalidatePath("/messages");
  revalidatePath("/dashboard");

  return NextResponse.json({
    ok: true,
    ...result,
    errors: result.errors.slice(0, 10),
  });
}
