"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncInstagram, type SyncResult } from "@/lib/instagram-sync";

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
