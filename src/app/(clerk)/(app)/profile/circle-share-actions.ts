"use server";

import { revalidatePath } from "next/cache";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type SetCircleShareResult =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };

/**
 * "Share my wins to the Circle" toggle. Writes Profile.shareToCircle for the
 * signed-in client only (scoped by clerkId). When ON — the default — milestone
 * moments (weigh-in streaks, comebacks, plan eats) auto-post to the community
 * as BEHAVIOR, never numbers. Turning it off silences future auto-posts; it
 * doesn't delete anything she's already shared (those are hers to report or
 * leave like any post).
 */
export async function setMyCircleShare(
  enabled: boolean,
): Promise<SetCircleShareResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured
        ? "Please sign in and try again."
        : "Add real Clerk keys to .env.local.",
    };
  }

  try {
    const res = await prisma.profile.updateMany({
      where: { user: { clerkId: userId } },
      data: { shareToCircle: enabled },
    });
    if (res.count === 0) {
      return { ok: false, error: "Finish onboarding first." };
    }
  } catch {
    return { ok: false, error: "Couldn't save that just now. Try again." };
  }

  revalidatePath("/profile");
  return { ok: true, enabled };
}
