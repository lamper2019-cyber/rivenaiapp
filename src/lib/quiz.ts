/**
 * RIVEN readiness quiz — the question bank, scoring math, insight bank,
 * and results-page routing. Single source of truth for both the client-side
 * flow (`/quiz/start`) and the results page (`/quiz/results/[id]`).
 *
 * Scoring is dead simple: count "yes" answers in q1–q10. Insights are
 * rule-based pulls from a priority-ranked bank. Q14 maps to a budget tier
 * that the results page uses to route the final CTA.
 */

import { z } from "zod";

// ──────────────────────────── Questions ────────────────────────────

export type YesNo = "yes" | "no";
export type BudgetTier = "FREE" | "APP" | "COACH" | "DONE_FOR_YOU";

export type PracticeQuestion = {
  id: string;
  phase: "practices";
  text: string;
};

export type ChoiceQuestion = {
  id: string;
  phase: "qualifying";
  text: string;
  options: Array<{ value: string; label: string; sub?: string }>;
};

export type TextareaQuestion = {
  id: string;
  phase: "qualifying";
  text: string;
  placeholder?: string;
};

export type Question = PracticeQuestion | ChoiceQuestion | TextareaQuestion;

/** Q1–Q10 — best practices, yes/no. Order is the priority order used for
 *  insight selection (q1 is the highest-leverage lever, q10 is supplemental). */
export const PRACTICE_QUESTIONS: PracticeQuestion[] = [
  {
    id: "q1",
    phase: "practices",
    text: "I eat at least 130g of protein on most days.",
  },
  {
    id: "q2",
    phase: "practices",
    text: "I strength-train 2–3 times per week.",
  },
  {
    id: "q3",
    phase: "practices",
    text: "I walk 7,000+ steps most days.",
  },
  {
    id: "q4",
    phase: "practices",
    text: "I track my meals consistently — not just on \"good\" days.",
  },
  {
    id: "q5",
    phase: "practices",
    text: "I sleep 7 or more hours most nights.",
  },
  {
    id: "q6",
    phase: "practices",
    text: "I adjust how I eat around my cycle (PMS, period, perimenopause).",
  },
  {
    id: "q7",
    phase: "practices",
    text: "I cook at home at least 4 nights a week.",
  },
  {
    id: "q8",
    phase: "practices",
    text: "I eat a protein-anchored breakfast within 2 hours of waking.",
  },
  {
    id: "q9",
    phase: "practices",
    text: "I mostly drink water — not soda, juice, or sweet coffee drinks.",
  },
  {
    id: "q10",
    phase: "practices",
    text: "I weigh in at least once a week.",
  },
];

export const Q11: ChoiceQuestion = {
  id: "q11",
  phase: "qualifying",
  text: "Which best describes you right now?",
  options: [
    { value: "tried_many", label: "I've tried multiple diets — nothing's stuck long-term." },
    { value: "starting", label: "I've never seriously tried — I'm just starting." },
    { value: "rebound", label: "I lost weight years ago, and it came back." },
    { value: "fine_tune", label: "I'm in shape, but I want to fine-tune body recomp." },
    { value: "post_meno", label: "I'm post-menopausal and nothing my doctor says is working." },
  ],
};

export const Q12: ChoiceQuestion = {
  id: "q12",
  phase: "qualifying",
  text: "Your #1 outcome in the next 90 days?",
  options: [
    { value: "lose_weight", label: "Lose 10–20 lbs." },
    { value: "visible_change", label: "See visible body change — clothes fit, mirror looks different." },
    { value: "consistency", label: "Build a rhythm I'll actually stick to." },
    { value: "stop_cycle", label: "Stop the all-or-nothing cycle." },
    { value: "belly_fat", label: "Drop belly fat / waist measurement specifically." },
  ],
};

export const Q13: ChoiceQuestion = {
  id: "q13",
  phase: "qualifying",
  text: "Biggest obstacle in your way?",
  options: [
    { value: "consistency", label: "I can't stay consistent with tracking." },
    { value: "what_to_eat", label: "I don't know what to eat." },
    { value: "hormones", label: "My hormones / cycle / age make it harder." },
    { value: "motivation", label: "I lose motivation after 2–3 weeks." },
    { value: "time", label: "I'm too busy to plan meals." },
    { value: "trust", label: "I've tried everything — I don't trust anything anymore." },
  ],
};

export const Q14: ChoiceQuestion = {
  id: "q14",
  phase: "qualifying",
  text: "Which kind of support would suit you best?",
  options: [
    { value: "free_guide", label: "A PDF guide I can read on my own time" },
    { value: "app", label: "An app with daily structure" },
    { value: "coach", label: "A coach who texts me and checks in weekly" },
    { value: "done_for_you", label: "Done-for-you meal plans + 1:1 coaching" },
  ],
};

export const Q15: TextareaQuestion = {
  id: "q15",
  phase: "qualifying",
  text: "Anything else I should know?",
  placeholder: "Optional — type anything that'll help me give you the right plan.",
};

export const QUALIFYING_QUESTIONS: Question[] = [Q11, Q12, Q13, Q14, Q15];

