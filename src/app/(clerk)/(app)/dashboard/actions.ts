"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const StepsSchema = z.object({
  steps: z.coerce.number().int().min(0).max(100000),
});

export type LogStepsResult = { ok: true; steps: number } | { ok: false; error: string };

export async function logSteps(formData: FormData): Promise<LogStepsResult> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  const parsed = StepsSchema.safeParse({ steps: formData.get("steps") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid steps" };
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { clerkId: userId } });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user) return { ok: false, error: "Complete onboarding first." };

  const today = startOfDay(new Date());
  await prisma.dailyTotals.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    update: { totalSteps: parsed.data.steps },
    create: {
      userId: user.id,
      date: today,
      totalSteps: parsed.data.steps,
    },
  });

  revalidatePath("/dashboard");
  return { ok: true, steps: parsed.data.steps };
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
