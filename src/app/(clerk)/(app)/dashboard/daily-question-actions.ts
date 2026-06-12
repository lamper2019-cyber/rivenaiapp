"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { answerDailyQuestion } from "@/lib/daily-question";

/**
 * Server action for the Circle daily question — used by BOTH the home card
 * and the pinned block in the Circle (one action, two surfaces).
 */

const AnswerSchema = z
  .object({
    choice: z.string().min(1).max(60).optional(),
    body: z.string().trim().min(1).max(280).optional(),
  })
  .refine((v) => v.choice || v.body, { message: "Say a little something." });

export type AnswerResult = { ok: true } | { ok: false; error: string };

export async function answerDailyQuestionAction(
  input: z.infer<typeof AnswerSchema>,
): Promise<AnswerResult> {
  const parsed = AnswerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Say a little something." };

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
  if (!user?.profile) {
    return { ok: false, error: "Finish onboarding to join in." };
  }

  try {
    await answerDailyQuestion(user.id, parsed.data);
  } catch {
    return { ok: false, error: "Couldn't save that. Try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/circle");
  return { ok: true };
}
