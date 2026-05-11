"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, currentUser, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateTargets } from "@/lib/calculations";

const ProfileInputSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  age: z.coerce.number().int().min(18, "Must be 18 or older").max(100),
  heightFeet: z.coerce.number().int().min(4).max(7),
  heightInches: z.coerce.number().int().min(0).max(11),
  currentWeight: z.coerce.number().min(70).max(700),
  goalWeight: z.coerce.number().min(70).max(700),
  activityLevel: z.enum(["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"]),
  cycleStatus: z.enum(["REGULAR", "PERIMENOPAUSAL", "MENOPAUSAL", "NA"]),
});

export type ProfileFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof ProfileInputSchema>, string>>;
};

export async function createProfile(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured
        ? "Not signed in. Please sign in and try again."
        : "Add real Clerk keys to .env.local to save your profile. The form renders here for design review.",
    };
  }

  const raw = {
    name: formData.get("name"),
    age: formData.get("age"),
    heightFeet: formData.get("heightFeet"),
    heightInches: formData.get("heightInches"),
    currentWeight: formData.get("currentWeight"),
    goalWeight: formData.get("goalWeight"),
    activityLevel: formData.get("activityLevel"),
    cycleStatus: formData.get("cycleStatus"),
  };

  const parsed = ProfileInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: ProfileFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof ProfileInputSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const data = parsed.data;
  const totalHeightInches = data.heightFeet * 12 + data.heightInches;

  const targets = calculateTargets({
    age: data.age,
    heightInches: totalHeightInches,
    currentWeight: data.currentWeight,
    goalWeight: data.goalWeight,
    activityLevel: data.activityLevel,
  });

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    `${userId}@noemail.local`;

  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    update: { email },
    create: { clerkId: userId, email, role: "CLIENT" },
  });

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: {
      name: data.name,
      age: data.age,
      heightInches: totalHeightInches,
      currentWeight: data.currentWeight,
      goalWeight: data.goalWeight,
      startWeight: data.currentWeight,
      activityLevel: data.activityLevel,
      cycleStatus: data.cycleStatus,
      ...targets,
    },
    create: {
      userId: user.id,
      name: data.name,
      age: data.age,
      heightInches: totalHeightInches,
      startWeight: data.currentWeight,
      currentWeight: data.currentWeight,
      goalWeight: data.goalWeight,
      activityLevel: data.activityLevel,
      cycleStatus: data.cycleStatus,
      phase: "PHASE_1",
      // New users land on slide 0 of the post-profile tutorial. Existing
      // profiles keep the schema default (5 = already complete) so we never
      // run the walkthrough against people already mid-program.
      tutorialStep: 0,
      ...targets,
    },
  });

  redirect("/tutorial");
}
