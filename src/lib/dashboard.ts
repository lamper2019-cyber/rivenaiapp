import { prisma } from "@/lib/prisma";
import { startOfIsoWeek } from "@/lib/week";
import { getPromptForWeek } from "@/lib/content-prompts";

export async function loadDashboardData(clerkId: string) {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });
  if (!user || !user.profile) return null;

  const today = startOfDay(new Date());
  const weekStart = startOfIsoWeek(new Date());

  const [todayTotals, weekCheckIn, weekContent] = await Promise.all([
    prisma.dailyTotals.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    }),
    prisma.weeklyCheckIn.findUnique({
      where: { userId_weekStart: { userId: user.id, weekStart } },
      select: { id: true, weight: true, waist: true, createdAt: true },
    }),
    prisma.contentSubmission.findFirst({
      where: { userId: user.id, week: weekStart },
      orderBy: { createdAt: "desc" },
      select: { id: true, videoUrl: true, photoUrl: true, promptText: true, createdAt: true },
    }),
  ]);

  const prompt = getPromptForWeek(weekStart);
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const isCheckInDay = ["Sunday", "Monday"].includes(dayName);

  return {
    profile: user.profile,
    todayTotals: {
      calories: todayTotals?.totalCalories ?? 0,
      protein: todayTotals?.totalProtein ?? 0,
      fat: todayTotals?.totalFat ?? 0,
      carbs: todayTotals?.totalCarbs ?? 0,
      steps: todayTotals?.totalSteps ?? 0,
    },
    weekCheckIn,
    weekContent,
    weekStart,
    prompt,
    isCheckInDay,
    dayName,
  };
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
