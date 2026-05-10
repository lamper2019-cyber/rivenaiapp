"use server";

import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clerkClient } from "@clerk/nextjs/server";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Permanently deletes the signed-in client's account.
 *
 * 1. Removes their User row in Postgres — cascading deletes wipe Profile,
 *    MealLog, DailyTotals, WeeklyCheckIn, ContentSubmission, ChatMessage,
 *    and PushSubscription rows.
 * 2. Deletes the Clerk user so they can no longer sign in.
 *
 * Note: R2 photos/videos uploaded under their userId-scoped key prefix are
 * NOT deleted from the bucket — Cloudflare R2 doesn't have a cheap bulk-delete-
 * by-prefix, and orphan media is low-risk (private signed URLs only). If you
 * want it scrubbed, run a one-off `wrangler r2 object delete` script.
 *
 * Designed to be called from the profile page via a confirm dialog.
 */
export async function deleteMyAccount(
  confirmText: string
): Promise<DeleteAccountResult> {
  if (confirmText.trim().toUpperCase() !== "DELETE") {
    return {
      ok: false,
      error: "Type DELETE in all caps to confirm.",
    };
  }

  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured
        ? "Not signed in."
        : "Add real Clerk keys to .env.local.",
    };
  }

  // Delete the DB row first. If Clerk fails after this, they'll have a
  // dangling Clerk session but their data is already gone — preferable to
  // the reverse, where Clerk is deleted but data lingers.
  try {
    await prisma.user.deleteMany({
      where: { clerkId: userId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Database deletion failed.";
    return { ok: false, error: msg };
  }

  // Then delete the Clerk user.
  if (isClerkConfigured) {
    try {
      const client = await clerkClient();
      await client.users.deleteUser(userId);
    } catch {
      // DB already wiped; treat Clerk failure as non-fatal but tell the user
      // their auth account still exists (they can manually delete in Clerk
      // dashboard, or contact support).
      return {
        ok: false,
        error:
          "Your data is deleted but signing you out of Clerk failed. Sign out manually and we'll clean up the rest.",
      };
    }
  }

  redirect("/");
}
