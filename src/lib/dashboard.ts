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

  // Window for the "latest Sean prompt" headline on the dashboard. Looks
  // back 24 hours so the morning prompt is still surfaced at 9 PM even
  // if she never tapped it; falls back to the time-aware ritual if no
  // Sean message lands inside that window.
  const seanPromptWindow = new Date();
  seanPromptWindow.setHours(seanPromptWindow.getHours() - 24);

  const [
    todayTotals,
    yesterdayTotals,
    recentCoachMessages,
    latestSeanPrompt,
    presentNames,
  ] = await Promise.all([
    prisma.dailyTotals.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    }),
    prisma.dailyTotals.findUnique({
      where: { userId_date: { userId: user.id, date: yesterday } },
    }),
    // COACH messages from the last 30 days — drives the legacy "Message
    // from Sean" chip + unread state for any consumer that still reads
    // it. The new dashboard headline replaces the visible chip but the
    // count + ids are still wired for analytics / future use.
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      return prisma.chatMessage.findMany({
        where: { userId: user.id, kind: "COACH", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      });
    })(),
    // Most recent COACH message in the last 24h — drives the
    // "Today with Sean" headline. If it has chipOptions set and
    // chipsRepliedAt null, the headline renders the tap chips; if
    // it has audioUrl set, it renders an inline audio player;
    // otherwise it just shows the text. No /chat thread — Sean's
    // coaching is a single-surface "ping → tap → done" loop.
    prisma.chatMessage.findFirst({
      where: {
        userId: user.id,
        kind: "COACH",
        createdAt: { gte: seanPromptWindow },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        chipOptions: true,
        chipsRepliedAt: true,
        audioUrl: true,
        audioDurationSec: true,
        createdAt: true,
      },
    }),
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

  // Parse the chipOptions JSON column into a typed array; null/empty
  // means this message doesn't have chips (it's a plain text or audio
  // message from Sean).
  const headlineChips = parseChipOptions(latestSeanPrompt?.chipOptions);

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
    /** "Today with Sean" headline payload. Null when no COACH message
     *  has landed in the last 24h — caller falls back to the time-
     *  aware ritual card. */
    latestSeanPrompt: latestSeanPrompt
      ? {
          id: latestSeanPrompt.id,
          content: latestSeanPrompt.content,
          chips: headlineChips,
          chipsRepliedAt: latestSeanPrompt.chipsRepliedAt
            ? latestSeanPrompt.chipsRepliedAt.toISOString()
            : null,
          audioUrl: latestSeanPrompt.audioUrl,
          audioDurationSec: latestSeanPrompt.audioDurationSec,
          createdAt: latestSeanPrompt.createdAt.toISOString(),
        }
      : null,
    recentCoachMessages: recentCoachMessages.map((m) => ({
      id: m.id,
      // Serialize Date → ISO so the value crosses the server/client boundary.
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

function parseChipOptions(
  raw: unknown,
): Array<{ label: string; value: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ label: string; value: string }> = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).label === "string" &&
      typeof (item as Record<string, unknown>).value === "string"
    ) {
      out.push({
        label: (item as { label: string }).label,
        value: (item as { value: string }).value,
      });
    }
  }
  return out;
}
