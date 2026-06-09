/**
 * Runs the vision engine over posts that haven't been analyzed yet and stores
 * the result. Bounded per call so a sync or cron run can't blow up on time or
 * cost — it processes the newest unanalyzed posts and catches up over runs.
 */

import { prisma } from "@/lib/prisma";
import { analyzePostVision, isVisionConfigured } from "@/lib/vision";

export type EnrichResult = { enriched: number; errors: string[] };

export async function enrichPendingPosts(limit = 6): Promise<EnrichResult> {
  if (!isVisionConfigured) return { enriched: 0, errors: ["vision not configured (ANTHROPIC_API_KEY)"] };

  const pending = await prisma.igPost.findMany({
    where: { visionAt: null },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });

  let enriched = 0;
  const errors: string[] = [];
  for (const p of pending) {
    try {
      const v = await analyzePostVision({
        mediaType: p.mediaType,
        mediaUrl: p.mediaUrl,
        thumbnailUrl: p.thumbnailUrl,
        caption: p.caption,
      });
      await prisma.igPost.update({
        where: { id: p.id },
        data: {
          hook: v.hook,
          onScreenText: v.onScreenText,
          visualSummary: v.visualSummary,
          contentType: v.contentType,
          whyItWorks: v.whyItWorks,
          transcript: v.transcript,
          visionAt: new Date(),
        },
      });
      enriched++;
    } catch (e) {
      errors.push(`${p.igId}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { enriched, errors };
}
