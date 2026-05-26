"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfCentralMonth } from "@/lib/dates";

/**
 * Submit (or update) this month's check-in. Keyed by month-start in the
 * WeeklyCheckIn.weekStart column — kept the column name to dodge a rename
 * migration. Historical weekly rows coexist with new monthly rows since
 * they have different dates.
 */

const CheckInSchema = z.object({
  weight: z.coerce.number().min(70).max(700),
  waist: z.coerce.number().min(15).max(100),
  photoFrontUrl: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  photoSideUrl: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  menuAdherence: z.enum(["YES", "MOSTLY", "NOT_REALLY"]),
  sleepAvg: z.coerce.number().min(0).max(14),
  cycleStatus: z.enum([
    "PRE_PERIOD",
    "ON_PERIOD",
    "MID_CYCLE",
    "POST_PERIOD",
    "NA",
  ]),
  stress: z.coerce.number().int().min(1).max(10),
  winsAndStruggles: z.string().min(1, "Tell us a wins and struggle from the week").max(2000),
});

export type CheckInFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof CheckInSchema>, string>>;
};

export async function submitCheckIn(
  _prev: CheckInFormState,
  formData: FormData
): Promise<CheckInFormState> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured
        ? "Not signed in."
        : "Add real Clerk keys to .env.local to submit your check-in.",
    };
  }

  const raw = {
    weight: formData.get("weight"),
    waist: formData.get("waist"),
    photoFrontUrl: formData.get("photoFrontUrl") ?? "",
    photoSideUrl: formData.get("photoSideUrl") ?? "",
    menuAdherence: formData.get("menuAdherence"),
    sleepAvg: formData.get("sleepAvg"),
    cycleStatus: formData.get("cycleStatus"),
    stress: formData.get("stress"),
    winsAndStruggles: formData.get("winsAndStruggles"),
  };

  const parsed = CheckInSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: CheckInFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof CheckInSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const data = parsed.data;

  let user;
  try {
    user = await prisma.user.findUnique({ where: { clerkId: userId } });
  } catch {
    return {
      ok: false,
      error:
        "Database not connected. Run `npx prisma migrate dev --name init` against Railway Postgres.",
    };
  }

  if (!user) {
    return { ok: false, error: "Complete onboarding first." };
  }

  // weekStart column now stores month-start. Same upsert shape; the
  // unique constraint on (userId, weekStart) doubles as a per-month idempotency
  // key now that the cadence is monthly.
  const monthStart = startOfCentralMonth();

  await prisma.weeklyCheckIn.upsert({
    where: { userId_weekStart: { userId: user.id, weekStart: monthStart } },
    update: {
      weight: data.weight,
      waist: data.waist,
      photoFrontUrl: data.photoFrontUrl ?? null,
      photoSideUrl: data.photoSideUrl ?? null,
      menuAdherence: data.menuAdherence,
      sleepAvg: data.sleepAvg,
      cycleStatus: data.cycleStatus,
      stress: data.stress,
      winsAndStruggles: data.winsAndStruggles,
    },
    create: {
      userId: user.id,
      weekStart: monthStart,
      weight: data.weight,
      waist: data.waist,
      photoFrontUrl: data.photoFrontUrl ?? null,
      photoSideUrl: data.photoSideUrl ?? null,
      menuAdherence: data.menuAdherence,
      sleepAvg: data.sleepAvg,
      cycleStatus: data.cycleStatus,
      stress: data.stress,
      winsAndStruggles: data.winsAndStruggles,
    },
  });

  // Profile.currentWeight reflects the latest check-in weight.
  await prisma.profile.update({
    where: { userId: user.id },
    data: { currentWeight: data.weight },
  });

  revalidatePath("/check-in");
  revalidatePath("/profile");
  revalidatePath("/dashboard");

  redirect("/dashboard?checkin=submitted");
}
