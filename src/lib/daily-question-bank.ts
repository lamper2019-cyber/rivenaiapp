/**
 * The Circle's daily question bank — RIVEN hosts the room with one question
 * a day. Lives in code (same pattern as the meal bank): deterministic
 * rotation by Central calendar date, no cron needed to "post" it, edits by
 * PR. 28 questions = a clean 4-week cycle before any repeat.
 *
 * Voice rules: warm, real, culturally hers (Black women 35-55 — food is
 * love, church is structure, family is why). Never therapy-speak, never
 * cheerleader. Every question must be answerable in ONE TAP — the chips do
 * the work; "Mine…" is there for the women with words that day.
 */

export type DailyQuestionOption = { key: string; label: string };

export type DailyQuestion = {
  /** Stable key — DailyAnswer.questionKey points here. Never recycle. */
  key: string;
  question: string;
  options: DailyQuestionOption[];
};

export const DAILY_QUESTION_BANK: DailyQuestion[] = [
  { key: "not-giving-up", question: "What's one thing you're NOT giving up this week?", options: [
    { key: "walk", label: "My morning walk" },
    { key: "sunday-dinner", label: "My Sunday dinner" },
    { key: "peace", label: "My peace" },
  ]},
  { key: "stove-tonight", question: "What's on the stove tonight?", options: [
    { key: "cooking", label: "Something I cooked" },
    { key: "leftovers", label: "Leftovers, no shame" },
    { key: "out-smart", label: "Eating out — smart" },
  ]},
  { key: "doing-it-for", question: "Who are you doing this for — besides you?", options: [
    { key: "kids", label: "My kids" },
    { key: "future-self", label: "My future self" },
    { key: "watching", label: "Somebody watching me" },
  ]},
  { key: "said-no", question: "What did you say no to today?", options: [
    { key: "seconds", label: "Seconds" },
    { key: "drive-thru", label: "The drive-thru" },
    { key: "excuses", label: "My own excuses" },
  ]},
  { key: "thirty-days", question: "What's different about you vs. 30 days ago?", options: [
    { key: "move-more", label: "I move more" },
    { key: "see-food", label: "I see food different" },
    { key: "no-quit", label: "I don't quit on Monday" },
  ]},
  { key: "weekend-move", question: "Weekend plans — what's the move?", options: [
    { key: "meal-prep", label: "Meal prep Sunday" },
    { key: "long-walk", label: "A long walk" },
    { key: "rest", label: "Resting on purpose" },
  ]},
  { key: "hard-part", question: "What's the hardest part of your day, honestly?", options: [
    { key: "cravings-3pm", label: "3pm cravings" },
    { key: "late-kitchen", label: "Late-night kitchen" },
    { key: "starting", label: "Getting started" },
  ]},
  { key: "small-win", question: "Name a small win nobody saw.", options: [
    { key: "water", label: "Drank my water" },
    { key: "one-plate", label: "Stopped at one plate" },
    { key: "got-up", label: "Got up anyway" },
  ]},
  { key: "grandmas-table", question: "What dish from growing up will ALWAYS have a seat at your table?", options: [
    { key: "mac", label: "Mac and cheese" },
    { key: "cornbread", label: "Cornbread" },
    { key: "pound-cake", label: "Pound cake" },
  ]},
  { key: "water-check", question: "Real talk — how's the water going today?", options: [
    { key: "on-it", label: "On it" },
    { key: "halfway", label: "Halfway" },
    { key: "dont-ask", label: "Don't ask" },
  ]},
  { key: "why-today", question: "Why'd you show up today?", options: [
    { key: "promise", label: "I made a promise" },
    { key: "momentum", label: "Momentum" },
    { key: "came-anyway", label: "Didn't feel like it — came anyway" },
  ]},
  { key: "kitchen-rule", question: "One kitchen rule you actually keep?", options: [
    { key: "no-standing", label: "No eating standing up" },
    { key: "plate-it", label: "Plate it, don't bag it" },
    { key: "closes-at-8", label: "Kitchen closes at 8" },
  ]},
  { key: "sunday-dinner", question: "Sunday dinner: what's staying, what's getting smaller?", options: [
    { key: "flavor-stays", label: "Staying: the flavor" },
    { key: "plate-smaller", label: "Smaller: the plate" },
    { key: "both", label: "Both — watch me" },
  ]},
  { key: "moving-today", question: "How are you moving today?", options: [
    { key: "walk", label: "A walk" },
    { key: "gym", label: "The gym" },
    { key: "life-counts", label: "Chasing life — it counts" },
  ]},
  { key: "tell-her", question: "What would you tell the woman who started this?", options: [
    { key: "not-a-diet", label: "It's not a diet" },
    { key: "surprise", label: "You'll surprise yourself" },
    { key: "come-back", label: "Just keep coming back" },
  ]},
  { key: "craving-beat", question: "Last craving you faced — how'd it go?", options: [
    { key: "beat-sweet", label: "Beat something sweet" },
    { key: "beat-fried", label: "Beat something fried" },
    { key: "logged-it", label: "Ate it — logged it though" },
  ]},
  { key: "energy-check", question: "Energy check: where you at?", options: [
    { key: "full", label: "Full tank" },
    { key: "coffee", label: "Running on coffee" },
    { key: "fumes", label: "On fumes but here" },
  ]},
  { key: "nonscale-win", question: "Best non-scale win so far?", options: [
    { key: "clothes", label: "Clothes fit different" },
    { key: "sleep", label: "Sleeping better" },
    { key: "noticed", label: "People noticed" },
  ]},
  { key: "tonight-plan", question: "Tonight — what's the plan?", options: [
    { key: "cook-lock", label: "Cook it and lock it in" },
    { key: "order-smart", label: "Out — ordering smart" },
    { key: "kitchen-closed", label: "Early night, kitchen closed" },
  ]},
  { key: "one-word", question: "One word for this week so far.", options: [
    { key: "steady", label: "Steady" },
    { key: "messy", label: "Messy" },
    { key: "building", label: "Building" },
  ]},
  { key: "food-peace", question: "What food did you make peace with?", options: [
    { key: "bread", label: "Bread" },
    { key: "rice", label: "Rice" },
    { key: "dessert", label: "Dessert — portioned" },
  ]},
  { key: "show-up-easier", question: "What makes it easier to show up here?", options: [
    { key: "yall", label: "Seeing y'all" },
    { key: "streak", label: "The streak" },
    { key: "riven", label: "RIVEN staying on me" },
  ]},
  { key: "trade-made", question: "What's one trade you made this week?", options: [
    { key: "fries-veg", label: "Fries → something green" },
    { key: "soda-water", label: "Soda → water" },
    { key: "couch-walk", label: "Couch → walk" },
  ]},
  { key: "mirror-talk", question: "What's the mirror saying lately?", options: [
    { key: "getting-there", label: "We're getting there" },
    { key: "snatched", label: "Face looking snatched" },
    { key: "feeling-it", label: "Not checking — feeling it" },
  ]},
  { key: "busy-day-eat", question: "Busiest day of your week — how do you eat on it?", options: [
    { key: "prepped", label: "Prepped and ready" },
    { key: "grab-smart", label: "Grab smart" },
    { key: "weak-spot", label: "That's my weak spot" },
  ]},
  { key: "celebrate-how", question: "How do you celebrate a win — without food?", options: [
    { key: "playlist", label: "New playlist" },
    { key: "something-to-wear", label: "Something to wear" },
    { key: "tell-circle", label: "Telling the Circle" },
  ]},
  { key: "monday-truth", question: "Monday truth: how'd the weekend go?", options: [
    { key: "held", label: "Held the line" },
    { key: "wobbled", label: "Wobbled, recovered" },
    { key: "dont-speak", label: "We don't speak of it" },
  ]},
  { key: "carrying-light", question: "What feels lighter than it used to?", options: [
    { key: "body", label: "My body" },
    { key: "mind", label: "My mind" },
    { key: "grocery-list", label: "My grocery cart" },
  ]},
];

/** Today's Central calendar date as YYYY-MM-DD. */
export function centralDateKey(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/**
 * The question for a given Central date — sequential rotation through the
 * bank so consecutive days never repeat and the cycle restarts cleanly.
 */
export function questionForDate(dayKey: string = centralDateKey()): DailyQuestion {
  const epoch = Date.UTC(2026, 0, 1); // fixed anchor — keep stable forever
  const day = Date.UTC(
    Number(dayKey.slice(0, 4)),
    Number(dayKey.slice(5, 7)) - 1,
    Number(dayKey.slice(8, 10)),
  );
  const index = Math.floor((day - epoch) / 86_400_000);
  const n = DAILY_QUESTION_BANK.length;
  return DAILY_QUESTION_BANK[((index % n) + n) % n];
}
