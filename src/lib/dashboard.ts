import { prisma } from "@/lib/prisma";
import { startOfIsoWeek } from "@/lib/week";
import { getPromptForClientWeek, getClientWeekNumber } from "@/lib/content-prompts";

export async function loadDashboardData(clerkId: string) {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });
  if (!user || !user.profile) return null;

  const today = startOfDay(new Date());
  const weekStart = startOfIsoWeek(new Date());

  const [todayTotals, weekCheckIn, weekContent, latestCoachMessage] = await Promise.all([
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
    // Most recent COACH message in the last 30 days — drives the persistent
    // "Message from Sean" chip on the home screen. The chip stays visible
    // regardless of read state until the message ages out; the gold halo
    // only pulses when localStorage says this id hasn't been seen yet.
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      return prisma.chatMessage.findFirst({
        where: { userId: user.id, kind: "COACH", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
    })(),
  ]);

  // Per-client week numbering — week 1 starts the day she finishes onboarding.
  const clientWeek = getClientWeekNumber(user.profile.onboardedAt);
  const prompt = getPromptForClientWeek(clientWeek);
  const dayName = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "America/Chicago",
  });
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
    clientWeek,
    isCheckInDay,
    dayName,
    latestCoachMessage,
  };
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
