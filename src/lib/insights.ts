/**
 * Command-center view model. Reads the snapshots the cron stored in Postgres
 * and shapes them for /coach/insights — ranked by what drove the BUSINESS
 * (trials → quiz starts → link taps), not by vanity reach.
 *
 * Pure read + arithmetic over our own DB (the cron fills the tables), PLUS the
 * derived intelligence layer: a per-post verdict (win/ok/flop), pattern
 * clusters (which content TYPE wins), and the all-time winners — the posts
 * that drove follows + profile visits + link taps — each with a remix play.
 */

import { prisma } from "@/lib/prisma";

export type Verdict = "win" | "ok" | "flop";

export type PostCard = {
  igId: string;
  caption: string;
  mediaType: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date;
  reach: number;
  saved: number;
  shares: number;
  avgWatchSec: number | null; // null for non-reels
  follows: number; // new followers IG credited to this post
  profileVisits: number; // profile visits this post drove
  linkTaps: number;
  quizStarts: number;
  trials: number;
  score: number; // business-value ranking score
  verdict: Verdict; // 🟢 win / 🟡 ok / 🔴 flop
  flopReason: string | null;
  // Vision-engine output (null until analyzed).
  hook: string | null;
  contentType: string | null;
  whyItWorks: string | null;
};

export type Cluster = {
  key: string; // story | teaching | result | bts | other
  count: number;
  avgReach: number;
  trials: number;
  trend: "up" | "flat" | "down";
};

/**
 * An "all-time winner" — a post that drove the three signals Sean cares most
 * about: follows + profile visits + link taps. Each carries a concrete remix
 * play so the leaderboard answers "make more like this — here's how."
 */
export type Winner = {
  igId: string;
  hook: string; // the scroll-stopping line (or caption fallback)
  contentType: string | null;
  permalink: string | null;
  dateLabel: string;
  follows: number;
  profileVisits: number;
  linkTaps: number;
  winScore: number; // composite of the three signals
  driver: "follows" | "profile visits" | "link taps"; // the strongest signal
  remix: string; // how to remix it — one concrete play in Sean's voice
};

export type CommandCenter = {
  hasData: boolean;
  account: {
    followers: number | null;
    reach7d: number | null;
    qualifiedDmsWeek: number | null;
  };
  posts: PostCard[]; // score-sorted (leaderboard); page re-sorts for the feed
  pattern: string | null;
  clusters: Cluster[];
  formatNote: string | null; // reels vs images one-liner
  winners: Winner[]; // all-time winners by follows + profile visits + link taps
};

function scorePost(p: { reach: number; linkTaps: number; quizStarts: number; trials: number }): number {
  return p.trials * 1000 + p.quizStarts * 50 + p.linkTaps * 5 + p.reach * 0.001;
}

function diagnoseFlop(p: {
  reach: number;
  avgWatchSec: number | null;
  linkTaps: number;
  quizStarts: number;
  medianReach: number;
}): string | null {
  const lowReach = p.medianReach > 0 && p.reach < p.medianReach * 0.5;
  if (!lowReach && p.quizStarts > 0) return null;
  if (p.avgWatchSec != null && p.avgWatchSec < 3) {
    return "died early — hook too slow. They swiped before the payoff.";
  }
  if (lowReach) {
    return "low reach — the algorithm didn't push it past your followers. Weak hook or off-topic for the ICP.";
  }
  if (p.linkTaps > 0 && p.quizStarts === 0) {
    return "got taps but zero quiz starts — the landing page or the promise mismatched what the post sold.";
  }
  return null;
}

/** Rule-based verdict from the metrics. Money signals win; dead reach flops. */
function verdictOf(
  p: { reach: number; avgWatchSec: number | null; quizStarts: number; trials: number; flopReason: string | null },
  medianReach: number
): Verdict {
  if (p.trials > 0 || p.quizStarts >= 5 || (medianReach > 0 && p.reach >= medianReach * 1.8)) return "win";
  if (p.flopReason || (medianReach > 0 && p.reach < medianReach * 0.5) || (p.avgWatchSec != null && p.avgWatchSec < 3))
    return "flop";
  return "ok";
}

