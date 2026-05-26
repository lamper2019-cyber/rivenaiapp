import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";

/**
 * Dashboard data loader. Only returns what /dashboard actually renders.
 *
 * Recent cleanup: this used to fetch the weekly check-in row, the weekly
 * content prompt, and the daily-quote prompt for the Quick-Actions hero —
 * none of those surfaces live on the dashboard anymore (mood ribbon +
 * Sunday ritual + cheer card replaced them). Pruned accordingly so we
 * don't query four tables for data the UI doesn't read.
 */
export async function loadDashboardData(clerkId: string) {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });
  if (!user || !user.profile) return null;

  const today = startOfCentralDay();

  const [todayTotals, recentCoachMessages] = await Promise.all([
    prisma.dailyTotals.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    }),
    // COACH messages from the last 30 days — drives the persistent "Message
    // from Sean" chip on the home screen. The chip stays visible regardless
    // of read state until the messages age out; the client counts how many
    // are newer than the localStorage "last seen at" timestamp to render the
    // unread dot.
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      return prisma.chatMessage.findMany({
        where: { userId: user.id, kind: "COACH", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      });
    })(),
  ]);

  const dayName = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "America/Chicago",
  });

  return {
    userId: user.id,
    profile: user.profile,
    todayTotals: {
      calories: todayTotals?.totalCalories ?? 0,
      protein: todayTotals?.totalProtein ?? 0,
      fat: todayTotals?.totalFat ?? 0,
      carbs: todayTotals?.totalCarbs ?? 0,
      steps: todayTotals?.totalSteps ?? 0,
    },
    dayName,
    recentCoachMessages: recentCoachMessages.map((m) => ({
      id: m.id,
      // Serialize Date → ISO so the value crosses the server/client boundary.
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
