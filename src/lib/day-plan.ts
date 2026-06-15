import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
import { sendPushToUser } from "@/lib/push";
import { persistMealLog, type MealAnalysis } from "@/lib/meal-pipeline";
import {
  getMeal,
  mealsForSlot,
  type MealIdea,
  type MealSlot,
} from "@/lib/meal-bank";

/**
 * The day-plan brain — "RIVEN already picked your day."
 *
 * This is the Level-3 leap: she opens the app and the deciding is done.
 * Four jobs, one engine:
 *   DECIDE  — pick a dish per slot that fits what's left of her day
 *   PLAN    — the whole day mapped up front (breakfast → snack)
 *   ADJUST  — a ladder, not a single clamp (see computeAdjustment):
 *               1 flat week  → plan runs 100 lighter
 *               2 flat weeks → 150 lighter + Sean gets a coach flag (push)
 *               dropping ≥2 lb/wk → plan runs 100 HEAVIER (we lose steady,
 *               not starving)
 *             Never a "you stalled" screen — the day just shifts, with one
 *             calm line saying why.
 *   LEARN   — taste memory. Swapping away from a dish bumps MealDislike;
 *             at 3+ the picker stops offering it to her, period.
 *
 * Plus the loop-closer: eatDaySlot() converts a pick into a real MealLog
 * through the SAME pipeline as voice logging (persistMealLog), with the
 *bank's macros as gospel. Decide → eat → logged, zero typing.
 *
 * Lazy-build: the plan is created the first time she opens /dashboard each
 * day. No cron needed — the existing riven-coach crons just reference it.
 *
 * Stability over cleverness: picks persist in DayPick and DON'T churn on
 * every reload. A slot only re-picks when (a) it has no row yet, or (b) it's
 * unlocked AND the day's eating has drifted so far that the pick no longer
 * fits (>150 cal over its share). Locked or eaten slots are hers — never
 * touched.
 */

export type SlotState = "passed" | "hero" | "upcoming";

export type PlanSlotView = {
  slot: MealSlot;
  state: SlotState;
  /** Did she log food during this slot's Central-time window today? */
  logged: boolean;
  locked: boolean;
  /** True once "I ate it" converted this pick into a MealLog. */
  eaten: boolean;
  meal: Pick<MealIdea, "id" | "name" | "detail" | "calories" | "protein">;
};

export type AdjustMode = "none" | "flat1" | "flat2" | "fast";

/** One tappable answer on the RIVEN moment. The key routes the action. */
export type MomentChip = { key: string; label: string; primary?: boolean };

/**
 * The RIVEN "moment" — the living top of the day-plan card. The avatar
 * breathes; `line` is what RIVEN says; `chips` are her one-tap answers (empty
 * on a calm day = just a warm hello). This merges the old passive voiceLine
 * with the proactive A+B presence: same spot, now interactive when there's a
 * real reason to be. No live AI — every chip routes to a built action.
 */
export type RivenMoment = {
  kind: "calm" | "flat" | "feedback";
  line: string;
  chips: MomentChip[];
  /** Explainer revealed inline by the "Why?" chip (flat moment only). */
  why: string | null;
};

export type DayPlanView = {
  slots: PlanSlotView[];
  /** The slot whose decision is live right now (time-aware). */
  heroSlot: MealSlot;
  /** Plan's calorie budget — her real target, shifted by the adjust ladder. */
  planCalories: number;
  planProtein: number;
  /** Which rung of the adjustment ladder is active today. */
  adjust: AdjustMode;
  /** Calories still unspent against the plan budget (≥0, for display). */
  caloriesLeft: number;
  /** Protein still to floor (≥0). */
  proteinLeft: number;
  /** RIVEN's one-liner on the card — why today looks the way it does. */
  voiceLine: string;
  /** The interactive RIVEN moment that sits at the top of the card. */
  moment: RivenMoment;
};

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

/** Share of the day's calories each slot carries. */
const SLOT_WEIGHT: Record<MealSlot, number> = {
  breakfast: 0.24,
  lunch: 0.28,
  dinner: 0.36,
  snack: 0.12,
};

