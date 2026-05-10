"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfIsoWeek } from "@/lib/week";
import { getPromptForWeek } from "@/lib/content-prompts";

const SubmitSchema = z.object({
  videoUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  photoUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type SubmitContentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitContent(
  _prev: SubmitContentResult,
  formData: FormData
): Promise<SubmitContentResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured
        ? "Not signed in."
        : "Add real Clerk keys to .env.local to submit your recording.",
    };
  }

  const parsed = SubmitSchema.safeParse({
    videoUrl: formData.get("videoUrl") ?? "",
    photoUrl: formData.get("photoUrl") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (!parsed.data.videoUrl && !parsed.data.photoUrl) {
    return {
      ok: false,
      error: "Upload a video or a photo before submitting.",
    };
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { clerkId: userId } });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Complete onboarding first." };

  const weekStart = startOfIsoWeek(new Date());
  const prompt = getPromptForWeek(weekStart);

  await prisma.contentSubmission.create({
    data: {
      userId: user.id,
      week: weekStart,
      promptText: `${prompt.title}: ${prompt.prompt}`,
      videoUrl: parsed.data.videoUrl ?? null,
      photoUrl: parsed.data.photoUrl ?? null,
    },
  });

  revalidatePath("/content");
  revalidatePath("/dashboard");

  redirect("/dashboard?content=submitted");
}
