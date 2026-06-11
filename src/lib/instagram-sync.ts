/**
 * The sync job: pull RIVEN's Instagram posts + insights, join the PostHog
 * funnel numbers, and write snapshots to Postgres. Shared by the daily cron
 * (/api/cron/sync-instagram) and the manual "Sync now" button on the page.
 *
 * Per-post insight failures are swallowed (logged) so one bad post can't
 * abort the whole run — we still want the other 29.
 */

import { prisma } from "@/lib/prisma";
import {
  isInstagramConfigured,
  fetchRecentMedia,
  fetchMediaInsights,
  fetchAccountInsights,
  isReelMedia,
} from "@/lib/instagram";
import { isPosthogQueryConfigured, fetchPerPostFunnel } from "@/lib/posthog-insights";

export type SyncResult = {
  ok: boolean;
  postsSynced: number;
  errors: string[];
};

export async function syncInstagram(): Promise<SyncResult> {
  const errors: string[] = [];

  if (!isInstagramConfigured) {
    return { ok: false, postsSynced: 0, errors: ["Instagram not configured."] };
  }

  // 1. Recent media.
  const media = await fetchRecentMedia(30);

  // 2. Funnel numbers per post (by utm_content). Optional — only if PostHog set.
  const funnel = isPosthogQueryConfigured
    ? await fetchPerPostFunnel(30).catch((e) => {
        errors.push(`PostHog per-post: ${e instanceof Error ? e.message : e}`);
        return new Map();
      })
    : new Map();

  let postsSynced = 0;

  for (const m of media) {
    try {
      const reel = isReelMedia(m);
      const mediaType = m.media_product_type === "REELS" ? "REELS" : m.media_type;

      // Upsert the post row (stable key = igId).
      const post = await prisma.igPost.upsert({
        where: { igId: m.id },
        create: {
          igId: m.id,
          mediaType,
          permalink: m.permalink ?? null,
          caption: m.caption ?? null,
          thumbnailUrl: m.thumbnail_url ?? null,
          mediaUrl: m.media_url ?? null,
          publishedAt: new Date(m.timestamp),
          utmContent: `ig_${m.id}`,
        },
        update: {
          // Caption/permalink can change; metrics never live here.
          caption: m.caption ?? null,
          permalink: m.permalink ?? null,
          thumbnailUrl: m.thumbnail_url ?? null,
          mediaUrl: m.media_url ?? null,
        },
      });

      // Insights — tolerate per-post failure (e.g. story expired, metric n/a).
      let ins: Awaited<ReturnType<typeof fetchMediaInsights>> = {};
      try {
        ins = await fetchMediaInsights(m.id, reel);
      } catch (e) {
        errors.push(`insights ${m.id}: ${e instanceof Error ? e.message : e}`);
      }

      const f = funnel.get(m.id);

      await prisma.igPostMetric.create({
        data: {
          postId: post.id,
          reach: ins.reach ?? null,
          impressions: ins.impressions ?? null,
          likes: ins.likes ?? null,
          comments: ins.comments ?? null,
          saved: ins.saved ?? null,
          shares: ins.shares ?? null,
          plays: ins.plays ?? null,
          avgWatchTimeMs: ins.avgWatchTimeMs ?? null,
          totalWatchTimeMs: ins.totalWatchTimeMs ?? null,
          follows: ins.follows ?? null,
          profileVisits: ins.profileVisits ?? null,
          // Prefer IG's own link-tap count; PostHog taps are the funnel-side
          // truth, so we store PostHog's when present.
          linkTaps: f?.linkTaps ?? ins.linkTaps ?? null,
          quizStarts: f?.quizStarts ?? null,
          trials: f?.trials ?? null,
        },
      });

      postsSynced++;
    } catch (e) {
      errors.push(`post ${m.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 3. Account snapshot. Carry forward the manually-entered qualified-DM count
  // so the daily auto-sync doesn't wipe RIVEN's number.
  try {
    const acct = await fetchAccountInsights();
    const last = await prisma.igAccountSnapshot.findFirst({
      orderBy: { capturedAt: "desc" },
    });
    await prisma.igAccountSnapshot.create({
      data: {
        followers: acct.followers ?? null,
        reach7d: acct.reach7d ?? null,
        profileVisits7d: acct.profileVisits7d ?? null,
        qualifiedDmsWeek: last?.qualifiedDmsWeek ?? null,
      },
    });
  } catch (e) {
    errors.push(`account: ${e instanceof Error ? e.message : e}`);
  }

  return { ok: true, postsSynced, errors };
}
