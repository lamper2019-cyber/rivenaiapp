"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncInstagram, type SyncResult } from "@/lib/instagram-sync";
import { enrichPendingPosts } from "@/lib/post-enrich";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { buildCommandCenter } from "@/lib/insights";
import { isPosthogQueryConfigured, fetchFunnelTotals } from "@/lib/posthog-insights";

/** Guard: only a COACH may run these. Returns the userId on success. */
async function requireCoach(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { role: true },
  });
  if (user?.role !== "COACH") return { ok: false, error: "Coach only." };
  return { ok: true };
}

export type ManualSyncResult =
  | { ok: true; postsSynced: number; enriched: number; errors: string[] }
  | { ok: false; error: string };

/** Manual "Sync now" — same job the daily cron runs, on demand: refresh the
 *  posts/metrics, then run vision + audio transcription over the newest
 *  unanalyzed ones so the reads are grounded in real content. Enrichment is
 *  bounded per click (it can't time out); tap again to catch up the rest. */
export async function runManualSync(): Promise<ManualSyncResult> {
  const gate = await requireCoach();
  if (!gate.ok) return { ok: false, error: gate.error };

  let result: SyncResult;
  try {
    result = await syncInstagram();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed." };
  }
  if (!result.ok) return { ok: false, error: result.errors[0] ?? "Sync failed." };

  let enriched = 0;
  try {
    enriched = (await enrichPendingPosts(8)).enriched;
  } catch {
    /* best-effort — sync still succeeded */
  }

  revalidatePath("/coach/insights");
  return { ok: true, postsSynced: result.postsSynced, enriched, errors: result.errors };
}

export type SetDmsResult = { ok: true } | { ok: false; error: string };

/**
 * Set this week's "qualified DMs" count — the highest-signal metric (people
 * asking "how do I work with you?"). Manual because IG messaging data needs
 * heavy Meta review; a hand-entered number beats no number. We update the
 * latest account snapshot in place rather than spawning a new row.
 */
export async function setQualifiedDms(count: number): Promise<SetDmsResult> {
  const gate = await requireCoach();
  if (!gate.ok) return { ok: false, error: gate.error };

  const clamped = Math.max(0, Math.min(9999, Math.floor(count)));
  const last = await prisma.igAccountSnapshot.findFirst({
    orderBy: { capturedAt: "desc" },
  });
  if (last) {
    await prisma.igAccountSnapshot.update({
      where: { id: last.id },
      data: { qualifiedDmsWeek: clamped },
    });
  } else {
    await prisma.igAccountSnapshot.create({
      data: { qualifiedDmsWeek: clamped },
    });
  }
  revalidatePath("/coach/insights");
  return { ok: true };
}

export type PostIdea = {
  hook: string; // the opening line / scroll-stopper
  format: string; // e.g. "Talking-head reel", "B-roll + captions", "Carousel"
  shotList: string[]; // 2–4 concrete clips/shots to film
  setup: string; // how to record it — angle, framing, where, lighting
  onScreen: string; // the on-screen text / overlay caption
  whyItWillWork: string; // data-backed reason, citing his own patterns
};
export type IdeasResult = { ok: true; ideas: PostIdea[] } | { ok: false; error: string };

/**
 * "What to post next" — reads RIVEN's best-reaching analyzed posts and asks
 * Claude for 3 fresh hook ideas in his voice, leaning into what's working.
 */
