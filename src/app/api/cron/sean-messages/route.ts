import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runSeanMessagesTick } from "@/lib/sean-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * Proactive RIVEN-voice messaging tick.
 *
 * [RETIRED 2026-05-27] This hourly engine ran on top of the new 3x/day
 * chip-prompt routes and was the main source of push fatigue. The
 * categories it covered are now served by:
 *   - Daily/weekly/monthly rhythm  → morning/midday/evening-checkin
 *                                    cron routes (chip prompts)
 *   - Behavioral 24h/72h           → no-log cheer prompts (peer-driven)
 *   - Progress streak 30/60/90     → peer-wins surface + voice moments
 *
 * The route is GATED OFF by default. Set ENABLE_SEAN_MESSAGES_CRON=1
 * in env if you want to revive it. RIVEN's plan: disable the Railway
 * service entirely so this is never called in production.
 *
 * Code preserved in case we want to reuse the 100-variant banks for
 * a different surface later (e.g., a single weekly digest).
 *
 * Protected by CRON_SECRET. Schedule from Railway (or any HTTP cron):
 *   POST https://rivenmethod.com/api/cron/sean-messages
 *   Authorization: Bearer $CRON_SECRET
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

  // Kill switch — route no-ops unless explicitly enabled. Keeps the
  // hourly cron safe to leave alive on Railway while the service
  // itself is disabled (defense in depth).
  if (process.env.ENABLE_SEAN_MESSAGES_CRON !== "1") {
    return NextResponse.json({
      ok: true,
      retired: true,
      message:
        "sean-messages cron is retired. Coverage moved to morning/midday/evening-checkin + peer-wins + voice moments. Set ENABLE_SEAN_MESSAGES_CRON=1 to revive.",
    });
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
