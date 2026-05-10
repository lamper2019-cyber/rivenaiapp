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
  title: string;
  prompt: string;
  hint: string;
};

const CATEGORY_HINT: Record<ContentPromptCategory, string> = {
  story: "60 seconds. Set the scene — where you were, what was happening, what you felt.",
  insight: "One concrete answer. Skip the throat-clearing.",
  identity: "Honest, not pretty. The mess IS the message.",
  lighter: "Have fun with this one. We laughing.",
};

const RAW: Omit<ContentPrompt, "hint">[] = [
  // ── STORY-DRIVEN (21) ──
  { id: 1, category: "story", title: "The decision moment", prompt: "Tell me about the moment you decided to do something about your weight this time. Where were you? What were you doing? What made it different from every other time you've tried?" },
  { id: 2, category: "story", title: "Almost gave up", prompt: "Tell me about a recent moment when you almost gave up. What was happening? What did you do instead?" },
  { id: 3, category: "story", title: "Old photo reaction", prompt: "Tell me about the last time you saw an old photo of yourself. What did you feel? What did you say to that version of you?" },
  { id: 4, category: "story", title: "Different choice", prompt: "Tell me about a meal recently where you made a different choice than you would have before. Walk me through it." },
  { id: 5, category: "story", title: "Someone noticed", prompt: "Tell me about someone in your life noticing changes in you. What did they say? How did it feel?" },
  { id: 6, category: "story", title: "Different in a store", prompt: "Tell me about a moment in a store — clothes, grocery, anywhere — where something felt different than it used to." },
  { id: 7, category: "story", title: "Said no", prompt: "Tell me about a time recently you said no to something you would've said yes to before. Food, plans, anything." },
  { id: 8, category: "story", title: "The hardest day", prompt: "Tell me about a hard day you've had on this journey. What got you through it?" },
  { id: 9, category: "story", title: "Workout shift", prompt: "Tell me about a workout that felt different than it used to. Not better or worse — different. What surprised you?" },
  { id: 10, category: "story", title: "Mirror moment", prompt: "Tell me about a moment you caught yourself in a mirror or window and didn't recognize who you saw." },
  { id: 11, category: "story", title: "Conversation with another woman", prompt: "Tell me about a conversation with another woman about your body or your journey. What did she say? What did you take from it?" },
  { id: 12, category: "story", title: "Emotional moment", prompt: "Tell me about a time you cried during this process. What was it about?" },
  { id: 13, category: "story", title: "Sunday different", prompt: "Tell me about a Sunday recently — what did you do differently than you used to?" },
  { id: 14, category: "story", title: "Family meal moment", prompt: "Tell me about a family meal recently where things felt different for you. What happened?" },
  { id: 15, category: "story", title: "First time noticing", prompt: "Tell me about the first time you noticed something changing in your body. What was it? Where were you?" },
  { id: 16, category: "story", title: "A win that hit different", prompt: "Tell me about a win recently that hit harder than it should have. Why did it hit you that way?" },
  { id: 17, category: "story", title: "Clothing moment", prompt: "Tell me about a piece of clothing that fits different now. When did you first notice? Walk me through it." },
  { id: 18, category: "story", title: "Family member said something", prompt: "Tell me about something a family member said about your changes — kid, partner, parent, sibling. What was said?" },
  { id: 19, category: "story", title: "Trigger moment handled", prompt: "Tell me about a moment a craving or trigger hit you hard and you handled it differently than you used to." },
  { id: 20, category: "story", title: "Walking story", prompt: "Tell me about a walk you took recently — where were you, what were you thinking, what did it feel like?" },
  { id: 21, category: "story", title: "Something embarrassing", prompt: "Tell me about something embarrassing or vulnerable that happened in this process. Be honest." },

  // ── TRANSFORMATION INSIGHTS (13) ──
  { id: 22, category: "insight", title: "Body surprise", prompt: "What's one thing about your body that's surprised you recently?" },
  { id: 23, category: "insight", title: "New ability", prompt: "What's one thing you can do now that you couldn't do before? Be specific." },
  { id: 24, category: "insight", title: "Food that lost its grip", prompt: "What's a food you used to love that doesn't hit the same anymore?" },
  { id: 25, category: "insight", title: "Food peace", prompt: "What's a food you used to fear that you've made peace with?" },
  { id: 26, category: "insight", title: "Energy or mood shift", prompt: "What's something about your energy or your mood that's different now?" },
  { id: 27, category: "insight", title: "Habit that became normal", prompt: "What's a habit that used to feel impossible that now feels normal?" },
  { id: 28, category: "insight", title: "Belief debunked", prompt: "What's one thing you used to believe about your body that you don't believe anymore?" },
  { id: 29, category: "insight", title: "Quiet body change", prompt: "What's a part of your body that's changing that no one notices but you?" },
  { id: 30, category: "insight", title: "Number moving", prompt: "What's a number on your body that's moving in the right direction? Waist, weight, lift weight, steps — pick one." },
  { id: 31, category: "insight", title: "Now automatic", prompt: "What's something you do automatically now that you had to force yourself to do at the start?" },
  { id: 32, category: "insight", title: "Myth debunked", prompt: "What's the biggest myth about weight loss at your age that you've debunked for yourself?" },
  { id: 33, category: "insight", title: "Body asking for it", prompt: "What's something your body is asking for now that it never used to? Sleep, water, real food, anything." },
  { id: 34, category: "insight", title: "Small win nobody gets", prompt: "What's a small win recently that no one else would understand but you?" },

  // ── IDENTITY / MINDSET (13) ──
  { id: 35, category: "identity", title: "Who you were", prompt: "Who were you when you started this? Describe her in 60 seconds." },
  { id: 36, category: "identity", title: "Who you're becoming", prompt: "Who are you becoming? Not who you're trying to be — who you actually feel yourself becoming." },
  { id: 37, category: "identity", title: "Lie you told yourself", prompt: "What's the lie you used to tell yourself about your weight that you don't believe anymore?" },
  { id: 38, category: "identity", title: "Stopped being embarrassed", prompt: "What's something you used to be embarrassed about that you're not anymore?" },
  { id: 39, category: "identity", title: "Starting over at your age", prompt: "What does 'starting over' feel like for you at your age vs in your 20s?" },
  { id: 40, category: "identity", title: "To your younger self", prompt: "What's one thing you'd tell the 25-year-old version of you about your body?" },
  { id: 41, category: "identity", title: "Stopped apologizing", prompt: "What's something you've stopped apologizing for since starting this?" },
  { id: 42, category: "identity", title: "Discipline redefined", prompt: "What does discipline feel like to you now? Has it changed?" },
  { id: 43, category: "identity", title: "Part of yourself you didn't know", prompt: "What's a part of yourself you didn't know existed until you started this work?" },
  { id: 44, category: "identity", title: "Old story", prompt: "What's the story you used to tell about why you couldn't lose weight? Is that story still true?" },
  { id: 45, category: "identity", title: "Believing you can do this", prompt: "What would it mean to actually believe you can do this?" },
  { id: 46, category: "identity", title: "Who this is for", prompt: "Who is this transformation actually for? Be honest. Yourself? Your husband? Your kids? Why?" },
  { id: 47, category: "identity", title: "Future you", prompt: "What's the version of yourself you're walking toward? Describe her like she's a real person." },

  // ── PRACTICAL / LIGHTER (5) ──
  { id: 48, category: "lighter", title: "Food fail", prompt: "Tell me about a ridiculous food fail you've had recently. We laughing." },
  { id: 49, category: "lighter", title: "Fridge tour", prompt: "Show me what's in your fridge right now and walk me through it." },
  { id: 50, category: "lighter", title: "Cannot believe this is my life", prompt: "What's your 'I cannot believe this is my life now' food or habit?" },
  { id: 51, category: "lighter", title: "Random steps", prompt: "What's the most random place you've gotten your steps in this week?" },
  { id: 52, category: "lighter", title: "Used to roll eyes", prompt: "What's something you used to roll your eyes at fitness people for that you now do?" },
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