export const ALL_QUESTIONS: Question[] = [...PRACTICE_QUESTIONS, ...QUALIFYING_QUESTIONS];

/** Translate a stored choice value (e.g. "tried_many") to its human label.
 *  Used by the coach leads dashboard to render Q11–Q14 answers readably. */
export function labelForChoiceAnswer(
  qid: "q11" | "q12" | "q13" | "q14",
  value: string,
): string {
  const map: Record<string, ChoiceQuestion> = {
    q11: Q11,
    q12: Q12,
    q13: Q13,
    q14: Q14,
  };
  return map[qid]?.options.find((o) => o.value === value)?.label ?? value;
}

// ──────────────────────────── Zod schemas ────────────────────────────

export const ContactSchema = z.object({
  firstName: z.string().trim().min(1, "First name required").max(80),
  email: z.string().trim().toLowerCase().email("Valid email required").max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type ContactInput = z.infer<typeof ContactSchema>;

const YesNoEnum = z.enum(["yes", "no"]);
const Q14Enum = z.enum(["free_guide", "app", "coach", "done_for_you"]);

export const AnswersSchema = z.object({
  q1: YesNoEnum,
  q2: YesNoEnum,
  q3: YesNoEnum,
  q4: YesNoEnum,
  q5: YesNoEnum,
  q6: YesNoEnum,
  q7: YesNoEnum,
  q8: YesNoEnum,
  q9: YesNoEnum,
  q10: YesNoEnum,
  q11: z.string().trim().min(1).max(100),
  q12: z.string().trim().min(1).max(100),
  q13: z.string().trim().min(1).max(100),
  q14: Q14Enum,
  q15: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
});
export type Answers = z.infer<typeof AnswersSchema>;

// ──────────────────────────── Scoring ────────────────────────────

export function scoreFromAnswers(answers: Answers): number {
  let yes = 0;
  for (let i = 1; i <= 10; i++) {
    const key = `q${i}` as keyof Answers;
    if (answers[key] === "yes") yes++;
  }
  return yes;
}

export function budgetTierFromAnswers(answers: Answers): BudgetTier {
  switch (answers.q14) {
    case "free_guide":
      return "FREE";
    case "app":
      return "APP";
    case "coach":
      return "COACH";
    case "done_for_you":
      return "DONE_FOR_YOU";
  }
}

// ──────────────────────────── Insights ────────────────────────────

/**
 * Per-practice insight bank. `priority` is the ranking used when picking
 * the top three to show on the results page — higher = more impactful.
 * Each entry has BOTH a corrective version (shown if she answered "no")
 * AND an affirming version (shown if she answered "yes"). The results
 * page mixes them so the page feels like Sean actually read her answers.
 */
const INSIGHT_BANK: Record<
  string,
  { priority: number; corrective: string; affirming: string }
> = {
  q1: {
    priority: 10,
    corrective:
      "Your protein is the lever you're not pulling. Most women your age need 130–160g/day, not 60–80. That's the single biggest miss.",
    affirming:
      "You're hitting your protein. That's the move that keeps muscle on while fat comes off — the foundation everything else sits on.",
  },
  q2: {
    priority: 9,
    corrective:
      "You're not lifting yet. Walking + lifting beats cardio for fat loss after 35. Two sessions a week, an hour each — that's all it takes to start.",
    affirming:
      "You're lifting. That's what protects your metabolism and changes your shape, not just the scale.",
  },
  q3: {
    priority: 8,
    corrective:
      "Steps are the cheapest fat-loss tool you're not using. 7–10k a day, every day, moves more weight than any extra workout.",
    affirming:
      "Your daily steps are dialed in. Most women your age won't believe how much this alone is doing.",
  },
  q4: {
    priority: 7,
    corrective:
      "Without honest data, you're guessing. Thirty days of consistent tracking teaches you more about your body than any diet book ever has.",
    affirming:
      "You're tracking. That's the difference between people who stay stuck and people who actually figure it out.",
  },
  q5: {
    priority: 6,
    corrective:
      "Less than 7 hours of sleep keeps cortisol high and stalls fat loss — your body holds onto everything when it thinks you're under threat.",
    affirming:
      "Your sleep is in. Recovery is when the body actually changes — most people skip this and wonder why nothing moves.",
  },
  q6: {
    priority: 5,
    corrective:
      "Your cycle shifts hunger, cravings, and water weight by 2–3 lbs across the month. Planning around it instead of fighting it is the unlock.",
    affirming:
      "You're working with your cycle, not against it. That's the kind of awareness most programs ignore for women your age.",
  },
  q7: {
    priority: 4,
    corrective:
      "Restaurant meals add 30% in oil, butter, and portion size you can't see. Cooking 4 nights a week is the cleanest line to a real deficit.",
    affirming:
      "You're cooking at home. That alone keeps you in control of the numbers — most people lose the plot here.",
  },
  q8: {
    priority: 3,
    corrective:
      "Skipping breakfast usually pushes you to overshoot at lunch and crash by 3 pm. Front-load protein and the rest of the day takes care of itself.",
    affirming:
      "You're starting the day with protein. That's why your afternoons aren't a sugar hunt.",
  },
  q9: {
    priority: 2,
    corrective:
      "Sweet drinks are hundreds of cal a day that don't fill you up. Cutting them is usually the fastest scale move in the first 30 days.",
    affirming:
      "You drink water. Sounds small. It isn't — most people lose this fight before they even sit down to eat.",
  },
  q10: {
    priority: 1,
    corrective:
      "Weekly weigh-ins give you the trend, not the day-to-day noise. Without them you're flying blind for weeks at a time.",
    affirming:
      "You're weighing in weekly. That's the discipline that keeps you honest before things drift.",
  },
};

export function generateInsights(answers: Answers): string[] {
  type Key = keyof typeof INSIGHT_BANK;
  const allKeys = Object.keys(INSIGHT_BANK) as Key[];
  const noKeys = allKeys.filter((k) => answers[k as keyof Answers] === "no");
  const yesKeys = allKeys.filter((k) => answers[k as keyof Answers] === "yes");

  noKeys.sort((a, b) => INSIGHT_BANK[b].priority - INSIGHT_BANK[a].priority);
  yesKeys.sort((a, b) => INSIGHT_BANK[b].priority - INSIGHT_BANK[a].priority);

  // If she has 3+ gaps, show the 3 highest-priority corrective insights —
  // that's where the leverage is. If everything's a yes, affirm the 3
  // highest-priority practices. Mixed cases fill correctives first, then
  // affirm with her top yeses.
  if (noKeys.length >= 3) {
    return noKeys.slice(0, 3).map((k) => INSIGHT_BANK[k].corrective);
  }
  if (noKeys.length === 0) {
    return yesKeys.slice(0, 3).map((k) => INSIGHT_BANK[k].affirming);
  }
  const out: string[] = [];
  for (const k of noKeys) out.push(INSIGHT_BANK[k].corrective);
  for (const k of yesKeys) {
    if (out.length >= 3) break;
    out.push(INSIGHT_BANK[k].affirming);
  }
  return out;
}

// ──────────────────────────── Score buckets + CTA ────────────────────────────

export type ScoreBucket = {
  headline: string;
  body: string;
};

export function scoreBucket(score: number): ScoreBucket {
  if (score <= 3) {
    return {
      headline: "Plenty of room to build",
      body: "You're at the start. The good news: every change you make moves the needle. You haven't been failing — you've been missing the system.",
    };
  }
  if (score <= 6) {
    return {
      headline: "Solid foundation, big gaps",
      body: "You've got pieces in place — but the gaps are where the work is. With the right plan, the next 12 weeks deliver real visible change.",
    };
  }
  return {
    headline: "Strong execution, refine and go",
    body: "You're already doing the foundations. You don't need rebuilding — you need refinement, accountability, and someone keeping you honest week to week.",
  };
}

export type NextStep = {
  tag: string;        // tiny eyebrow label above the CTA
  copy: string;       // 1–2 sentence framing
  ctaLabel: string;   // button text
  ctaHref: string;    // link target
  note?: string;      // small footnote under the button
};

/**
 * Routes the results-page CTA off Q14. Every tier currently funnels to the
 * $50/mo app trial — that's the only offer that exists today. The framing
 * changes so the right person sees the right pitch. When 1:1 coaching opens,
 * the COACH / DONE_FOR_YOU branches get their own routes.
 */
export function nextStepFor(tier: BudgetTier, firstName: string): NextStep {
  switch (tier) {
    case "FREE":
      return {
        tag: "Your next step",
        copy: `Start with the 7-day RIVEN trial, ${firstName}. No card charged today. See the system from the inside, then decide.`,
        ctaLabel: "Start the free trial",
        ctaHref: "/sign-up",
        note: "Card held on day 8 to continue. Cancel any time before then and pay nothing.",
      };
    case "APP":
      return {
        tag: "Your next step",
        copy: `RIVEN is exactly what you described, ${firstName}. Daily structure, weekly check-ins, your numbers in your pocket. $50/mo with a 7-day trial.`,
        ctaLabel: "Start your 7-day trial",
        ctaHref: "/sign-up",
        note: "Card held on day 8 to continue. Cancel any time before then and pay nothing.",
      };
    case "COACH":
      return {
        tag: "Your next step",
        copy: `${firstName}, 1:1 coaching slots open quarterly. Start the app trial first — Sean reads every active client's data before opening new coaching seats.`,
        ctaLabel: "Start the app trial first",
        ctaHref: "/sign-up",
        note: "Coaching tier opens next quarter. App trial puts you on the shortlist.",
      };
    case "DONE_FOR_YOU":
      return {
        tag: "Your next step",
        copy: `Private RIVEN (meal plans + 1:1) is invite-only, ${firstName}. The app trial is how Sean evaluates fit — start there.`,
        ctaLabel: "Start the app trial",
        ctaHref: "/sign-up",
        note: "Sean reviews every active client for the private tier each quarter.",
      };
  }
}
