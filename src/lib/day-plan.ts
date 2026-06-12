import { prisma } from "@/lib/prisma";
import { startOfCentralDay } from "@/lib/dates";
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
 * Three jobs, one engine:
 *   DECIDE  — pick a dish per slot that fits what's left of her day
 *   PLAN    — the whole day mapped up front (breakfast → snack)
 *   ADJUST  — when her 7-day scale trend goes flat, quietly trim the plan's
 *             budget by 100 cal. Never a "you stalled" screen — the day just
 *             gets a little tighter, with one calm sage line saying why.
 *
 * Lazy-build: the plan is created the first time she opens /dashboard each
 * day. No cron needed — the existing riven-coach crons just reference it.
 *
 * Stability over cleverness: picks persist in DayPick and DON'T churn on
 * every reload. A slot only re-picks when (a) it has no row yet, or (b) it's
 * unlocked AND the day's eating has drifted so far that the pick no longer
 * fits (>150 cal over its share). Locked slots are hers — never touched.
 */

export type SlotState = "passed" | "hero" | "upcoming";

export type PlanSlotView = {
  slot: MealSlot;
  state: SlotState;
  /** Did she log food during this slot's Central-time window today? */
  logged: boolean;
  locked: boolean;
  meal: Pick<MealIdea, "id" | "name" | "detail" | "calories" | "protein">;
};

