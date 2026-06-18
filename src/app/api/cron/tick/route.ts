import { NextResponse } from "next/server";
import { POST as rivenCoach } from "../riven-coach/route";
import { POST as sundayRecap } from "../sunday-recap/route";
import { POST as sundayReminder } from "../sunday-reminder/route";
import { POST as weeklyDigest } from "../weekly-digest/route";

/**
 * THE ALARM CLOCK — one cron to rule them all.
 *
 * Schedule THIS endpoint once in Railway (hourly):  0 * * * *
 *   POST https://rivenmethod.com/api/cron/tick
 *   Authorization: Bearer $CRON_SECRET
 *
 * Every hour it works out the current CENTRAL time (so daylight-saving is
 * handled automatically) and runs whichever notification jobs are due that
 * hour, by invoking the existing cron route handlers DIRECTLY, in-process.
 *
 * Why in-process and not fetch(): calling our own public URL from inside the
 * Railway container fails (that was the 500) — the container can't reliably
 * loop back to its own domain. Importing the handlers and calling them as
 * plain functions runs the exact same logic with zero network hop. Each
 * handler still does its own Bearer-auth + date/idempotency guards, so we
 * pass the secret through on a synthetic Request.
 *
 * Deliberately NOT fired here:
 *   • morning/midday/evening-checkin  → superseded by riven-coach (firing both
 *     would double-message clients; see src/lib/riven-coach.ts)
 *   • sean-messages, process-ai-replies, monday-checkin, sync-instagram
 *
 * Testing: hit `/api/cron/tick?dry=1` (with the Bearer secret) to see what
 * WOULD fire at the current Central hour without actually sending anything.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Handler = (req: Request) => Promise<Response>;
type DueJob = { handler: Handler; path: string; label: string };

function jobsDue(hour: number, weekday: string): DueJob[] {
  const due: DueJob[] = [];

  // Daily RIVEN coach nudges — the current engine (≤1 weight + ≤1 food push/day,
  // enforced inside runRivenCoach, so re-firing the same hour can't spam).
  if (hour === 10) due.push({ handler: rivenCoach, path: "/api/cron/riven-coach?slot=morning", label: "RIVEN weigh nudge (morning ~10a CT)" });
  if (hour === 12) due.push({ handler: rivenCoach, path: "/api/cron/riven-coach?slot=midday", label: "RIVEN food nudge (midday ~12p CT)" });
  if (hour === 15) due.push({ handler: rivenCoach, path: "/api/cron/riven-coach?slot=afternoon", label: "RIVEN final weigh nudge (~3p CT)" });
  if (hour === 19) due.push({ handler: rivenCoach, path: "/api/cron/riven-coach?slot=evening", label: "RIVEN food nudge (evening ~7p CT)" });

  // Sunday weekly recap — late afternoon (route self-guards to Sundays anyway).
  if (weekday === "Sunday" && hour === 17) due.push({ handler: sundayRecap, path: "/api/cron/sunday-recap", label: "Sunday weekly recap (~5p CT Sun)" });

  // Coach-only weekly digest — Monday morning (goes to the coach, not clients).
  if (weekday === "Monday" && hour === 7) due.push({ handler: weeklyDigest, path: "/api/cron/weekly-digest", label: "Coach weekly digest (Mon ~7a CT)" });

  // Monthly check-in reminder — the route self-guards to the 1st of the month,
  // so we just poke it once a day at 9a CT and let it decide.
  if (hour === 9) due.push({ handler: sundayReminder, path: "/api/cron/sunday-reminder", label: "Monthly check-in reminder (fires only on the 1st)" });

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

  // Run each due job IN-PROCESS by calling its route handler with a synthetic,
  // authenticated Request. Best-effort: one failure never stops the others.
  const results: Array<Record<string, unknown>> = [];
  for (const job of due) {
    try {
      const res = await job.handler(
        new Request(`https://rivenmethod.com${job.path}`, {
          method: "POST",
          headers: { authorization: `Bearer ${expected}` },
        }),
      );
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

// Allow GET too, so uptime-style schedulers that only do GET can drive it.
export async function GET(req: Request) {
  return handle(req);
}
