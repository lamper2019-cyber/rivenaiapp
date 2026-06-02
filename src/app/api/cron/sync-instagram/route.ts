import { NextResponse } from "next/server";
import { syncInstagram } from "@/lib/instagram-sync";
import { enrichPendingPosts } from "@/lib/post-enrich";
import {
  isInstagramConfigured,
  refreshLongLivedToken,
} from "@/lib/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily Instagram → PostHog sync for the Content Command Center.
 *
 * Pulls RIVEN's recent posts + insights, joins funnel numbers, writes
 * snapshots to Postgres. Also refreshes the long-lived Meta token (valid
 * ~60d, refreshable any time) and logs the fresh one so RIVEN can rotate the
 * env var before expiry — we don't have a secrets store to write it back to.
 *
 * Schedule (Railway service or cron-job.org, mirrors the other crons):
 *   POST https://rivenmethod.com/api/cron/sync-instagram
 *   Authorization: Bearer $CRON_SECRET
 *   Suggested cron: `0 9 * * *` UTC (once daily, morning).
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isInstagramConfigured) {
    return NextResponse.json(
      { error: "Instagram not configured — set INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID." },
      { status: 503 }
    );
  }

  // Refresh the token opportunistically. Non-fatal if it fails (e.g. app
  // secret missing) — the sync can still run on the current token.
  let refreshedToken: string | null = null;
  try {
    refreshedToken = await refreshLongLivedToken();
    console.log(
      "[sync-instagram] token refreshed — update INSTAGRAM_ACCESS_TOKEN env to:",
      refreshedToken
    );
  } catch (e) {
    console.warn("[sync-instagram] token refresh skipped:", e);
  }

  const result = await syncInstagram();

  // Read the screen of any newly-synced posts (on-screen text + visuals via
  // Claude vision). Bounded per run; catches up over days. Non-fatal.
  let vision = { enriched: 0, errors: [] as string[] };
  try {
    vision = await enrichPendingPosts(6);
  } catch (e) {
    console.warn("[sync-instagram] enrich failed:", e);
  }

  return NextResponse.json({
    ...result,
    vision,
    tokenRefreshed: !!refreshedToken,
  });
}