/** Central-time hour each slot's window ENDS (exclusive). Snack runs late. */
const SLOT_END_HOUR: Record<MealSlot, number> = {
  breakfast: 11,
  lunch: 15,
  dinner: 21,
  snack: 24,
};

/** Adjustment ladder sizes. */
const FLAT1_TRIM = 100;
const FLAT2_TRIM = 150;
const FAST_EASE = 100;

/** Swapped away this many times → the picker never offers the dish again. */
const DISLIKE_THRESHOLD = 3;

function centralHour(d: Date = new Date()): number {
  return (
    parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        hour12: false,
      }).format(d),
      10,
    ) % 24
  );
}

/** Which slot's window contains this Central hour. */
function slotForHour(hour: number): MealSlot {
  if (hour < SLOT_END_HOUR.breakfast) return "breakfast";
  if (hour < SLOT_END_HOUR.lunch) return "lunch";
  if (hour < SLOT_END_HOUR.dinner) return "dinner";
  return "snack";
}

/**
 * Deterministic per-user-per-day seed so the plan varies day to day (no
 * groundhog-day wings) but is STABLE across reloads of the same day.
 * Plain string hash — no crypto needed, just spread.
 */
function daySeed(userId: string, dayKey: string, slot: string): number {
  const s = `${userId}|${dayKey}|${slot}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Rank a slot's candidates against its calorie share + the protein gap.
 * Lower score = better fit. The seed rotates among near-ties so two members
 * with the same numbers don't all eat the same dinner.
 */
function rankCandidates(
  slot: MealSlot,
  slotBudget: number,
  proteinGapPerSlot: number,
  seed: number,
  excludeIds: Set<string>,
): MealIdea[] {
  const pool = mealsForSlot(slot).filter((m) => !excludeIds.has(m.id));
  const scored = pool.map((m) => {
    // Calorie fit — being over budget hurts 2x more than being under.
    const diff = m.calories - slotBudget;
    const calPenalty = diff > 0 ? diff * 2 : -diff;
    // Protein pull — when she's behind on protein, protein-dense picks win.
    const proteinBonus =
      proteinGapPerSlot > 0 ? Math.min(m.protein, proteinGapPerSlot) * 4 : 0;
    return { m, score: calPenalty - proteinBonus };
  });
  scored.sort((a, b) => a.score - b.score);
  // Rotate among the top 4 near-best so the seed adds day-to-day variety
  // without ever picking a bad fit.
  const top = scored.slice(0, 4);
  const rest = scored.slice(4);
  const offset = top.length > 0 ? seed % top.length : 0;
  const rotated = [...top.slice(offset), ...top.slice(0, offset), ...rest];
  return rotated.map((s) => s.m);
}

/**
 * The ADJUST ladder. Weekly averages over her last ~3 weeks of weigh-ins
 * (same ±0.3 lb "flat" band as the Sunday wrap):
 *   fast  — this week's avg is ≥2 lb BELOW last week's → ease up. Losing
 *           that fast on a cut usually means under-eating; we add back.
 *   flat2 — two consecutive flat weeks → bigger trim + coach flag.
 *   flat1 — one flat week → the standard 100 trim.
 * Thin data never triggers anything (≥10 weigh-ins for flat1/fast, ≥16
 * for flat2) — we never punish a woman for not weighing.
 */
async function computeAdjustment(
  userId: string,
): Promise<{ mode: AdjustMode; delta: number }> {
  const rows = await prisma.dailyWeighIn.findMany({
    where: { userId },
    orderBy: { day: "desc" },
    take: 21,
    select: { weightLb: true },
  });
  if (rows.length < 10) return { mode: "none", delta: 0 };

  const weights = rows.map((r) => r.weightLb);
  const avg = (a: number[]) =>
    a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const w0 = avg(weights.slice(0, 7))!;
  const w1 = avg(weights.slice(7, 14));
  const w2 = avg(weights.slice(14, 21));

  if (w1 == null) return { mode: "none", delta: 0 };

  if (w0 - w1 <= -2) return { mode: "fast", delta: +FAST_EASE };

  const flatNow = Math.abs(w0 - w1) < 0.3;
  const flatBefore = w2 != null && Math.abs(w1 - w2) < 0.3;
  if (flatNow && flatBefore && rows.length >= 16)
    return { mode: "flat2", delta: -FLAT2_TRIM };
  if (flatNow) return { mode: "flat1", delta: -FLAT1_TRIM };
  return { mode: "none", delta: 0 };
}

/**
 * Two flat weeks → Sean hears about it, ONCE a week max (CoachFlag dedup),
 * so the auto-trim never silently replaces the human. Best-effort: a flag
 * failure never blocks the plan.
 */
async function flagCoachFlat2(userId: string): Promise<void> {
  const today = startOfCentralDay();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recent = await prisma.coachFlag.findFirst({
    where: { userId, kind: "flat2", day: { gte: weekAgo } },
    select: { id: true },
  });
  if (recent) return;

  try {
    await prisma.coachFlag.create({
      data: { userId, day: today, kind: "flat2" },
    });
  } catch {
    return; // unique race — someone else flagged in parallel, fine
  }

  const [profile, coaches] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      select: { name: true },
    }),
    prisma.user.findMany({ where: { role: "COACH" }, select: { id: true } }),
  ]);
  const name = profile?.name?.split(/\s+/)[0] ?? "A member";
  await Promise.all(
    coaches.map((coach) =>
      sendPushToUser(coach.id, {
        title: "RIVEN coach flag",
        body: `${name}'s scale has been flat for 2 weeks. Plan auto-trimmed 150 — worth a personal check-in.`,
        url: "/coach/messages",
        tag: `coach-flag-flat2-${userId}`,
      }).catch(() => {}),
    ),
  );
}

