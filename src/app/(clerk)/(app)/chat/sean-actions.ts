"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Client-side action: chip-tap reply to a Sean prompt.
 *
 * As of 2026-05-27 the only caller is SeanPromptHeadline on /dashboard.
 * /chat is retired (it redirects home), there is no bottom input, and
 * the AI auto-reply pipeline is shut off — Sean's coaching is now a
 * "ping → tap → done" loop, not a thread.
 *
 * Effect:
 *   1. Persist her USER message (kind=COACH) so Sean's /coach/messages
 *      view shows the response.
 *   2. If this is a chip-reply, stamp chipsRepliedAt on the Sean prompt
 *      so the chips collapse on next render.
 *
 * No AI scheduler call. No /chat revalidate (no page to refresh).
 *
 * `message` doubles as the chip value — passing it explicitly keeps
 * the schema backward-compatible with any old caller that might still
 * route through here (e.g., a stale offline-queued tap firing after
 * the deploy).
 */

const SendSchema = z.object({
  message: z
    .string()
    .min(1, "Message is required")
    .max(2000, "Keep messages under 2000 characters")
    .transform((s) => s.trim()),
  imageUrls: z
    .array(z.string().url())
    .max(4, "At most 4 images per message")
    .optional()
    .default([]),
  /** The Sean message whose chips she tapped. Used to mark chipsRepliedAt
   *  so the chips don't re-render. Only set when this is a chip reply. */
  chipMessageId: z.string().optional(),
});

export type SendToSeanResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendToSean(
  input: z.infer<typeof SendSchema>,
): Promise<SendToSeanResult> {
  const parsed = SendSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, profile: { select: { id: true } } },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Account not found." };
  if (!user.profile) {
    return { ok: false, error: "Complete onboarding before messaging Sean." };
  }

  // 1. Persist her message. Always kind=COACH role=USER on the unified
  //    thread — the existing ChatMessageKind enum has only {AI, COACH},
  //    so the role column carries direction.
  const userMessage = await prisma.chatMessage.create({
    data: {
      userId: user.id,
      role: "USER",
      kind: "COACH",
      content: parsed.data.message,
      imageUrls: parsed.data.imageUrls ?? [],
    },
    select: { id: true },
  });

  // 2. If this is a chip-reply, stamp chipsRepliedAt on the Sean
  //    message so the chips collapse on next render. Defensive update
  //    gated to that user's own messages so a stale client can't
  //    mark someone else's row.
  if (parsed.data.chipMessageId) {
    await prisma.chatMessage.updateMany({
      where: {
        id: parsed.data.chipMessageId,
        userId: user.id,
        chipsRepliedAt: null,
      },
      data: { chipsRepliedAt: new Date() },
    });
  }

  // The data lands on /coach/messages for Sean and the SeanPromptHeadline
  // re-renders the answered state on /dashboard.
  revalidatePath("/dashboard");
  revalidatePath("/coach/messages");
  return { ok: true, messageId: userMessage.id };
}