export async function generatePostIdeas(): Promise<IdeasResult> {
  const gate = await requireCoach();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!isAnthropicConfigured) return { ok: false, error: "ANTHROPIC_API_KEY not set." };

  const posts = await prisma.igPost.findMany({
    where: { hook: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 40,
    include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  if (posts.length === 0) {
    return { ok: false, error: "No analyzed posts yet — run a sync first." };
  }

  // Rank by reach, take the top performers as the seed.
  const top = posts
    .map((p) => ({ hook: p.hook ?? "", type: p.contentType ?? "other", reach: p.metrics[0]?.reach ?? 0 }))
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 8);
  const seed = top.map((t) => `- "${t.hook}" (${t.type}, ${t.reach} reach)`).join("\n");

  // How each content TYPE performs — so the model's "why it'll work" cites real data.
  const byType = new Map<string, { n: number; reach: number; trials: number }>();
  for (const p of posts) {
    const k = p.contentType ?? "other";
    const e = byType.get(k) ?? { n: 0, reach: 0, trials: 0 };
    e.n += 1;
    e.reach += p.metrics[0]?.reach ?? 0;
    e.trials += p.metrics[0]?.trials ?? 0;
    byType.set(k, e);
  }
  const clusterSummary = Array.from(
    byType,
    ([k, e]) => `${k}: ~${Math.round(e.reach / e.n)} avg reach, ${e.trials} trials (${e.n} posts)`
  ).join("; ");

  try {
    const client = getAnthropicClient();
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2200,
      messages: [{
        role: "user",
        content: `You're the content producer for RIVEN — a weight-loss coach for Black women 35+. Voice: calm, direct, no hype, culturally grounded ("peaceful discipline, steady wins"). No therapy clichés, no "you got this". His content is mostly short reels with on-screen captions (he often doesn't talk on camera) + b-roll.

His best-reaching hooks so far:
${seed}

How each content TYPE performs for him (his real numbers): ${clusterSummary}

Give 3 NEW post concepts that lean into what the DATA above shows is working (story + transformation + cultural-food angles beat generic tips). Each must be SHOOTABLE — tell him exactly what to film, how, what to put on screen, AND why it should work based on his numbers. Reply ONLY as a JSON array of 3 objects, no markdown:
[{"hook":"the scroll-stopping opening line","format":"e.g. B-roll + captions reel | Talking-head reel | Carousel","shotList":["clip 1 to film","clip 2","clip 3"],"setup":"how to record it — phone angle, framing, where, lighting, any props","onScreen":"the exact on-screen text/overlay to type","whyItWillWork":"1 sentence citing his data — e.g. 'your story posts average X reach vs Y for tips'"}]

Keep it TIGHT so all three fit: shotList = exactly 3 clips, max ~8 words each; setup = ONE sentence; onScreen = under 12 words; whyItWillWork = ONE sentence with a number from his data.`,
      }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "[]";
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let raw: unknown;
    try {
      raw = JSON.parse(cleaned);
    } catch {
      // Output may have been truncated mid-array — salvage the complete objects.
      const lastClose = cleaned.lastIndexOf("}");
      try {
        raw = lastClose > 0 ? JSON.parse(cleaned.slice(0, lastClose + 1) + "]") : null;
      } catch {
        raw = null;
      }
    }
    if (!Array.isArray(raw) || raw.length === 0) {
      return { ok: false, error: "That got cut off — tap Generate ideas again." };
    }
    const ideas: PostIdea[] = raw.slice(0, 3).map((o: Record<string, unknown>) => ({
      hook: String(o.hook ?? "").slice(0, 200),
      format: String(o.format ?? "Reel").slice(0, 60),
      shotList: Array.isArray(o.shotList) ? o.shotList.map(String).slice(0, 5) : [],
      setup: String(o.setup ?? "").slice(0, 400),
      onScreen: String(o.onScreen ?? "").slice(0, 300),
      whyItWillWork: String(o.whyItWillWork ?? "").slice(0, 300),
    }));
    return { ok: true, ideas };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Generation failed." };
  }
}

export type PostFixResult =
  | { ok: true; verdict: "win" | "ok" | "flop"; why: string; action: string }
  | { ok: false; error: string };

/**
 * Post Autopsy — the adaptive "what do I do?" read for ONE post. Winners get
 * "why it won + repeat this"; underperformers get "why it missed + redo it
 * like this." Uses the stored vision read + the real metrics so the advice is
 * grounded in what actually happened, in Sean/RIVEN's direct voice.
 */
export async function generatePostFix(igId: string): Promise<PostFixResult> {
  const gate = await requireCoach();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!isAnthropicConfigured) return { ok: false, error: "ANTHROPIC_API_KEY not set." };

  const post = await prisma.igPost.findUnique({
    where: { igId },
    include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  if (!post) return { ok: false, error: "Post not found." };

  // Typical reach baseline so the model can judge over/under-performance.
  const recent = await prisma.igPostMetric.findMany({
    orderBy: { capturedAt: "desc" },
    take: 60,
    select: { reach: true },
  });
  const reaches = recent.map((r) => r.reach ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
  const median = reaches.length ? reaches[Math.floor(reaches.length / 2)] : 0;

  const m = post.metrics[0];
  const reach = m?.reach ?? 0;
  const watch = m?.avgWatchTimeMs != null ? `${(m.avgWatchTimeMs / 1000).toFixed(1)}s avg watch` : "n/a";
  const did =
    (m?.trials ?? 0) > 0 || (m?.quizStarts ?? 0) >= 5 || (median > 0 && reach >= median * 1.8)
      ? "OVER-performed"
      : (median > 0 && reach < median * 0.5) || (m?.avgWatchTimeMs != null && m.avgWatchTimeMs < 3000)
        ? "UNDER-performed"
        : "did okay";

  try {
    const client = getAnthropicClient();
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 350,
      messages: [{
        role: "user",
        content: `You're the content strategist for RIVEN (weight-loss coaching for Black women 35+; calm, no-hype, culturally grounded voice). Analyze ONE Instagram post and tell the founder what to do.

POST
- Caption (what he wrote): "${(post.caption ?? "").slice(0, 700)}"
- Hook (from video frames): "${post.hook ?? "(not analyzed yet)"}"
- On-screen text (from frames): "${(post.onScreenText ?? "").slice(0, 400)}"
- What's shown (from frames): "${post.visualSummary ?? "(not analyzed yet)"}"
- What he SAYS (audio transcript): "${(post.transcript ?? "").slice(0, 1500) || "(none — silent post, or not transcribed yet)"}"
- Type: ${post.contentType ?? "unknown"}
- Numbers: ${reach.toLocaleString()} reach (your median is ~${median.toLocaleString()}), ${watch}, ${m?.saved ?? 0} saves, ${m?.quizStarts ?? 0} quiz starts, ${m?.trials ?? 0} trials.
- It ${did}.

Ground your read in what THIS post is actually about — use the caption, what he SAYS (transcript), the on-screen text, and the visuals above. Name the real topic and quote/paraphrase a specific moment when you can. Do NOT give generic advice and do NOT say "without knowing the hook." If the frame analysis says "(not analyzed yet)", lean on the caption and transcript.

Reply ONLY minified JSON:
{"verdict":"win|ok|flop","why":"1-2 sentences naming the REAL, content-specific reason it did/didn't land for Black women 35+","action":"if it won: how to repeat THIS topic/angle. if it missed: redo it like THIS — a concrete rewrite of the hook for this exact topic. Direct, no fluff, no clichés."}`,
      }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const o = JSON.parse(cleaned);
    const v = o.verdict === "win" || o.verdict === "flop" ? o.verdict : "ok";
    return { ok: true, verdict: v, why: String(o.why ?? "").slice(0, 500), action: String(o.action ?? "").slice(0, 600) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Analysis failed." };
  }
}

export type AskTurn = { role: "user" | "assistant"; content: string };
export type AskResult = { ok: true; answer: string } | { ok: false; error: string };

/**
 * "Ask your data" — the Q&A bubble on /coach/insights. Gathers the real
 * numbers (posts + funnel + member activity), hands them to Claude with the
 * question, and answers ONLY from that data. History is the last few turns so
 * follow-ups ("which one?" "why?") work without persisting anything.
 */
export async function askInsights(
  question: string,
  history: AskTurn[] = [],
): Promise<AskResult> {
  const gate = await requireCoach();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!isAnthropicConfigured) return { ok: false, error: "ANTHROPIC_API_KEY not set." };

  const q = question.trim().slice(0, 500);
  if (!q) return { ok: false, error: "Ask a question first." };

  // ── Gather the data context (best-effort on each source) ──────────
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [cc, funnel7, funnel30, members, weighs7, meals7, circle7, leads] =
    await Promise.all([
      buildCommandCenter().catch(() => null),
      isPosthogQueryConfigured ? fetchFunnelTotals(7).catch(() => null) : null,
      isPosthogQueryConfigured ? fetchFunnelTotals(30).catch(() => null) : null,
      prisma.user
        .count({
          where: {
            role: "CLIENT",
            subscriptionStatus: { in: ["trialing", "active", "comped"] },
          },
        })
        .catch(() => null),
      prisma.dailyWeighIn.count({ where: { createdAt: { gte: weekAgo } } }).catch(() => null),
      prisma.mealLog.count({ where: { createdAt: { gte: weekAgo } } }).catch(() => null),
      prisma.communityPost.count({ where: { createdAt: { gte: weekAgo } } }).catch(() => null),
      prisma.lead.count().catch(() => null),
    ]);

  const postLines = (cc?.posts ?? [])
    .slice(0, 30)
    .map(
      (p) =>
        `- ${p.publishedAt.toISOString().slice(0, 10)} [${p.contentType ?? "?"}/${p.verdict}] "${(p.hook || p.caption).slice(0, 90)}" reach=${p.reach} watch=${p.avgWatchSec ?? "—"}s saves=${p.saved} shares=${p.shares} quiz=${p.quizStarts} trials=${p.trials}`,
    )
    .join("\n");

  const context = `
== FUNNEL (site, internal traffic excluded) ==
Last 7d: ${funnel7 ? `pageSessions=${funnel7.sessions} igVisitors=${funnel7.igVisitors} quizStarts=${funnel7.quizStarts} trials=${funnel7.trials}` : "unavailable"}
Last 30d: ${funnel30 ? `pageSessions=${funnel30.sessions} igVisitors=${funnel30.igVisitors} quizStarts=${funnel30.quizStarts} trials=${funnel30.trials}` : "unavailable"}

== INSTAGRAM ACCOUNT ==
Followers: ${cc?.account.followers ?? "?"} · Reach 7d: ${cc?.account.reach7d ?? "?"} · Qualified DMs this week: ${cc?.account.qualifiedDmsWeek ?? "?"}
Pattern read: ${cc?.pattern ?? "—"}
Format note: ${cc?.formatNote ?? "—"}
Type clusters: ${(cc?.clusters ?? []).map((c) => `${c.key}(n=${c.count}, avgReach=${c.avgReach}, trials=${c.trials}, trend=${c.trend})`).join(" · ") || "—"}
SWOT — S: ${cc?.swot.strengths.join(" / ") || "—"} | W: ${cc?.swot.weaknesses.join(" / ") || "—"} | O: ${cc?.swot.opportunities.join(" / ") || "—"} | T: ${cc?.swot.threats.join(" / ") || "—"}

== POSTS (newest-first metrics) ==
${postLines || "(no posts synced)"}

== APP / MEMBERS ==
Active members (trialing+active+comped): ${members ?? "?"}
Weigh-ins logged last 7d: ${weighs7 ?? "?"} · Meals logged last 7d: ${meals7 ?? "?"} · Circle posts last 7d: ${circle7 ?? "?"}
Quiz leads all-time: ${leads ?? "?"}`.trim();

  const turns = history.slice(-8).map((t) => ({
    role: t.role,
    content: String(t.content).slice(0, 1000),
  }));

  try {
    const client = getAnthropicClient();
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: `You are the data analyst for RIVEN's founder (his coaching app for Black women 35+). Answer his questions USING ONLY the data below. Be direct and specific — lead with the number or the answer, then one or two sentences of "so what." If the data can't answer the question, say exactly what's missing — never invent numbers. Plain English, no fluff, no headers unless comparing several things.

${context}`,
      messages: [...turns, { role: "user" as const, content: q }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    if (!text.trim()) return { ok: false, error: "No answer came back — try again." };
    return { ok: true, answer: text.trim().slice(0, 4000) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ask failed." };
  }
}
