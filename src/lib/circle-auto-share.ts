import { prisma } from "@/lib/prisma";
import { colorForName } from "@/lib/community";
import type { MealIdea } from "@/lib/meal-bank";
import { VENUES } from "@/lib/meal-bank";

/**
 * Circle auto-share — the app posts her wins for her (Strava model: the
 * activity IS the post). Two iron rules:
 *
 *   1. BEHAVIOR, NEVER NUMBERS. "Weighed in. 12 mornings straight." — yes.
 *      Her actual weight — never. Behaviors are pride; numbers are private.
 *
 *   2. MOMENTS, NOT EVERY ACTION. Streak milestones, comebacks, first
 *      weigh-in, plan eats (1/day cap). Ten identical "weighed in" posts a
 *      day reads like bots; we only post the beats worth seeing.
 *
 * Gated by Profile.shareToCircle (default ON — the toggle lives on
 * /profile) and role CLIENT (the coach's test taps never hit the room).
 * The CommunityPost.source column doubles as the dedup key, so a milestone
 * can never post twice. Every caller treats this as best-effort: a share
 * failure must never break a weigh-in or a meal log.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Streak counts that earn a post (then every 30 after 30). */
const STREAK_MILESTONES = new Set([7, 14, 30]);

function centralDateKey(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/** Is auto-share on for this user? Returns her first name when yes. */
async function shareIdentity(
  userId: string,
): Promise<{ firstName: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      profile: { select: { name: true, shareToCircle: true } },
    },
  });
  if (!user?.profile || user.role !== "CLIENT" || !user.profile.shareToCircle)
    return null;
  return { firstName: user.profile.name.trim().split(/\s+/)[0] || "Member" };
}

/** Create the post unless this exact source already posted (dedup). */
async function autoPost(args: {
  userId: string;
  firstName: string;
  kind: "win" | "meal";
  text: string;
  source: string;
}): Promise<void> {
  const dup = await prisma.communityPost.findFirst({
    where: { authorId: args.userId, source: args.source },
    select: { id: true },
  });
  if (dup) return;
  await prisma.communityPost.create({
    data: {
      authorId: args.userId,
      authorName: args.firstName,
      authorColor: colorForName(args.firstName),
      kind: args.kind,
      text: args.text,
      source: args.source,
    },
  });
}

/**
 * Called after every daily weigh-in submit. Decides whether THIS weigh-in
 * is a moment worth the room seeing:
 *   first-ever  → "First weigh-in. It starts today."
 *   comeback    → back on the scale after 3+ missed days
 *   streak      → 7 / 14 / 30, then every 30 mornings straight
 * Everything else stays quiet — the routine Tuesday weigh-in is hers alone.
 */
export async function maybeShareWeighMilestone(userId: string): Promise<void> {
  const who = await shareIdentity(userId);
  if (!who) return;

  const rows = await prisma.dailyWeighIn.findMany({
    where: { userId },
    orderBy: { day: "desc" },
    take: 70,
    select: { day: true },
  });
  if (rows.length === 0) return;

  const todayKey = centralDateKey();
  const dayKeys = rows.map((r) => r.day.toISOString().slice(0, 10));
  // Only react to a weigh-in that actually happened today (the submit path
  // upserts today, so this is belt-and-suspenders against odd calls).
  if (dayKeys[0] !== todayKey) return;

  // First-ever weigh-in.
  if (rows.length === 1) {
    await autoPost({
      userId,
      firstName: who.firstName,
      kind: "win",
      text: "First weigh-in, locked in. It starts today.",
      source: `weigh_first:${todayKey}`,
    });
    return;
  }

  // Gap before today = days between her previous weigh-in and today.
  const prev = new Date(`${dayKeys[1]}T00:00:00Z`).getTime();
  const today = new Date(`${todayKey}T00:00:00Z`).getTime();
  const gapDays = Math.round((today - prev) / DAY_MS) - 1;

  if (gapDays >= 3) {
    await autoPost({
      userId,
      firstName: who.firstName,
      kind: "win",
      text: "Back on the scale after a few days off. That's the hard part, done.",
      source: `weigh_comeback:${todayKey}`,
    });
    return;
  }

  // Consecutive-morning streak ending today.
  let streak = 0;
  let expected = today;
  for (const key of dayKeys) {
    if (new Date(`${key}T00:00:00Z`).getTime() !== expected) break;
    streak++;
    expected -= DAY_MS;
  }

  const isMilestone =
    STREAK_MILESTONES.has(streak) || (streak > 30 && streak % 30 === 0);
  if (!isMilestone) return;

  await autoPost({
    userId,
    firstName: who.firstName,
    kind: "win",
    text: `Weighed in. ${streak} mornings straight.`,
    source: `weigh_streak_${streak}:${todayKey}`,
  });
}

/**
 * Called after eat-it-logs-it. Eating out and staying on plan always earns
 * a post (rare + the story the room needs); home plan eats post for dinner
 * only. Both share one cap: max ONE plan-eat post per member per day.
 */
export async function maybeSharePlanEat(
  userId: string,
  meal: Pick<MealIdea, "name" | "protein" | "venue">,
  slot: string,
): Promise<void> {
  const isVenue = !!meal.venue;
  if (!isVenue && slot !== "dinner") return;

  const who = await shareIdentity(userId);
  if (!who) return;

  const todayKey = centralDateKey();
  const venueLabel = isVenue
    ? VENUES.find((v) => v.id === meal.venue)?.label ?? "out"
    : null;

  await autoPost({
    userId,
    firstName: who.firstName,
    kind: "meal",
    text: venueLabel
      ? `Out at ${venueLabel} and stayed on plan — ${meal.name}.`
      : `Ate the plan tonight — ${meal.name}, ${meal.protein}g protein.`,
    // One per day regardless of venue/home — the date IS the dedup key.
    source: `plan_eat:${todayKey}`,
  });
}
