/**
 * PostHog server-side query client — the FUNNEL half of the command center.
 *
 * Reads project 448237 via the Query API (HogQL). This is server-only and
 * uses a *Personal API Key* (phx_...), NOT the public NEXT_PUBLIC_POSTHOG_KEY
 * (phc_...) the browser uses to *write* events. Never expose the personal key
 * client-side.
 *
 * ── Required env ────────────────────────────────────────────────────────
 *   POSTHOG_PERSONAL_API_KEY   read-only personal key (phx_...)
 *                              PostHog → Settings → Personal API keys
 *   POSTHOG_PROJECT_ID         448237  (RIVEN "Default project")
 *   POSTHOG_API_HOST           optional, defaults to https://us.posthog.com
 *
 * Internal/test emails are excluded everywhere so the numbers reflect real
 * people, matching the analysis we already ran by hand.
 */

export const isPosthogQueryConfigured =
  !!process.env.POSTHOG_PERSONAL_API_KEY && !!process.env.POSTHOG_PROJECT_ID;

const API_HOST = process.env.POSTHOG_API_HOST || "https://us.posthog.com";

// Keep in sync with the internal/test accounts RIVEN excludes from analysis.
const INTERNAL_EMAILS = [
  "lamper.2019@gmail.com",
  "seanwilliams0324@gmail.com",
  "williamsmt08@gmail.com",
  "ivorykeyz1908@gmail.com",
];
const INTERNAL_SQL_LIST = INTERNAL_EMAILS.map((e) => `'${e}'`).join(", ");
// Anonymous landing traffic has a null email (person_profiles=identified_only),
// so coalesce to '' to keep those rows IN while dropping the known insiders.
const NOT_INTERNAL = `coalesce(person.properties.email, '') NOT IN (${INTERNAL_SQL_LIST})`;

async function hogql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!key || !projectId) throw new Error("PostHog query env not set.");

  const res = await fetch(`${API_HOST}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.detail ?? json?.error ?? `PostHog query ${res.status}`;
    throw new Error(`PostHog: ${msg}`);
  }
  // Query API returns { results: any[][], columns: string[] }. Zip into objects.
  const columns: string[] = json.columns ?? [];
  const rows: unknown[][] = json.results ?? [];
  return rows.map((r) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((c, i) => (obj[c] = r[i]));
    return obj as T;
  });
}

export type FunnelTotals = {
  pageviews: number;
  sessions: number;
  igVisitors: number; // sessions tagged utm_source=instagram
  quizStarts: number;
  trials: number;
};

/** Headline numbers for the "THIS WEEK" strip. `days` window, internal excluded. */
export async function fetchFunnelTotals(days = 7): Promise<FunnelTotals> {
  const rows = await hogql<{
    pageviews: number;
    sessions: number;
    ig: number;
    quiz: number;
    trials: number;
  }>(`
    SELECT
      countIf(event = '$pageview') AS pageviews,
      uniqIf($session_id, event = '$pageview') AS sessions,
      uniqIf($session_id,
        event = '$pageview'
        AND properties.utm_source = 'instagram'
      ) AS ig,
      countIf(event = '$pageview' AND properties.$pathname = '/quiz/start') AS quiz,
      countIf(event = 'subscription_started') AS trials
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND ${NOT_INTERNAL}
  `);
  const r = rows[0] ?? { pageviews: 0, sessions: 0, ig: 0, quiz: 0, trials: 0 };
  return {
    pageviews: Number(r.pageviews) || 0,
    sessions: Number(r.sessions) || 0,
    igVisitors: Number(r.ig) || 0,
    quizStarts: Number(r.quiz) || 0,
    trials: Number(r.trials) || 0,
  };
}

export type PostFunnel = { linkTaps: number; quizStarts: number; trials: number };

/**
 * Per-post funnel numbers keyed by utm_content (we tag each post's link with
 * `ig_<igId>`). Returns a map igId → {quizStarts, trials, linkTaps}. Posts
 * without a trackable link simply won't appear here; the caller falls back to
 * publish-time correlation for those.
 */
export async function fetchPerPostFunnel(days = 30): Promise<Map<string, PostFunnel>> {
  const rows = await hogql<{
    content: string;
    taps: number;
    quiz: number;
    trials: number;
  }>(`
    SELECT
      properties.utm_content AS content,
      countIf(event = '$pageview') AS taps,
      countIf(event = '$pageview' AND properties.$pathname = '/quiz/start') AS quiz,
      countIf(event = 'subscription_started') AS trials
    FROM events
    WHERE timestamp >= now() - INTERVAL ${days} DAY
      AND properties.utm_content LIKE 'ig_%'
      AND ${NOT_INTERNAL}
    GROUP BY content
  `);

  const map = new Map<string, PostFunnel>();
  for (const r of rows) {
    if (!r.content) continue;
    const igId = String(r.content).replace(/^ig_/, "");
    map.set(igId, {
      linkTaps: Number(r.taps) || 0,
      quizStarts: Number(r.quiz) || 0,
      trials: Number(r.trials) || 0,
    });
  }
  return map;
}
