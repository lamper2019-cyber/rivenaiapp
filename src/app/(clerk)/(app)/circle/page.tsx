import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCircleFeed } from "@/lib/community";
import { getDailyQuestionSnapshot } from "@/lib/daily-question";
import { CircleFeed } from "@/components/circle-feed";

// Always fresh — it's a live room.
export const dynamic = "force-dynamic";

/**
 * "The Circle" — the community feed. One room everyone is in. Replaces the
 * old "RIVEN AI" tab; the AI itself now lives in the "Message from RIVEN"
 * thread (the dashboard chip → /chat).
 */
export default async function CirclePage() {
  const { userId } = auth();
  // redirect() stays OUTSIDE try/catch (NEXT_REDIRECT gotcha).
  if (!userId) redirect("/sign-in");

  const user = await prisma.user
    .findUnique({ where: { clerkId: userId }, select: { id: true } })
    .catch(() => null);
  if (!user) redirect("/onboarding");

  const [feed, dailyQuestion] = await Promise.all([
    getCircleFeed(user.id).catch(() => []),
    getDailyQuestionSnapshot(user.id).catch(() => null),
  ]);

  return <CircleFeed initialFeed={feed} dailyQuestion={dailyQuestion} />;
}
