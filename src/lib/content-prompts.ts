/**
 * Weekly content prompts — Sean's full 52-prompt library, categorized.
 * Time-independent: any prompt works for a client at any stage of her journey.
 * Designed for 60-second video answers; doubles as a marketing-content well.
 *
 * Rotation is per-client (not synchronized) — week 1 of *her* program is
 * prompt #1, week 2 is the next interleaved prompt, etc. The interleave is
 * computed once at module load so consecutive weeks never repeat a category
 * back-to-back (a problem with the previous flat list).
 */

export type ContentPromptCategory = "story" | "insight" | "identity" | "lighter";

export type ContentPrompt = {
  id: number;
  category: ContentPromptCategory;
  /** Short label used on coach-side tiles. */
  title: string;
  /** Single-sentence prompt — surfaced on the dashboard AND on /content. */
  prompt: string;
  /** Single-sentence instruction line shown beneath the prompt on /content. */
  hint: string;
};

const CATEGORY_HINT: Record<ContentPromptCategory, string> = {
  story: "60 seconds. Tell me where you were and what you felt.",
  insight: "One concrete answer. Don't overthink it.",
  identity: "Honest, not pretty.",
  lighter: "Have fun with this one.",
};

const RAW: Omit<ContentPrompt, "hint">[] = [
  // ── STORY-DRIVEN (21) ──
  { id: 1, category: "story", title: "The decision moment", prompt: "What was the moment you finally decided enough was enough?" },
  { id: 2, category: "story", title: "Almost gave up", prompt: "What's a recent moment you almost gave up — and what stopped you?" },
  { id: 3, category: "story", title: "Old photo reaction", prompt: "What did you feel the last time you saw an old photo of yourself?" },
  { id: 4, category: "story", title: "Different choice", prompt: "Tell me about a meal where you made a different choice than the old you would have." },
  { id: 5, category: "story", title: "Someone noticed", prompt: "Who in your life noticed first, and what did they say?" },
  { id: 6, category: "story", title: "Different in a store", prompt: "What's a moment in a store recently where something felt different?" },
  { id: 7, category: "story", title: "Said no", prompt: "What's a 'no' you said this week that the old you would've said yes to?" },
  { id: 8, category: "story", title: "The hardest day", prompt: "What's the hardest day you've had on this — and what got you through?" },
  { id: 9, category: "story", title: "Workout shift", prompt: "What's a workout that felt different lately — not better, just different?" },
  { id: 10, category: "story", title: "Mirror moment", prompt: "When was the last time you caught yourself in a mirror and didn't recognize her?" },
  { id: 11, category: "story", title: "Conversation with another woman", prompt: "What did another woman say about your body or your journey that stuck with you?" },
  { id: 12, category: "story", title: "Emotional moment", prompt: "When was the last time you cried during this — and what was it really about?" },
  { id: 13, category: "story", title: "Sunday different", prompt: "What did you do differently this Sunday?" },
  { id: 14, category: "story", title: "Family meal moment", prompt: "What felt different at a family meal recently?" },
  { id: 15, category: "story", title: "First time noticing", prompt: "When did you first notice your body changing — where were you?" },
  { id: 16, category: "story", title: "A win that hit different", prompt: "What's a small win recently that hit harder than it should have?" },
  { id: 17, category: "story", title: "Clothing moment", prompt: "What's a piece of clothing that fits different now?" },
  { id: 18, category: "story", title: "Family member said something", prompt: "What did a family member say about your changes that landed?" },
  { id: 19, category: "story", title: "Trigger moment handled", prompt: "What's a craving you handled differently this week than the old you would have?" },
  { id: 20, category: "story", title: "Walking story", prompt: "What's a walk you took recently, and what was on your mind?" },
  { id: 21, category: "story", title: "Something embarrassing", prompt: "What's something embarrassing that happened in this process — be honest?" },

  // ── TRANSFORMATION INSIGHTS (13) ──
  { id: 22, category: "insight", title: "Body surprise", prompt: "What's one thing about your body that surprised you this week?" },
  { id: 23, category: "insight", title: "New ability", prompt: "What can you do now that you couldn't six weeks ago?" },
  { id: 24, category: "insight", title: "Food that lost its grip", prompt: "What's a food you used to love that doesn't hit the same anymore?" },
  { id: 25, category: "insight", title: "Food peace", prompt: "What's a food you used to fear that you've made peace with?" },
  { id: 26, category: "insight", title: "Energy or mood shift", prompt: "What's different about your energy or your mood now?" },
  { id: 27, category: "insight", title: "Habit that became normal", prompt: "What's a habit that used to feel impossible that now feels normal?" },
  { id: 28, category: "insight", title: "Belief debunked", prompt: "What's a belief about your body that you've quietly dropped?" },
  { id: 29, category: "insight", title: "Quiet body change", prompt: "What's a part of you that's changing that only you can see?" },
  { id: 30, category: "insight", title: "Number moving", prompt: "What's a number on your body that's moving in the right direction?" },
  { id: 31, category: "insight", title: "Now automatic", prompt: "What do you do automatically now that used to take willpower?" },
  { id: 32, category: "insight", title: "Myth debunked", prompt: "What's the biggest weight-loss myth you've debunked for yourself?" },
  { id: 33, category: "insight", title: "Body asking for it", prompt: "What's your body asking for now that it never used to?" },
  { id: 34, category: "insight", title: "Small win nobody gets", prompt: "What's a small win recently that no one else would get?" },

  // ── IDENTITY / MINDSET (13) ──
  { id: 35, category: "identity", title: "Who you were", prompt: "Who were you when you started this?" },
  { id: 36, category: "identity", title: "Who you're becoming", prompt: "Who are you actually becoming — not who you're trying to be?" },
  { id: 37, category: "identity", title: "Lie you told yourself", prompt: "What's a lie you used to tell yourself that you don't believe anymore?" },
  { id: 38, category: "identity", title: "Stopped being embarrassed", prompt: "What's something you used to be embarrassed about that you're not now?" },
  { id: 39, category: "identity", title: "Starting over at your age", prompt: "What does starting over feel like at your age?" },
  { id: 40, category: "identity", title: "To your younger self", prompt: "What would you tell the 25-year-old version of you about your body?" },
  { id: 41, category: "identity", title: "Stopped apologizing", prompt: "What's something you've stopped apologizing for since starting this?" },
  { id: 42, category: "identity", title: "Discipline redefined", prompt: "What does discipline feel like to you now — has it shifted?" },
  { id: 43, category: "identity", title: "Part of yourself you didn't know", prompt: "What's a part of yourself you didn't know existed until this work?" },
  { id: 44, category: "identity", title: "Old story", prompt: "What's the story you used to tell yourself about why you couldn't lose weight?" },
  { id: 45, category: "identity", title: "Believing you can do this", prompt: "What would it mean to actually believe you can do this?" },
  { id: 46, category: "identity", title: "Who this is for", prompt: "Who is this transformation actually for?" },
  { id: 47, category: "identity", title: "Future you", prompt: "What's the version of yourself you're walking toward — describe her?" },

  // ── PRACTICAL / LIGHTER (5) ──
  { id: 48, category: "lighter", title: "Food fail", prompt: "What's a ridiculous food fail you had recently?" },
  { id: 49, category: "lighter", title: "Fridge tour", prompt: "What's in your fridge right now — walk me through it?" },
  { id: 50, category: "lighter", title: "Cannot believe this is my life", prompt: "What's your 'I cannot believe this is my life now' moment?" },
  { id: 51, category: "lighter", title: "Random steps", prompt: "What's the most random place you got your steps in this week?" },
  { id: 52, category: "lighter", title: "Used to roll eyes", prompt: "What's something you used to roll your eyes at that you now do?" },
];

