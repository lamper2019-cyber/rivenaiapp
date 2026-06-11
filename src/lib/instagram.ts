/**
 * Instagram API client (Instagram Login flavor) — pulls RIVEN's OWN account
 * performance for the Content Command Center.
 *
 * We use the **Instagram API with Instagram Login** (host: graph.instagram.com),
 * NOT the Facebook-Login Graph API. This was a deliberate pivot: RIVEN's RIVEN
 * account (@itsseanwilliams) lives under a different Facebook account than the
 * Meta app, and the Facebook-Login path requires the IG account + a Facebook
 * Page + the app to all sit under one Facebook account. Instagram Login skips
 * all of that — it authorizes the IG account directly. Verified 2026-06-01:
 * media + insights both return on this path.
 *
 * ── Required env ────────────────────────────────────────────────────────
 *   INSTAGRAM_ACCESS_TOKEN   long-lived IG token (60 days, auto-refreshed
 *                            daily by /api/cron/sync-instagram — no secret
 *                            needed, see refreshLongLivedToken).
 *
 * Nothing throws at import — callers check `isInstagramConfigured` and render
 * a setup card when the token isn't set, so the page works before it exists.
 */

const GRAPH = "https://graph.instagram.com";

export const isInstagramConfigured = !!process.env.INSTAGRAM_ACCESS_TOKEN;

/** Raw media row as /me/media returns it. Reels report media_product_type=REELS. */
export type IgMediaRaw = {
  id: string;
  media_type: string; // IMAGE | VIDEO | CAROUSEL_ALBUM
  media_product_type?: string; // FEED | REELS
  permalink?: string;
  caption?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string; // ISO
};

/** Normalized per-post metrics, after parsing the insights blob. */
export type IgMediaInsights = {
  reach?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  plays?: number;
  avgWatchTimeMs?: number;
  totalWatchTimeMs?: number;
  follows?: number;
  profileVisits?: number;
  linkTaps?: number;
};

export type IgAccountInsights = {
  followers?: number;
  reach7d?: number;
  profileVisits7d?: number;
};

function token(): string {
  const t = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!t) throw new Error("INSTAGRAM_ACCESS_TOKEN is not set.");
  return t;
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token() });
  const res = await fetch(`${GRAPH}/${path}?${qs.toString()}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? `Instagram API ${res.status}`;
    throw new Error(`Instagram API: ${msg}`);
  }
  return json as T;
}

/** Recent media on RIVEN's account. One page (~30) is plenty for a weekly read. */
export async function fetchRecentMedia(limit = 30): Promise<IgMediaRaw[]> {
  const fields =
    "id,media_type,media_product_type,permalink,caption,thumbnail_url,media_url,timestamp";
  const data = await graphGet<{ data: IgMediaRaw[] }>("me/media", {
    fields,
    limit: String(limit),
  });
  return data.data ?? [];
}

// Metric names differ by media kind, and requesting an invalid one for a given
// post errors the WHOLE call — so we send a kind-specific set. (Instagram Login
// dropped `impressions`; reach is the headline number now.)
const REEL_METRICS = [
  "reach",
  "likes",
  "comments",
  "saved",
  "shares",
  "ig_reels_avg_watch_time",
  "ig_reels_video_view_total_time",
];
const FEED_METRICS = ["reach", "likes", "comments", "saved", "shares"];

/** Pull + normalize one post's insights. Per-post failures are caught by the caller. */
export async function fetchMediaInsights(
  igId: string,
  isReel: boolean
): Promise<IgMediaInsights> {
  const metrics = isReel ? REEL_METRICS : FEED_METRICS;
  const data = await graphGet<{
    data: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }>;
  }>(`${igId}/insights`, { metric: metrics.join(",") });

  const out: IgMediaInsights = {};
  for (const row of data.data ?? []) {
    // Media insights return `values[0].value`; some metrics use `total_value`.
    const v = row.values?.[0]?.value ?? row.total_value?.value;
    if (v == null) continue;
    switch (row.name) {
      case "reach": out.reach = v; break;
      case "likes": out.likes = v; break;
      case "comments": out.comments = v; break;
      case "saved": out.saved = v; break;
      case "shares": out.shares = v; break;
      case "ig_reels_avg_watch_time": out.avgWatchTimeMs = v; break;
      case "ig_reels_video_view_total_time": out.totalWatchTimeMs = v; break;
    }
  }

  // The "winner" signals — follows + profile visits a post drove — live behind
  // separate media metrics that IG only exposes for some media types/ages. A
  // rejected metric errors the WHOLE call (see note above), so we fetch these
  // in their own try/catch: if they fail, the core metrics above still land.
  try {
    const act = await graphGet<{
      data: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }>;
    }>(`${igId}/insights`, { metric: "follows,profile_visits" });
    for (const row of act.data ?? []) {
      const v = row.values?.[0]?.value ?? row.total_value?.value;
      if (v == null) continue;
      if (row.name === "follows") out.follows = v;
      if (row.name === "profile_visits") out.profileVisits = v;
    }
  } catch {
    // non-fatal — older posts / unsupported media types just won't have these.
  }

  return out;
}

/** Account snapshot: follower count + recent reach & profile visits. */
export async function fetchAccountInsights(): Promise<IgAccountInsights> {
  const out: IgAccountInsights = {};

  try {
    const acct = await graphGet<{ followers_count?: number }>("me", {
      fields: "followers_count",
    });
    out.followers = acct.followers_count;
  } catch {
    // non-fatal
  }

  try {
    const ins = await graphGet<{
      data: Array<{ name: string; total_value?: { value: number } }>;
    }>("me/insights", {
      metric: "reach,profile_views",
      period: "day",
      metric_type: "total_value",
    });
    for (const row of ins.data ?? []) {
      const v = row.total_value?.value;
      if (row.name === "reach") out.reach7d = v;
      if (row.name === "profile_views") out.profileVisits7d = v;
    }
  } catch {
    // non-fatal
  }

  return out;
}

/** Reels report media_type=VIDEO with media_product_type=REELS. */
export function isReelMedia(m: IgMediaRaw): boolean {
  return m.media_product_type === "REELS" || m.media_type === "VIDEO";
}

/**
 * Refresh the long-lived token. Instagram Login long-lived tokens last 60
 * days and refresh via `ig_refresh_token` with NO app secret — just the
 * current token (must be >24h old and still valid). The daily cron calls
 * this and logs the fresh token so RIVEN can rotate the env var before the
 * 60-day window closes. Returns the new token string.
 */
export async function refreshLongLivedToken(): Promise<string> {
  const data = await graphGet<{ access_token: string; expires_in: number }>(
    "refresh_access_token",
    { grant_type: "ig_refresh_token" }
  );
  return data.access_token;
}
