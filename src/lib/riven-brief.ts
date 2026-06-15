import { prisma } from "@/lib/prisma";

/**
 * The morning brief — RIVEN's "here's your day, already handled" line. The
 * Jarvis open: she lands and RIVEN tells her where she stands and what today
 * is about, in one breath. Composed deterministically from her data (no LLM —
 * free, instant, predictable). The voice is calm and done-for-her.
 *
 * Returns one or two short sentences. Caller decides whether to also speak it.
 */
export async function getMorningBrief(
  userId: string,
  args: {
    firstName: string;
    weighedToday: boolean;
    proteinFloor: number;
    proteinToday: number;
    heroMealName: string | null;
    heroEaten: boolean;
  },
): Promise<string> {
  const greeting = greetingFor(args.firstName);

  // The trend — her 14-day picture, the thing RIVEN "already read."
  const trend = await weeklyTrendPhrase(userId).catch(() => null);

  // The one move for today, in priority order.
  let move: string;
  if (!args.weighedToday) {
    move = "First, one number on the scale — then your day opens up.";
  } else if (args.heroMealName && !args.heroEaten) {
    move =
      args.proteinToday < args.proteinFloor * 0.5
        ? `Protein's the move today — that's why I set ${args.heroMealName.toLowerCase()}.`
        : `Dinner's handled — ${args.heroMealName.toLowerCase()}. Just follow the plan.`;
  } else if (args.heroEaten) {
    move = "Everything's in. You did the work today — rest into it.";
  } else {
    move = "Your day's already mapped. All you do is eat it and log it.";
  }

  return trend ? `${greeting} ${trend} ${move}` : `${greeting} ${move}`;
}

function greetingFor(name: string): string {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10,
  );
  if (hour < 12) return `Morning, ${name}.`;
  if (hour < 18) return `Afternoon, ${name}.`;
  return `Evening, ${name}.`;
}

/**
 * "You're down half a pound on the week." — compares this week's 7-day
 * average to last week's. Returns null when there isn't enough data yet
 * (RIVEN doesn't make a trend up).
 */
async function weeklyTrendPhrase(userId: string): Promise<string | null> {
  const rows = await prisma.dailyWeighIn.findMany({
    where: { userId },
    orderBy: { day: "desc" },
    take: 14,
    select: { weightLb: true },
  });
  if (rows.length < 4) return null;

  const w = rows.map((r) => r.weightLb);
  const avg = (a: number[]) =>
    a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const thisWk = avg(w.slice(0, 7))!;
  const lastWk = avg(w.slice(7, 14));
  if (lastWk == null) return null;

  const delta = Math.round((thisWk - lastWk) * 10) / 10;
  if (delta <= -0.3) return `You're down ${Math.abs(delta)} on the week.`;
  if (delta >= 0.3) return "Scale ticked up on the week — that's data, not a problem.";
  return "You're holding steady this week.";
}
