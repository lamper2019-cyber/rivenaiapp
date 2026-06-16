"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitDailyWeight } from "@/lib/daily-weigh-in";

/**
 * Weigh-in as a conversation turn. The orb home opens by asking her weight;
 * she answers (tap/slider/type), this logs it AND hands back RIVEN's reframe
 * in her voice — the trend read, not just a number. Matches the Weigh-in
 * scenario in docs/design/riven-orb-conversations.html.
 */

const Schema = z.object({ weight: z.coerce.number().min(70).max(700) });

export type WeighInResult =
  | { ok: true; reply: string }
  | { ok: false; error: string };

export async function weighInAction(
  input: z.infer<typeof Schema>,
): Promise<WeighInResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad number." };
  }

  const { userId } = auth();
  if (!userId) {
    return {
      ok: false,
      error: isClerkConfigured ? "Not signed in." : "Add Clerk keys to .env.local.",
    };
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, profile: { select: { goalWeight: true } } },
    });
  } catch {
    return { ok: false, error: "Database not connected." };
  }
  if (!user?.profile) return { ok: false, error: "Finish onboarding first." };

  const weight = parsed.data.weight;

  // Prior weigh-ins BEFORE today's write — for the trend read.
  const priorRows = await prisma.dailyWeighIn.findMany({
    where: { userId: user.id },
    orderBy: { day: "desc" },
    take: 14,
    select: { weightLb: true },
  });

  try {
    await submitDailyWeight({ userId: user.id, weight });
  } catch {
    return { ok: false, error: "Couldn't save that — try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true, reply: reframe(weight, priorRows.map((r) => r.weightLb), user.profile.goalWeight) };
}

/**
 * RIVEN's reframe — calm, in voice, anchored on the 7-day average (never the
 * day-to-day wiggle). Templated (no LLM — instant, free).
 */
function reframe(weight: number, priorWeights: number[], goal: number): string {
  const yesterday = priorWeights[0] ?? null;
  const avg = (a: number[]) =>
    a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

  // This week's average INCLUDING today vs the prior week.
  const withToday = [weight, ...priorWeights];
  const thisWk = avg(withToday.slice(0, 7))!;
  const lastWk = avg(withToday.slice(7, 14));

  const trend =
    lastWk == null
      ? null
      : Math.round((thisWk - lastWk) * 10) / 10;

  const toGoal = Math.round((weight - goal) * 10) / 10;

  // Lead with the day-over-day reaction, then the number that matters.
  let lead: string;
  if (yesterday == null) {
    lead = `${weight} — that's your starting line. Locked in.`;
  } else {
    const d = Math.round((weight - yesterday) * 10) / 10;
    if (d >= 0.4) {
      lead = `Up ${d} from yesterday — and that's normal. Salt and water move the scale overnight; that's not fat.`;
    } else if (d <= -0.4) {
      lead = `Down ${Math.abs(d)} from yesterday. I'll take it — but the day-to-day isn't the story.`;
    } else {
      lead = `${weight}, basically flat from yesterday. Logged.`;
    }
  }

  let trendLine: string;
  if (trend == null) {
    trendLine = "Keep logging daily — a few more and I'll have your real trend.";
  } else if (trend <= -0.3) {
    trendLine = `Your 7-day average is down ${Math.abs(trend)}. That's the number that matters — real progress.`;
  } else if (trend >= 0.3) {
    trendLine = `Your 7-day average ticked up ${trend} — that's data, not a problem. We'll clamp down a touch this week.`;
  } else {
    trendLine = "Your 7-day average is holding steady. Maintenance is a skill.";
  }

  const goalLine =
    toGoal > 0 ? ` ${toGoal} to go. Steady wins.` : " You're at goal. Steady wins.";

  return `${lead} ${trendLine}${goalLine}`;
}
