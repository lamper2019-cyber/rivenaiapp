/**
 * Command-center view model. Reads the snapshots the cron stored in Postgres
 * and shapes them for /coach/insights — ranked by what drove the BUSINESS
 * (trials → quiz starts → link taps), not by vanity reach.
 *
 * This is pure read + arithmetic over our own DB, so the page renders fast
 * and offline of Meta/PostHog. The cron (/api/cron/sync-instagram) is what
 * fills the tables.
 */

import { prisma } from "@/lib/prisma";

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
  // A business-value score used for ranking. Trials dominate, then quiz
  // starts, then taps, with reach as a faint tiebreaker. Tunable.
  score: number;
  // Plain-English diagnosis when a post underperformed. Null when it did fine.
  flopReason: string | null;
};

export type CommandCenter = {
  hasData: boolean;
  account: {
    followers: number | null;
    reach7d: number | null;
    qualifiedDmsWeek: number | null;
  };
  posts: PostCard[];
  pattern: string | null; // the auto-generated "what's working" line
};

function scorePost(p: {
  reach: number;
  linkTaps: number;
  quizStarts: number;
  trials: number;
}): number {
  // Weights chosen so a single trial outranks any amount of reach. Money > vanity.
  return p.trials * 1000 + p.quizStarts * 50 + p.linkTaps * 5 + p.reach * 0.001;
}

function diagnoseFlop(p: {
  reach: number;
  avgWatchSec: number | null;
  linkTaps: number;
  quizStarts: number;
  medianReach: number;
}): string | null {
  // Only diagnose clear underperformers so we're not nagging on every card.
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

export async function buildCommandCenter(): Promise<CommandCenter> {
  // Latest snapshot per post. We pull recent posts and their newest metric row.
  const posts = await prisma.igPost.findMany({
    orderBy: { publishedAt: "desc" },
    take: 40,
    include: {
      metrics: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
  });

  const account = await prisma.igAccountSnapshot.findFirst({
    orderBy: { capturedAt: "desc" },
  });

  if (posts.length === 0) {
    return {
      hasData: false,
      account: {
        followers: account?.followers ?? null,
        reach7d: account?.reach7d ?? null,
        qualifiedDmsWeek: account?.qualifiedDmsWeek ?? null,
      },
      posts: [],
      pattern: null,
    };
  }

  // Median reach for the flop heuristic.
  const reaches = posts
    .map((p) => p.metrics[0]?.reach ?? 0)
    .sort((a, b) => a - b);
  const medianReach = reaches[Math.floor(reaches.length / 2)] ?? 0;

  const cards: PostCard[] = posts.map((p) => {
    const m = p.metrics[0];
    const reach = m?.reach ?? 0;
    const avgWatchSec =
      m?.avgWatchTimeMs != null ? Math.round((m.avgWatchTimeMs / 1000) * 10) / 10 : null;
    const linkTaps = m?.linkTaps ?? 0;
    const quizStarts = m?.quizStarts ?? 0;
    const trials = m?.trials ?? 0;
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
      flopReason: diagnoseFlop({ reach, avgWatchSec, linkTaps, quizStarts, medianReach }),
    };
  });

  cards.sort((a, b) => b.score - a.score);

  return {
    hasData: true,
    account: {
      followers: account?.followers ?? null,
      reach7d: account?.reach7d ?? null,
      qualifiedDmsWeek: account?.qualifiedDmsWeek ?? null,
    },
    posts: cards,
    pattern: derivePattern(cards),
  };
}

/**
 * The auto "what's working" line. Phase 1 keeps this honest and data-driven
 * off what we actually have: reels vs static, and whether saves track with
 * trials. Phase 3 upgrades it with face-vs-result classification from reel
 * transcripts (the IgPost.hook field).
 */
function derivePattern(cards: PostCard[]): string | null {
  const withTrials = cards.filter((c) => c.trials > 0);
  if (cards.length < 4) {
    return "Not enough posts yet to call a pattern. Keep posting — this line gets real around 8–10 posts.";
  }
  const reels = cards.filter((c) => c.mediaType === "REELS" || c.mediaType === "VIDEO");
  const statics = cards.filter((c) => !(c.mediaType === "REELS" || c.mediaType === "VIDEO"));
  const avgTaps = (xs: PostCard[]) =>
    xs.length ? xs.reduce((s, c) => s + c.linkTaps, 0) / xs.length : 0;

  if (reels.length >= 2 && statics.length >= 2) {
    const r = avgTaps(reels);
    const s = avgTaps(statics);
    if (r > 0 && s > 0) {
      const ratio = (r / s).toFixed(1);
      const winner = r >= s ? "Reels" : "Static posts";
      return `${winner} are driving ~${ratio}x the link taps of the other format. Lean into what's converting.`;
    }
  }
  if (withTrials.length > 0) {
    const top = withTrials[0];
    return `Your top converter — "${top.caption}" — drove ${top.trials} trial${top.trials === 1 ? "" : "s"}. Make more like it.`;
  }
  return "Reach is happening but nothing's converting to trials yet. The gap is the offer/landing page, not the content.";
}
