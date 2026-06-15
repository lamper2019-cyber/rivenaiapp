"use server";

import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { answerForMember, type AskTurn } from "@/lib/riven-ask";

/**
 * "Ask RIVEN" — the member-facing two-way brain. Resolves her DB id, then
 * answers her question from her own data. Returns just the text; the client
 * decides whether to speak it (voice is gated on the brief + mic).
 */

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

const AskSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z.array(TurnSchema).max(12).optional(),
});

export type AskRivenResult =
  | { ok: true; answer: string }
  | { ok: false; error: string };

export async function askRivenAction(
  input: z.infer<typeof AskSchema>,
): Promise<AskRivenResult> {
  const parsed = AskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ask me something." };

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
      select: { id: true },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Account not found." };

  return answerForMember(
    user.id,
    parsed.data.question,
    (parsed.data.history ?? []) as AskTurn[],
  );
}