export type DayPlanView = {
  slots: PlanSlotView[];
  /** The slot whose decision is live right now (time-aware). */
  heroSlot: MealSlot;
  /** Plan's calorie budget — her real target, minus the trim when flat. */
  planCalories: number;
  planProtein: number;
  /** True when the flat-scale -100 trim is on today. */
  trimmed: boolean;
  /** RIVEN's one-liner on the card — why today looks the way it does. */
  voiceLine: string;
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

const FLAT_TRIM_CAL = 100;

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
 * The ADJUST layer: is her 7-day average flat vs the week before?
 * Mirrors the Sunday-wrap math (±0.3 lb band). Only calls "flat" with at
 * least 10 of the last 14 days weighed — thin data never triggers a trim.
 */
async function isScaleFlat(userId: string): Promise<boolean> {
  const rows = await prisma.dailyWeighIn.findMany({
    where: { userId },
    orderBy: { day: "desc" },
    take: 14,
    select: { weightLb: true },
  });
  if (rows.length < 10) return false;
  const weights = rows.map((r) => r.weightLb);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const thisAvg = avg(weights.slice(0, 7));
  const lastAvg = avg(weights.slice(7));
  return Math.abs(thisAvg - lastAvg) < 0.3;
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
  trimmed: boolean;
  proteinLow: boolean;
  heroSlot: MealSlot;
  caloriesLeft: number;
}): string {
  if (args.trimmed)
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

  // ADJUST: flat scale → the plan budget (not her global target) trims 100.
  const [trimmed, proteinLow, existing, todaysMeals] = await Promise.all([
    isScaleFlat(userId),
    proteinLowYesterday(userId, args.proteinFloor),
    prisma.dayPick.findMany({
      where: { userId, day: today },
      select: { slot: true, mealId: true, locked: true },
    }),
    prisma.mealLog.findMany({
      where: { userId, createdAt: { gte: today } },
      select: { createdAt: true },
    }),
  ]);

  const planCalories = args.calorieTarget - (trimmed ? FLAT_TRIM_CAL : 0);

  // Which slot windows has she actually logged food in today?
  const loggedSlots = new Set<MealSlot>(
    todaysMeals.map((m) => slotForHour(centralHour(m.createdAt))),
  );

  const bySlot = new Map(existing.map((p) => [p.slot as MealSlot, p]));
  const usedIds = new Set(existing.map((p) => p.mealId));

  // Slots still in play (their window hasn't closed). Passed slots keep
  // whatever pick they had — they're history now, not decisions.
  const upcoming = SLOTS.filter((s) => SLOT_END_HOUR[s] > hour || s === heroSlot);

  // What's genuinely left to allocate: the plan budget minus what she's
  // eaten minus calories already committed to LOCKED upcoming picks.
  const lockedUpcoming = upcoming
    .map((s) => bySlot.get(s))
    .filter((p): p is NonNullable<typeof p> => !!p && p.locked);
  const lockedCal = lockedUpcoming.reduce(
    (sum, p) => sum + (getMeal(p.mealId)?.calories ?? 0),
    0,
  );
  const lockedProtein = lockedUpcoming.reduce(
    (sum, p) => sum + (getMeal(p.mealId)?.protein ?? 0),
    0,
  );

  const openSlots = upcoming.filter((s) => !bySlot.get(s)?.locked);
  const openWeight = openSlots.reduce((sum, s) => sum + SLOT_WEIGHT[s], 0);
  const budgetLeft = Math.max(
    planCalories - args.caloriesEaten - lockedCal,
    250 * openSlots.length, // floor: never plan a slot below something real
  );
  const proteinGap = Math.max(
    args.proteinFloor - args.proteinEaten - lockedProtein,
    0,
  );

  // DECIDE + PLAN: (re)pick each open slot against its share of what's left.
  const writes: { slot: MealSlot; mealId: string }[] = [];
  for (const slot of openSlots) {
    const slotBudget =
      openWeight > 0 ? (budgetLeft * SLOT_WEIGHT[slot]) / openWeight : 0;
    const current = bySlot.get(slot);
    const currentMeal = current ? getMeal(current.mealId) : null;

    // Keep a standing pick unless it's drifted out of fit. Stability —
    // the card shouldn't reshuffle every time she opens the app.
    const stillFits =
      currentMeal !== null && currentMeal.calories <= slotBudget + 150;
    if (current && stillFits) continue;

    if (currentMeal) usedIds.delete(currentMeal.id);
    const seed = daySeed(userId, todayKey, slot);
    const ranked = rankCandidates(
      slot,
      slotBudget,
      proteinGap / Math.max(openSlots.length, 1),
      seed,
      usedIds,
    );
    const pick = ranked[0];
    if (!pick) continue;
    usedIds.add(pick.id);
    writes.push({ slot, mealId: pick.id });
    bySlot.set(slot, { slot, mealId: pick.id, locked: false });
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
      usedIds,
    );
    const pick = ranked[0];
    if (!pick) continue;
    usedIds.add(pick.id);
    writes.push({ slot, mealId: pick.id });
    bySlot.set(slot, { slot, mealId: pick.id, locked: false });
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
    slots.push({
      slot,
      state:
        slot === heroSlot
          ? "hero"
          : SLOT_END_HOUR[slot] <= hour
            ? "passed"
            : "upcoming",
      logged: loggedSlots.has(slot),
      locked: pick.locked,
      meal: {
        id: meal.id,
        name: meal.name,
        detail: meal.detail,
        calories: meal.calories,
        protein: meal.protein,
      },
    });
  }

  return {
    slots,
    heroSlot,
    planCalories,
    planProtein: args.proteinFloor,
    trimmed,
    voiceLine: pickVoiceLine({
      trimmed,
      proteinLow,
      heroSlot,
      caloriesLeft: planCalories - args.caloriesEaten,
    }),
  };
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
 * skipping meals already used elsewhere today). Swapping unlocks — she's
 * re-deciding, so the new pick waits for her "Lock it in" again.
 */
export async function swapDaySlot(
  userId: string,
  slot: MealSlot,
): Promise<void> {
  const today = startOfCentralDay();
  const todayKey = today.toISOString().slice(0, 10);

  const picks = await prisma.dayPick.findMany({
    where: { userId, day: today },
    select: { slot: true, mealId: true },
  });
  const current = picks.find((p) => p.slot === slot);
  if (!current) return;

  const usedElsewhere = new Set(
    picks.filter((p) => p.slot !== slot).map((p) => p.mealId),
  );
  const seed = daySeed(userId, todayKey, slot);
  const pool = mealsForSlot(slot).filter((m) => !usedElsewhere.has(m.id));
  if (pool.length < 2) return;

  // Same deterministic rotation the picker uses, so "next" is stable: find
  // the current meal in the seed-rotated order and step one forward.
  const offset = seed % pool.length;
  const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
  const idx = rotated.findIndex((m) => m.id === current.mealId);
  const next = rotated[(idx + 1) % rotated.length];

  await prisma.dayPick.update({
    where: { userId_day_slot: { userId, day: today, slot } },
    data: { mealId: next.id, locked: false },
  });
}