export async function buildCommandCenter(): Promise<CommandCenter> {
  const posts = await prisma.igPost.findMany({
    orderBy: { publishedAt: "desc" },
    take: 40,
    include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  const account = await prisma.igAccountSnapshot.findFirst({ orderBy: { capturedAt: "desc" } });

  const acct = {
    followers: account?.followers ?? null,
    reach7d: account?.reach7d ?? null,
    qualifiedDmsWeek: account?.qualifiedDmsWeek ?? null,
  };
  if (posts.length === 0) {
    return { hasData: false, account: acct, posts: [], pattern: null, clusters: [], formatNote: null, winners: [] };
  }

  const reaches = posts.map((p) => p.metrics[0]?.reach ?? 0).sort((a, b) => a - b);
  const medianReach = reaches[Math.floor(reaches.length / 2)] ?? 0;

  const cards: PostCard[] = posts.map((p) => {
    const m = p.metrics[0];
    const reach = m?.reach ?? 0;
    const avgWatchSec = m?.avgWatchTimeMs != null ? Math.round((m.avgWatchTimeMs / 1000) * 10) / 10 : null;
    const follows = m?.follows ?? 0;
    const profileVisits = m?.profileVisits ?? 0;
    const linkTaps = m?.linkTaps ?? 0;
    const quizStarts = m?.quizStarts ?? 0;
    const trials = m?.trials ?? 0;
    const flopReason = diagnoseFlop({ reach, avgWatchSec, linkTaps, quizStarts, medianReach });
    return {
      igId: p.igId,
      caption: (p.caption ?? "").split("\n")[0].slice(0, 80) || "(no caption)",
      mediaType: p.mediaType,
      permalink: p.permalink,
      thumbnailUrl: p.thumbnailUrl,
      publishedAt: p.publishedAt,
      reach,
      saved: m?.saved ?? 0,
      shares: m?.shares ?? 0,
      avgWatchSec,
      follows,
      profileVisits,
      linkTaps,
      quizStarts,
      trials,
      score: scorePost({ reach, linkTaps, quizStarts, trials }),
      verdict: verdictOf({ reach, avgWatchSec, quizStarts, trials, flopReason }, medianReach),
      flopReason,
      hook: p.hook ?? null,
      contentType: p.contentType ?? null,
      whyItWorks: p.whyItWorks ?? null,
    };
  });

  cards.sort((a, b) => b.score - a.score);

  const clusters = buildClusters(cards);
  return {
    hasData: true,
    account: acct,
    posts: cards,
    pattern: derivePattern(cards),
    clusters,
    formatNote: formatNote(cards),
    winners: buildWinners(cards),
  };
}

/** Group posts by content type → avg reach, trials, trend. The "what TYPE wins". */
function buildClusters(cards: PostCard[]): Cluster[] {
  const overallAvg = cards.reduce((s, c) => s + c.reach, 0) / Math.max(1, cards.length);
  const byType = new Map<string, PostCard[]>();
  for (const c of cards) {
    const k = c.contentType || "other";
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k)!.push(c);
  }
  const out: Cluster[] = [];
  byType.forEach((group, key) => {
    const avgReach = Math.round(group.reduce((s, c) => s + c.reach, 0) / group.length);
    const trials = group.reduce((s, c) => s + c.trials, 0);
    let trend: Cluster["trend"] = "flat";
    if (trials > 0 || avgReach >= overallAvg * 1.2) trend = "up";
    else if (avgReach < overallAvg * 0.6 && trials === 0) trend = "down";
    out.push({ key, count: group.length, avgReach, trials, trend });
  });
  return out.sort((a, b) => b.avgReach - a.avgReach);
}

function formatNote(cards: PostCard[]): string | null {
  const reels = cards.filter((c) => c.mediaType === "REELS" || c.mediaType === "VIDEO");
  const images = cards.filter((c) => !(c.mediaType === "REELS" || c.mediaType === "VIDEO"));
  if (reels.length < 1 || images.length < 1) return null;
  const avg = (xs: PostCard[]) => Math.round(xs.reduce((s, c) => s + c.reach, 0) / xs.length);
  const r = avg(reels), i = avg(images);
  const winner = r >= i ? "Reels" : "Images";
  return `${winner} reach further — ${r.toLocaleString()} avg (reels) vs ${i.toLocaleString()} avg (images).`;
}

/**
 * All-time winners — the posts that drove the three signals Sean cares about
 * most: follows, profile visits, link taps. We score each post on a composite
 * of those three (weighted so the rarer, higher-intent actions matter more),
 * keep the ones that actually moved a needle, and attach a concrete "remix"
 * play built from the post's strongest signal + its content type.
 *
 * Weights: follows are the rarest and most valuable (someone joined the
 * audience), link taps are pure intent (they went looking for RIVEN), profile
 * visits are high-volume curiosity — so follows ×10, link taps ×6, visits ×1.
 */
function buildWinners(cards: PostCard[]): Winner[] {
  const scored = cards
    .map((c) => {
      const winScore = c.follows * 10 + c.linkTaps * 6 + c.profileVisits * 1;
      // The single signal that contributed the most to this post's score.
      const contributions: Array<[Winner["driver"], number]> = [
        ["follows", c.follows * 10],
        ["link taps", c.linkTaps * 6],
        ["profile visits", c.profileVisits * 1],
      ];
      const driver = contributions.sort((a, b) => b[1] - a[1])[0][0];
      return { c, winScore, driver };
    })
    // A winner has to have actually driven one of the three signals.
    .filter((x) => x.winScore > 0)
    .sort((a, b) => b.winScore - a.winScore)
    .slice(0, 5);

  return scored.map(({ c, winScore, driver }) => ({
    igId: c.igId,
    hook: c.hook || c.caption,
    contentType: c.contentType,
    permalink: c.permalink,
    dateLabel: c.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    follows: c.follows,
    profileVisits: c.profileVisits,
    linkTaps: c.linkTaps,
    winScore,
    driver,
    remix: remixPlay(c, driver),
  }));
}

/** The concrete "make more like this" play, built from what actually drove it. */
function remixPlay(c: PostCard, driver: Winner["driver"]): string {
  const type = c.contentType ? `${c.contentType} ` : "";
  if (driver === "follows") {
    return `Pulled ${c.follows} new follower${c.follows === 1 ? "" : "s"} — this ${type}angle makes people want IN. Remix it: keep the structure, swap in a fresh transformation story so it lands brand-new.`;
  }
  if (driver === "link taps") {
    return `Drove ${c.linkTaps} link tap${c.linkTaps === 1 ? "" : "s"} — strongest intent you've got. Remix it: keep the close, rewrite the hook around a different pain point (cravings, Sunday dinner, the scale).`;
  }
  return `Sent ${c.profileVisits} to your profile — strong curiosity, thin next step. Remix it: same opener, then add a clear "link in bio" close so the visits turn into taps.`;
}

function derivePattern(cards: PostCard[]): string | null {
  const withTrials = cards.filter((c) => c.trials > 0);
  if (cards.length < 4) {
    return "Not enough posts yet to call a pattern. Keep posting — this gets real around 8–10 posts.";
  }
  const reels = cards.filter((c) => c.mediaType === "REELS" || c.mediaType === "VIDEO");
  const statics = cards.filter((c) => !(c.mediaType === "REELS" || c.mediaType === "VIDEO"));
  const avgTaps = (xs: PostCard[]) => (xs.length ? xs.reduce((s, c) => s + c.linkTaps, 0) / xs.length : 0);
  if (reels.length >= 2 && statics.length >= 2) {
    const r = avgTaps(reels), s = avgTaps(statics);
    if (r > 0 && s > 0) {
      const ratio = (Math.max(r, s) / Math.max(1, Math.min(r, s))).toFixed(1);
      return `${r >= s ? "Reels" : "Static posts"} drive ~${ratio}x the link taps. Lean into what's converting.`;
    }
  }
  if (withTrials.length > 0) {
    const top = withTrials[0];
    return `Your top converter — "${top.hook || top.caption}" — drove ${top.trials} trial${top.trials === 1 ? "" : "s"}. Make more like it.`;
  }
  return "Reach is happening but nothing's converting to trials yet. The gap is the offer/landing page, not the content.";
}
