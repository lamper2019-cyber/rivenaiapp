import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import {
  getOtherClientsPresent,
  markUserPresent,
} from "@/lib/presence";
import {
  currentRitualSlot,
  pickMorningFocus,
  type MorningFocus,
  type RitualSlot,
} from "@/lib/ritual-of-day";

/**
 * Dashboard data loader. Returns just what /dashboard renders.
 *
 * As of the time-aware ritual change, this also:
 *   - Stamps User.lastDashboardSeenAt (presence ping)
 *   - Reads other active clients' presence (who's here right now)
 *   - Picks the morning focus from yesterday's data
 *   - Returns the current ritual slot (morning/midday/evening/night)
 */
export async function loadDashboardData(clerkId: string) {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });
  if (!user || !user.profile) return null;

  const today = startOfCentralDay();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Stamp presence (best-effort, never blocks the dashboard).
  await markUserPresent(user.id);

  const [
    todayTotals,
    yesterdayTotals,
    recentCoachMessages,
    presentNames,
  ] = await Promise.all([
    prisma.dailyTotals.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    }),
    prisma.dailyTotals.findUnique({
      where: { userId_date: { userId: user.id, date: yesterday } },
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
    getOtherClientsPresent(user.id),
  ]);

  const dayName = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "America/Chicago",
  });

  const ritualSlot: RitualSlot = currentRitualSlot();

  // Morning focus uses yesterday's data. Defaults to "not hit" if she
  // didn't log so the prompt nudges her toward today's protein.
  const morningFocus: MorningFocus = pickMorningFocus({
    yesterdayProteinHit:
      (yesterdayTotals?.totalProtein ?? 0) >= user.profile.proteinFloor,
    yesterdayStepsK: (yesterdayTotals?.totalSteps ?? 0) / 1000,
    proteinFloorG: user.profile.proteinFloor,
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
    ritualSlot,
    morningFocus,
    presentNames,
    recentCoachMessages: recentCoachMessages.map((m) => ({
      id: m.id,
      // Serialize Date → ISO so the value crosses the server/client boundary.
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
