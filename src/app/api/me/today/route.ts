import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sumTodayMealMacros } from "@/lib/meal-pipeline";
import { resolveTodayCalorieTarget } from "@/lib/calorie-banking";
import { getDailyWeighSnapshot } from "@/lib/daily-weigh-in";

/**
 * The orb home's live "today" feed — the macro ring + weigh state. Read on
 * load and re-read after every turn so logging a meal in conversation makes
 * the protein ring tick up in real time. Cheap (sums her MealLog rows).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const user = await prisma.user
    .findUnique({ where: { clerkId: userId }, include: { profile: true } })
    .catch(() => null);
  if (!user?.profile) {
    return NextResponse.json({ error: "Onboard first." }, { status: 412 });
  }
  const profile = user.profile;

  const [today, banked, weigh] = await Promise.all([
    sumTodayMealMacros(user.id).catch(() => ({ calories: 0, protein: 0, fat: 0, carbs: 0 })),
    resolveTodayCalorieTarget(user.id, profile).catch(() => ({ target: profile.cutCalories })),
    getDailyWeighSnapshot(user.id).catch(() => null),
  ]);

  const calTarget = banked.target;
  return NextResponse.json({
    protein: today.protein,
    proteinFloor: profile.proteinFloor,
    calories: today.calories,
    calTarget,
    calLeft: Math.max(calTarget - today.calories, 0),
    weighedToday: weigh?.weighedToday ?? false,
    prefillWeight: weigh?.prefillWeight ?? profile.currentWeight ?? profile.startWeight,
    goalWeight: weigh?.goalWeight ?? profile.goalWeight,
    firstName: profile.name.split(/\s+/)[0] || "there",
  });
}
