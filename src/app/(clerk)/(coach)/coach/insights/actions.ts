"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncInstagram, type SyncResult } from "@/lib/instagram-sync";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

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
  | { ok: true; postsSynced: number; errors: string[] }
  | { ok: false; error: string };

/** Manual "Sync now" — same job the daily cron runs, on demand. */
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

  revalidatePath("/coach/insights");
  return { ok: true, postsSynced: result.postsSynced, errors: result.errors };
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

export type IdeasResult = { ok: true; ideas: string[] } | { ok: false; error: string };

/**
 * "What to post next" — reads Sean's best-reaching analyzed posts and asks
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

  try {
    const client = getAnthropicClient();
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `You write Instagram hooks for Sean, a weight-loss coach for Black women 35+. Voice: calm, direct, no hype, culturally grounded ("peaceful discipline, steady wins"). No therapy clichés, no "you got this".

His best-reaching hooks so far:
${seed}

Give 3 NEW reel hooks that lean into what's clearly working above (story + transformation + cultural-food angles beat generic tips). One line each, scroll-stopping, in his voice. Reply ONLY as a JSON array of 3 strings, nothing else.`,
      }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "[]";
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const ideas = JSON.parse(cleaned);
    if (!Array.isArray(ideas)) throw new Error("bad format");
    return { ok: true, ideas: ideas.map(String).slice(0, 3) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Generation failed." };
  }
}
