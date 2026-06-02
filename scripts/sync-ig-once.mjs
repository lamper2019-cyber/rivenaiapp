// One-off Instagram → Postgres sync, run manually to verify the pipeline end
// to end and populate real data. Mirrors src/lib/instagram-sync.ts but is
// self-contained (no @/ aliases) so it runs under plain `node --env-file=.env`.
//   usage:  node --env-file=.env scripts/sync-ig-once.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const GRAPH = "https://graph.instagram.com";
const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;

async function g(path, params) {
  const qs = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `IG ${res.status}`);
  return json;
}

const REEL = ["reach","likes","comments","saved","shares","ig_reels_avg_watch_time","ig_reels_video_view_total_time"];
const FEED = ["reach","likes","comments","saved","shares"];

async function run() {
  const media = (await g("me/media", {
    fields: "id,media_type,media_product_type,permalink,caption,thumbnail_url,media_url,timestamp",
    limit: "30",
  })).data ?? [];

  let synced = 0;
  for (const m of media) {
    const isReel = m.media_product_type === "REELS" || m.media_type === "VIDEO";
    const mediaType = m.media_product_type === "REELS" ? "REELS" : m.media_type;
    const post = await prisma.igPost.upsert({
      where: { igId: m.id },
      create: {
        igId: m.id, mediaType, permalink: m.permalink ?? null, caption: m.caption ?? null,
        thumbnailUrl: m.thumbnail_url ?? null, mediaUrl: m.media_url ?? null,
        publishedAt: new Date(m.timestamp), utmContent: `ig_${m.id}`,
      },
      update: { caption: m.caption ?? null, permalink: m.permalink ?? null, thumbnailUrl: m.thumbnail_url ?? null },
    });

    const ins = {};
    try {
      const rows = (await g(`${m.id}/insights`, { metric: (isReel ? REEL : FEED).join(",") })).data ?? [];
      for (const r of rows) {
        const v = r.values?.[0]?.value ?? r.total_value?.value;
        if (v == null) continue;
        if (r.name === "reach") ins.reach = v;
        else if (r.name === "likes") ins.likes = v;
        else if (r.name === "comments") ins.comments = v;
        else if (r.name === "saved") ins.saved = v;
        else if (r.name === "shares") ins.shares = v;
        else if (r.name === "ig_reels_avg_watch_time") ins.avgWatchTimeMs = v;
        else if (r.name === "ig_reels_video_view_total_time") ins.totalWatchTimeMs = v;
      }
    } catch (e) { console.warn(`insights ${m.id}: ${e.message}`); }

    await prisma.igPostMetric.create({
      data: {
        postId: post.id, reach: ins.reach ?? null, likes: ins.likes ?? null,
        comments: ins.comments ?? null, saved: ins.saved ?? null, shares: ins.shares ?? null,
        avgWatchTimeMs: ins.avgWatchTimeMs ?? null, totalWatchTimeMs: ins.totalWatchTimeMs ?? null,
      },
    });
    synced++;
  }

  // Account snapshot
  let acct = {};
  try { acct.followers = (await g("me", { fields: "followers_count" })).followers_count; } catch {}
  try {
    const rows = (await g("me/insights", { metric: "reach,profile_views", period: "day", metric_type: "total_value" })).data ?? [];
    for (const r of rows) {
      if (r.name === "reach") acct.reach7d = r.total_value?.value;
      if (r.name === "profile_views") acct.profileVisits7d = r.total_value?.value;
    }
  } catch {}
  await prisma.igAccountSnapshot.create({
    data: { followers: acct.followers ?? null, reach7d: acct.reach7d ?? null, profileVisits7d: acct.profileVisits7d ?? null },
  });

  console.log(`Synced ${synced} posts. Followers: ${acct.followers}, recent reach: ${acct.reach7d}`);
}

run().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
