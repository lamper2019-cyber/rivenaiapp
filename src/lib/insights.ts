/**
 * Command-center view model. Reads the snapshots the cron stored in Postgres
 * and shapes them for /coach/insights — ranked by what drove the BUSINESS
 * (trials → quiz starts → link taps), not by vanity reach.
 *
 * Pure read + arithmetic over our own DB (the cron fills the tables), PLUS the
 * derived intelligence layer: a per-post verdict (win/ok/flop), pattern
 * clusters (which content TYPE wins), and an auto SWOT for the strategy read.
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

export type Swot = {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
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
  swot: Swot;
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
  const emptySwot: Swot = { strengths: [], weaknesses: [], opportunities: [], threats: [] };

  if (posts.length === 0) {
    return { hasData: false, account: acct, posts: [], pattern: null, clusters: [], formatNote: null, swot: emptySwot };
  }

  const reaches = posts.map((p) => p.metrics[0]?.reach ?? 0).sort((a, b) => a - b);
  const medianReach = reaches[Math.floor(reaches.length / 2)] ?? 0;

  const cards: PostCard[] = posts.map((p) => {
    const m = p.metrics[0];
    const reach = m?.reach ?? 0;
    const avgWatchSec = m?.avgWatchTimeMs != null ? Math.round((m.avgWatchTimeMs / 1000) * 10) / 10 : null;
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
    swot: buildSwot(cards, clusters, acct),
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

/** Rule-based SWOT from the clusters + funnel reality. Honest, not generic. */
function buildSwot(cards: PostCard[], clusters: Cluster[], acct: { followers: number | null }): Swot {
  const totalTrials = cards.reduce((s, c) => s + c.trials, 0);
  const totalReach = cards.reduce((s, c) => s + c.reach, 0);
  const flops = cards.filter((c) => c.verdict === "flop").length;
  const winnerCluster = clusters.find((c) => c.trend === "up");
  const loserCluster = [...clusters].reverse().find((c) => c.trend === "down");
  const untested = clusters.filter((c) => c.count <= 1).map((c) => c.key);

  const strengths: string[] = [];
  if (winnerCluster) strengths.push(`${cap(winnerCluster.key)} posts travel — ~${winnerCluster.avgReach.toLocaleString()} avg reach.`);
  if (totalTrials > 0) strengths.push(`Your content is converting — ${totalTrials} trial${totalTrials === 1 ? "" : "s"} traced to posts.`);
  if (strengths.length === 0) strengths.push("Consistent posting — the data engine is running.");

  const weaknesses: string[] = [];
  if (loserCluster) weaknesses.push(`${cap(loserCluster.key)} posts underperform — ~${loserCluster.avgReach.toLocaleString()} avg reach, ${loserCluster.trials} trials.`);
  if (flops > 0) weaknesses.push(`${flops} post${flops === 1 ? "" : "s"} flopped — weak hooks or early drop-off.`);
  const savesNoTrials = cards.filter((c) => c.saved > 5 && c.trials === 0).length;
  if (savesNoTrials > 0) weaknesses.push(`${savesNoTrials} post${savesNoTrials === 1 ? "" : "s"} earned saves but 0 trials — no clear next step.`);

  const opportunities: string[] = [];
  if (untested.length) opportunities.push(`${untested.map(cap).join(" & ")} barely tested — room to explore what lands.`);
  opportunities.push("Add a link sticker to Stories → real per-post attribution (not just bio).");
  opportunities.push("Cultural-food angle (Sunday dinner, soul food) — high ICP fit, underused.");

  const threats: string[] = [];
  if (totalReach > 0 && totalTrials === 0) threats.push("Reach is happening but 0 trials traced — top-of-funnel leak.");
  threats.push("Only one link source (bio) — most per-post attribution is blind.");
  if ((acct.followers ?? 0) > 0) threats.push("Token rotation due ~late July — sync stops if it lapses.");

  return { strengths, weaknesses, opportunities, threats };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