export const CONTENT_PROMPTS: ContentPrompt[] = RAW.map((p) => ({
  ...p,
  hint: CATEGORY_HINT[p.category],
}));

/**
 * Build a 52-week rotation order that interleaves categories so a client
 * never gets two prompts of the same category back-to-back unless one
 * category is exhausted. Greedy "lowest fraction-used wins" — story prompts
 * (largest pool) end up spread evenly across the year.
 */
function buildInterleavedRotation(prompts: ContentPrompt[]): number[] {
  const byCategory = new Map<ContentPromptCategory, ContentPrompt[]>();
  for (const p of prompts) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push(p);
  }

  const cats = Array.from(byCategory.keys());
  const totals = new Map<ContentPromptCategory, number>(
    cats.map((c) => [c, byCategory.get(c)!.length])
  );
  const used = new Map<ContentPromptCategory, number>(cats.map((c) => [c, 0]));

  const order: number[] = [];
  let lastCat: ContentPromptCategory | null = null;

  while (order.length < prompts.length) {
    // Lowest used/total ratio wins, with a soft penalty for repeating the last category.
    let pick: ContentPromptCategory | null = null;
    let bestScore = Infinity;
    for (const cat of cats) {
      const remaining = totals.get(cat)! - used.get(cat)!;
      if (remaining === 0) continue;
      const ratio = used.get(cat)! / totals.get(cat)!;
      // Penalty for repeating the same category as last pick (broken only if
      // it's the only category left with stock).
      const repeatPenalty = cat === lastCat ? 0.5 : 0;
      const score = ratio + repeatPenalty;
      if (score < bestScore) {
        bestScore = score;
        pick = cat;
      }
    }
    if (!pick) break;

    const list = byCategory.get(pick)!;
    const i = used.get(pick)!;
    order.push(list[i].id);
    used.set(pick, i + 1);
    lastCat = pick;
  }

  return order;
}

const ROTATION_ORDER: number[] = buildInterleavedRotation(CONTENT_PROMPTS);
const PROMPT_BY_ID = new Map(CONTENT_PROMPTS.map((p) => [p.id, p]));

/**
 * Pick the prompt for a specific week in a client's own journey.
 * Week 1 = first week after onboarding. After week 52, cycles back to week 1.
 */
export function getPromptForClientWeek(weekNumber: number): ContentPrompt {
  if (!Number.isFinite(weekNumber) || weekNumber < 1) weekNumber = 1;
  const idx = (Math.floor(weekNumber) - 1) % ROTATION_ORDER.length;
  return PROMPT_BY_ID.get(ROTATION_ORDER[idx])!;
}

/**
 * How many weeks (1-indexed) into her program a client is, given her
 * onboarding date.
 */
export function getClientWeekNumber(onboardedAt: Date, now: Date = new Date()): number {
  const ms = now.getTime() - onboardedAt.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(days / 7) + 1);
}
