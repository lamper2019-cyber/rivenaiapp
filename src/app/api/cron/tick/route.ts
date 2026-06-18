import { NextResponse } from "next/server";

/**
 * THE ALARM CLOCK — one cron to rule them all.
 *
 * Schedule THIS endpoint once in Railway (hourly, UTC):  0 * * * *
 *   POST https://rivenmethod.com/api/cron/tick
 *   Authorization: Bearer $CRON_SECRET
 *
 * Every hour it works out the current CENTRAL time (so daylight-saving is
 * handled automatically) and fires whichever notification jobs are due that
 * hour, by calling the existing cron routes internally with the same secret.
 * Each underlying route keeps its OWN auth + date/idempotency guards, so this
 * dispatcher is a pure time-router — it adds no new sending logic.
 *
 * Why this exists: the individual jobs were never scheduled, so no
 * notifications ever went out. Rather than wire up ~10 separate Railway crons
 * (easy to forget one), Sean sets up THIS one and never touches it again.
 *
 * Deliberately NOT fired here:
 *   • morning/midday/evening-checkin  → superseded by riven-coach (firing both
 *     would double-message clients; see the note in src/lib/riven-coach.ts)
 *   • sean-messages                   → retired
 *   • process-ai-replies              → gated off by default
 *   • monday-checkin, sync-instagram  → left off on purpose (add later if wanted)
 *
 * Testing: hit `/api/cron/tick?dry=1` (with the Bearer secret) to see what
 * WOULD fire at the current Central hour without actually sending anything.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DueJob = { path: string; label: string };

function jobsDue(hour: number, weekday: string): DueJob[] {
  const due: DueJob[] = [];

  // Daily RIVEN coach nudges — the current engine (≤1 weight + ≤1 food push/day,
  // enforced inside runRivenCoach, so re-firing the same hour can't spam).
  if (hour === 10) due.push({ path: "/api/cron/riven-coach?slot=morning", label: "RIVEN weigh nudge (morning ~10a CT)" });
  if (hour === 12) due.push({ path: "/api/cron/riven-coach?slot=midday", label: "RIVEN food nudge (midday ~12p CT)" });
  if (hour === 15) due.push({ path: "/api/cron/riven-coach?slot=afternoon", label: "RIVEN final weigh nudge (~3p CT)" });
  if (hour === 19) due.push({ path: "/api/cron/riven-coach?slot=evening", label: "RIVEN food nudge (evening ~7p CT)" });

  // Sunday weekly recap — late afternoon (route self-guards to Sundays anyway).
  if (weekday === "Sunday" && hour === 17) due.push({ path: "/api/cron/sunday-recap", label: "Sunday weekly recap (~5p CT Sun)" });

  // Coach-only weekly digest — Monday morning (goes to the coach, not clients).
  if (weekday === "Monday" && hour === 7) due.push({ path: "/api/cron/weekly-digest", label: "Coach weekly digest (Mon ~7a CT)" });

  // Monthly check-in reminder — the route self-guards to the 1st of the month,
  // so we just poke it once a day at 9a CT and let it decide.
  if (hour === 9) due.push({ path: "/api/cron/sunday-reminder", label: "Monthly check-in reminder (fires only on the 1st)" });

  return due;
}

async function handle(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not set." }, { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Current wall-clock time in America/Chicago. h23 keeps midnight as 0 (not 24).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hourCycle: "h23",
    hour: "2-digit",
    weekday: "long",
    day: "numeric",
  }).formatToParts(new Date());
  const part = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(part("hour"), 10);
  const weekday = part("weekday");
  const dayOfMonth = parseInt(part("day"), 10);

  const due = jobsDue(hour, weekday);
  const dry = new URL(req.url).searchParams.get("dry");
  const central = { hour, weekday, dayOfMonth };

  if (dry === "1" || dry === "true") {
    return NextResponse.json({ ok: true, dryRun: true, central, wouldFire: due.map((d) => d.label) });
  }

  // Fire each due job by calling its own route on this same deployment, so all
  // existing logic + guards run untouched. Best-effort: one failure never stops
  // the others.
  const origin = new URL(req.url).origin;
  const results: Array<Record<string, unknown>> = [];
  for (const job of due) {
    try {
      const res = await fetch(origin + job.path, {
        method: "POST",
        headers: { Authorization: `Bearer ${expected}` },
      });
      const body = await res.json().catch(() => ({}));
      results.push({ job: job.label, status: res.status, result: body });
    } catch (err) {
      results.push({ job: job.label, status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ ok: true, central, fired: results.length, jobs: results });
}

export async function POST(req: Request) {
  return handle(req);
}

// Allow GET too, so uptime-style schedulers (cron-job.org, etc.) that only do
// GET can drive it. Same Bearer auth applies.
export async function GET(req: Request) {
  return handle(req);
}
