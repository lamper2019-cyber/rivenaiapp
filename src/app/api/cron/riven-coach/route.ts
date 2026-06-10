import { NextResponse } from "next/server";
import { runRivenCoach, type RivenSlot } from "@/lib/riven-coach";

/**
 * The RIVEN coach cron — runs the decision tree. Call it from Railway cron at
 * three times of day with a ?slot= param:
 *   ?slot=morning    ~10:30a CT  (weigh nudge)
 *   ?slot=afternoon  ~3:00p CT   (final weigh nudge)
 *   ?slot=evening    ~7:30p CT   (food nudge)
 * Gated by CRON_SECRET (Bearer), same as the other cron routes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOTS: RivenSlot[] = ["morning", "afternoon", "evening"];

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

  const slot = new URL(req.url).searchParams.get("slot") ?? "";
  if (!SLOTS.includes(slot as RivenSlot)) {
    return NextResponse.json(
      { error: "slot must be one of: morning | afternoon | evening" },
      { status: 400 },
    );
  }

  const result = await runRivenCoach(slot as RivenSlot);
  return NextResponse.json(result);
}
