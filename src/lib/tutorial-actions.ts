"use server";

import { revalidatePath } from "next/cache";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TUTORIAL_DONE_STEP as DONE_STEP } from "@/lib/tutorial";

export type TutorialActionResult =
  | { ok: true; nextStep: number }
  | { ok: false; error: string };

/**
 * Persists progress through the post-profile tutorial. Called from the
 * client component's "Next" button after the slide animation runs. Idempotent
 * within reason — never moves backward, never past DONE_STEP.
 *
 * The form posts the step the user is moving TO (1..5). Saving on every
 * Next means closing the app mid-tutorial resumes on the same slide.
 */
export async function advanceTutorialStep(
  formData: FormData
): Promise<TutorialActionResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  const rawNext = Number(formData.get("nextStep"));
  if (!Number.isInteger(rawNext) || rawNext < 1 || rawNext > DONE_STEP) {
    return { ok: false, error: "Invalid step." };
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: { profile: { select: { id: true, tutorialStep: true } } },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user?.profile) return { ok: false, error: "Profile not found." };

  // Never move backward. If somehow the request races with another, take the max.
  const nextStep = Math.max(user.profile.tutorialStep, rawNext);

  await prisma.profile.update({
    where: { id: user.profile.id },
    data: { tutorialStep: nextStep },
  });

  revalidatePath("/tutorial");
  if (nextStep >= DONE_STEP) revalidatePath("/dashboard");
  return { ok: true, nextStep };
}

/**
 * Skip / finish — slams the tutorial step to DONE_STEP. Used by both the
 * top-right "Skip" link and the "Let's begin" button on the last slide.
 */
export async function completeTutorial(): Promise<TutorialActionResult> {
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
      include: { profile: { select: { id: true } } },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user?.profile) return { ok: false, error: "Profile not found." };

  await prisma.profile.update({
    where: { id: user.profile.id },
    data: { tutorialStep: DONE_STEP },
  });

  revalidatePath("/tutorial");
  revalidatePath("/dashboard");
  return { ok: true, nextStep: DONE_STEP };
}