/** Yesterday's protein vs her floor — drives the "protein fix" voice line. */
async function proteinLowYesterday(
  userId: string,
  proteinFloor: number,
): Promise<boolean> {
  const yesterday = startOfCentralDay(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const totals = await prisma.dailyTotals.findFirst({
    // @db.Date column — match on the calendar date, same pattern as the
    // daily weigh-in fix. findFirst with a 1-day range sidesteps offsets.
    where: {
      userId,
      date: { gte: yesterday, lt: startOfCentralDay() },
    },
    select: { totalProtein: true },
  });
  if (!totals) return false;
  return totals.totalProtein > 0 && totals.totalProtein < proteinFloor * 0.75;
}

/** RIVEN's one-liner — explicit, calm, no cheerleading. Priority order. */
function pickVoiceLine(args: {
  adjust: AdjustMode;
  proteinLow: boolean;
  heroSlot: MealSlot;
  caloriesLeft: number;
}): string {
  if (args.adjust === "fast")
    return "You're dropping fast. I added a little back today — we lose steady, not starving.";
  if (args.adjust === "flat2")
    return "Two flat weeks, so I clamped down a little harder today. That's data, not a problem — Sean's been looped in.";
  if (args.adjust === "flat1")
    return "Scale's been flat this week, so I trimmed today by 100. Small clamp — nothing drastic.";
  if (args.proteinLow)
    return "Protein came in low yesterday. Today's picks fix that — just follow the plan.";
  if (args.heroSlot === "dinner" && args.caloriesLeft < 700)
    return "You're close on calories, so tonight's picked light on purpose. Make it, log it.";
  if (args.heroSlot === "breakfast")
    return "Your day's already mapped. Start it right — breakfast's picked.";
  return "Your day's already mapped. All you do is eat it and log it.";
}

/**
 * Build-or-load today's plan. Called from /dashboard with numbers the page
 * already computes (banked calorie target, today's totals, protein floor).
 * Upserts DayPick rows for any slot that needs (re)picking, then returns the
 * full view the card renders.
 */
export async function getOrBuildDayPlan(
  userId: string,
  args: {
    calorieTarget: number;
    caloriesEaten: number;
    proteinFloor: number;
    proteinEaten: number;
  },
): Promise<DayPlanView | null> {
  const today = startOfCentralDay();
  const todayKey = today.toISOString().slice(0, 10);
  const hour = centralHour();
  const heroSlot = slotForHour(hour);

  // Yesterday (Central) — for the "how'd it sit?" feedback moment.
  const yday = startOfCentralDay(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const ydayKey = yday.toISOString().slice(0, 10);

  const [
    adjustment,
    proteinLow,
    existing,
    todaysMeals,
    dislikes,
    ydayDinner,
    ydayRated,
  ] = await Promise.all([
    computeAdjustment(userId),
    proteinLowYesterday(userId, args.proteinFloor),
    prisma.dayPick.findMany({
      where: { userId, day: today },
      select: { slot: true, mealId: true, locked: true, eatenAt: true },
    }),
    prisma.mealLog.findMany({
      where: { userId, createdAt: { gte: today } },
      select: { createdAt: true },
    }),
    prisma.mealDislike.findMany({
      where: { userId, count: { gte: DISLIKE_THRESHOLD } },
      select: { mealId: true },
    }),
    // Did she actually eat last night's planned dinner? (drives the rating ask)
    prisma.dayPick.findFirst({
      where: { userId, day: yday, slot: "dinner", eatenAt: { not: null } },
      select: { mealId: true },
    }),
    // Already rated it? (dedup — the rating writes this category)
    prisma.chatMessage.findFirst({
      where: { userId, category: `riven_mealfeedback_${ydayKey}` },
      select: { id: true },
    }),
  ]);

  // Two flat weeks → make sure Sean knows (deduped to 1x/week inside).
  if (adjustment.mode === "flat2") {
    flagCoachFlat2(userId).catch(() => {});
  }

  const planCalories = args.calorieTarget + adjustment.delta;

  // Which slot windows has she actually logged food in today?
  const loggedSlots = new Set<MealSlot>(
    todaysMeals.map((m) => slotForHour(centralHour(m.createdAt))),
  );

  const bySlot = new Map(existing.map((p) => [p.slot as MealSlot, p]));
  const usedIds = new Set(existing.map((p) => p.mealId));
  // Taste memory — dishes she's swapped away 3+ times never come back.
  const neverOffer = new Set(dislikes.map((d) => d.mealId));
  // (Array.from, not spread — Set spread trips downlevelIteration.)
  const excluded = () =>
    new Set([...Array.from(usedIds), ...Array.from(neverOffer)]);

  // Slots still in play (their window hasn't closed). Passed slots keep
  // whatever pick they had — they're history now, not decisions.
  const upcoming = SLOTS.filter((s) => SLOT_END_HOUR[s] > hour || s === heroSlot);

  // A slot is settled (untouchable) once locked OR eaten.
  const isSettled = (p: { locked: boolean; eatenAt: Date | null } | undefined) =>
    !!p && (p.locked || p.eatenAt != null);

  // What's genuinely left to allocate: the plan budget minus what she's
  // eaten minus calories already committed to SETTLED upcoming picks.
  const settledUpcoming = upcoming
    .map((s) => bySlot.get(s))
    .filter((p): p is NonNullable<typeof p> => isSettled(p));
  const settledCal = settledUpcoming.reduce(
    (sum, p) => sum + (getMeal(p.mealId)?.calories ?? 0),
    0,
  );
  const settledProtein = settledUpcoming.reduce(
    (sum, p) => sum + (getMeal(p.mealId)?.protein ?? 0),
    0,
  );

  const openSlots = upcoming.filter((s) => !isSettled(bySlot.get(s)));
  const openWeight = openSlots.reduce((sum, s) => sum + SLOT_WEIGHT[s], 0);
  const budgetLeft = Math.max(
    planCalories - args.caloriesEaten - settledCal,
    250 * openSlots.length, // floor: never plan a slot below something real
  );
  const proteinGap = Math.max(
    args.proteinFloor - args.proteinEaten - settledProtein,
    0,
  );

  // DECIDE + PLAN: (re)pick each open slot against its share of what's left.
  const writes: { slot: MealSlot; mealId: string }[] = [];
  for (const slot of openSlots) {
    const slotBudget =
      openWeight > 0 ? (budgetLeft * SLOT_WEIGHT[slot]) / openWeight : 0;
    const current = bySlot.get(slot);
    const currentMeal = current ? getMeal(current.mealId) : null;

    // Keep a standing pick unless it's drifted out of fit or she's since
    // 3-strike-disliked it. Stability — the card shouldn't reshuffle every
    // time she opens the app.
    const stillFits =
      currentMeal !== null &&
      currentMeal.calories <= slotBudget + 150 &&
      !neverOffer.has(currentMeal.id);
    if (current && stillFits) continue;

    if (currentMeal) usedIds.delete(currentMeal.id);
    const seed = daySeed(userId, todayKey, slot);
    const ranked = rankCandidates(
      slot,
      slotBudget,
      proteinGap / Math.max(openSlots.length, 1),
      seed,
      excluded(),
    );
    const pick = ranked[0];
    if (!pick) continue;
    usedIds.add(pick.id);
    writes.push({ slot, mealId: pick.id });
    bySlot.set(slot, { slot, mealId: pick.id, locked: false, eatenAt: null });
  }

  // Slots with no row at all that already PASSED today (she opened the app
  // late) still get a pick so the expanded day reads complete — muted, not
  // nagging. Same seed, plain slot-weight budget.
  for (const slot of SLOTS) {
    if (bySlot.has(slot)) continue;
    const seed = daySeed(userId, todayKey, slot);
    const ranked = rankCandidates(
      slot,
      planCalories * SLOT_WEIGHT[slot],
      0,
      seed,
      excluded(),
    );
    const pick = ranked[0];
    if (!pick) continue;
    usedIds.add(pick.id);
    writes.push({ slot, mealId: pick.id });
    bySlot.set(slot, { slot, mealId: pick.id, locked: false, eatenAt: null });
  }

  if (writes.length > 0) {
    await Promise.all(
      writes.map((w) =>
        prisma.dayPick.upsert({
          where: { userId_day_slot: { userId, day: today, slot: w.slot } },
          update: { mealId: w.mealId },
          create: { userId, day: today, slot: w.slot, mealId: w.mealId },
        }),
      ),
    );
  }

  // Assemble the view.
  const slots: PlanSlotView[] = [];
  for (const slot of SLOTS) {
    const pick = bySlot.get(slot);
    const meal = pick ? getMeal(pick.mealId) : null;
    if (!pick || !meal) return null; // bank/row mismatch — card self-hides
    const eaten = pick.eatenAt != null;
    slots.push({
      slot,
      state:
        slot === heroSlot
          ? "hero"
          : SLOT_END_HOUR[slot] <= hour
            ? "passed"
            : "upcoming",
      logged: eaten || loggedSlots.has(slot),
      locked: pick.locked,
      eaten,
      meal: {
        id: meal.id,
        name: meal.name,
        detail: meal.detail,
        calories: meal.calories,
        protein: meal.protein,
      },
    });
  }

  const caloriesLeft = Math.max(planCalories - args.caloriesEaten, 0);
  const proteinLeft = Math.max(args.proteinFloor - args.proteinEaten, 0);

  const voiceLine = pickVoiceLine({
    adjust: adjustment.mode,
    proteinLow,
    heroSlot,
    caloriesLeft,
  });

  // The RIVEN moment — the living top of the card. Priority:
  //   1. "How'd it sit?" — she ate last night's dinner and hasn't rated it.
  //      The genuine question; her answer TUNES her future picks.
  //   2. Flat-scale — RIVEN already trimmed today; offer the "why."
  //   3. Calm — just the warm line, no chips. Presence, not a quiz.
  const ydayMeal = ydayDinner ? getMeal(ydayDinner.mealId) : null;
  let moment: RivenMoment;
  if (ydayDinner && ydayMeal && !ydayRated) {
    moment = {
      kind: "feedback",
      line: `You ate the ${ydayMeal.name.toLowerCase()} last night. How'd it sit?`,
      chips: [
        { key: "felt_good", label: "Felt good", primary: true },
        { key: "too_heavy", label: "Too heavy" },
        { key: "tell_riven", label: "Tell RIVEN" },
      ],
      why: null,
    };
  } else if (adjustment.mode === "flat1" || adjustment.mode === "flat2") {
    moment = {
      kind: "flat",
      line: voiceLine,
      chips: [
        { key: "why", label: "Why?" },
        { key: "tell_riven", label: "Tell RIVEN" },
      ],
      why: "When the scale holds two weeks straight, your body's adjusted to the calories. A small trim restarts the drop — no crash, no starving. That's data, not a problem.",
    };
  } else {
    moment = { kind: "calm", line: voiceLine, chips: [], why: null };
  }

  return {
    slots,
    heroSlot,
    planCalories,
    planProtein: args.proteinFloor,
    adjust: adjustment.mode,
    caloriesLeft,
    proteinLeft,
    voiceLine,
    moment,
  };
}

/**
 * "How'd it sit?" rating on last night's dinner — the answer that teaches
 * the meal engine. "good" keeps it in rotation (default); "heavy" bumps the
 * dislike counter so the picker leans away from it; "told" just records that
 * she opened the chat. Either way a dedup ChatMessage is written so the
 * moment never re-asks for that day. No live AI.
 */
export async function rateYesterdayDinner(
  userId: string,
  verdict: "good" | "heavy" | "told",
): Promise<void> {
  const yday = startOfCentralDay(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const ydayKey = yday.toISOString().slice(0, 10);

  const pick = await prisma.dayPick.findFirst({
    where: { userId, day: yday, slot: "dinner", eatenAt: { not: null } },
    select: { mealId: true },
  });

  const content =
    verdict === "good"
      ? "She said last night's dinner felt good — keeping it in rotation."
      : verdict === "heavy"
        ? "She said last night's dinner was too heavy — leaning lighter for her."
        : "She opened the chat about last night's dinner.";

  // Dedup marker (and a record Sean can see) — category keys the day.
  await prisma.chatMessage.create({
    data: {
      userId,
      role: "ASSISTANT",
      kind: "COACH",
      content,
      category: `riven_mealfeedback_${ydayKey}`,
    },
  });

  if (verdict === "heavy" && pick) {
    await prisma.mealDislike.upsert({
      where: { userId_mealId: { userId, mealId: pick.mealId } },
      update: { count: { increment: 1 } },
      create: { userId, mealId: pick.mealId },
    });
  }
}

/** Lock a slot — she said yes to the pick. Rebalance never touches it now. */
export async function lockDaySlot(
  userId: string,
  slot: MealSlot,
): Promise<void> {
  const today = startOfCentralDay();
  await prisma.dayPick.update({
    where: { userId_day_slot: { userId, day: today, slot } },
    data: { locked: true },
  });
}

/**
 * Swap a slot to the next-best candidate (cycles through the ranked list,
 * skipping meals already used elsewhere today AND her 3-strike dislikes).
 * Swapping unlocks — she's re-deciding, so the new pick waits for her
 * "Lock it in" again.
 *
 * LEARN: every swap-away bumps MealDislike for the dish she rejected. At
 * 3+ the picker stops offering it entirely. The cheapest taste-learning
 * there is — she teaches RIVEN by using the app normally.
 */
export async function swapDaySlot(
  userId: string,
  slot: MealSlot,
): Promise<void> {
  const today = startOfCentralDay();
  const todayKey = today.toISOString().slice(0, 10);

  const [picks, dislikes] = await Promise.all([
    prisma.dayPick.findMany({
      where: { userId, day: today },
      select: { slot: true, mealId: true },
    }),
    prisma.mealDislike.findMany({
      where: { userId, count: { gte: DISLIKE_THRESHOLD } },
      select: { mealId: true },
    }),
  ]);
  const current = picks.find((p) => p.slot === slot);
  if (!current) return;

  const skip = new Set([
    ...picks.filter((p) => p.slot !== slot).map((p) => p.mealId),
    ...dislikes.map((d) => d.mealId),
  ]);
  const seed = daySeed(userId, todayKey, slot);
  const pool = mealsForSlot(slot).filter(
    (m) => !skip.has(m.id) || m.id === current.mealId,
  );
  if (pool.length < 2) return;

  // Same deterministic rotation the picker uses, so "next" is stable: find
  // the current meal in the seed-rotated order and step one forward.
  const offset = seed % pool.length;
  const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
  const idx = rotated.findIndex((m) => m.id === current.mealId);
  const next = rotated[(idx + 1) % rotated.length];

  await Promise.all([
    prisma.dayPick.update({
      where: { userId_day_slot: { userId, day: today, slot } },
      data: { mealId: next.id, locked: false },
    }),
    // Taste memory write — she just said "not this" to the current dish.
    prisma.mealDislike.upsert({
      where: { userId_mealId: { userId, mealId: current.mealId } },
      update: { count: { increment: 1 } },
      create: { userId, mealId: current.mealId },
    }),
  ]);
}

/**
 * EAT-IT-LOGS-IT — the loop closer. Converts a pick into a real MealLog
 * through the same pipeline as voice logging (persistMealLog → DailyTotals
 * recompute), with the bank's macros as gospel. No Claude call, no typing.
 *
 * `overrideMealId` is the eating-out path: "That's what I got" at Wingstop
 * repoints the slot to the venue order and logs it in one move.
 *
 * Idempotent: a slot already eaten today is a no-op (double-tap safe).
 */
export async function eatDaySlot(
  userId: string,
  slot: MealSlot,
  overrideMealId?: string,
): Promise<void> {
  const today = startOfCentralDay();

  const existing = await prisma.dayPick.findUnique({
    where: { userId_day_slot: { userId, day: today, slot } },
    select: { mealId: true, eatenAt: true },
  });
  if (existing?.eatenAt) return;

  const mealId = overrideMealId ?? existing?.mealId;
  if (!mealId) throw new Error("No pick to log for this slot.");
  const meal = getMeal(mealId);
  if (!meal) throw new Error("Unknown meal.");

  // Bank macros are gospel: protein is known; fat/carbs estimated from the
  // remaining calories (45/55 split — typical for these dishes). Honest
  // bookkeeping, not precision theater.
  const proteinCal = meal.protein * 4;
  const remainder = Math.max(meal.calories - proteinCal, 0);
  const fat = Math.round((remainder * 0.45) / 9);
  const carbs = Math.round((remainder * 0.55) / 4);

  const analysis: MealAnalysis = {
    calories: meal.calories,
    protein: meal.protein,
    fat,
    carbs,
    shortName: meal.name.slice(0, 80),
    items: [
      {
        name: meal.name.slice(0, 60),
        calories: meal.calories,
        protein: meal.protein,
        fat,
        carbs,
      },
    ],
    processedFlag: false,
    flagReason: "",
    coaching: meal.venue
      ? "Smart order. You ate out and stayed on plan — that's the skill."
      : "Plan executed. That's how steady wins.",
  };

  await persistMealLog({
    userId,
    description: `${meal.name} — ${meal.detail} (from today's plan)`,
    analysis,
  });

  const now = new Date();
  await prisma.dayPick.upsert({
    where: { userId_day_slot: { userId, day: today, slot } },
    update: { mealId, locked: true, eatenAt: now },
    create: { userId, day: today, slot, mealId, locked: true, eatenAt: now },
  });

  // Auto-share to The Circle (venue eats always; home eats dinner only;
  // one plan-eat post per day). Best-effort — never breaks the log.
  const { maybeSharePlanEat } = await import("@/lib/circle-auto-share");
  await maybeSharePlanEat(userId, meal, slot).catch(() => {});
}
