/**
 * Weekly content prompts. The list cycles every 12 ISO weeks.
 *
 * These are placeholder prompts in Sean's voice — Sean said he'd send a final
 * 12. Swap the array contents when his list lands; the rotation logic stays.
 */

export type ContentPrompt = {
  id: number;
  title: string;
  prompt: string;
  hint: string;
};

export const CONTENT_PROMPTS: ContentPrompt[] = [
  {
    id: 1,
    title: "Why now?",
    prompt:
      "What changed — internally or externally — that made you say yes to this program right now, and not six months ago?",
    hint: "60–90 seconds. No preamble. Talk like you're telling a friend on the phone.",
  },
  {
    id: 2,
    title: "The story you've been telling",
    prompt:
      "What's the story you've been telling yourself about your body? When did you start telling it?",
    hint: "Be specific. Was it a moment, a relative, a doctor's office?",
  },
  {
    id: 3,
    title: "Comfort food, traced back",
    prompt:
      "What's a food you reach for when you're stressed or tired? What's it actually replacing?",
    hint: "We're not interested in the food itself. We're interested in what it's standing in for.",
  },
  {
    id: 4,
    title: "Who's rooting for you",
    prompt:
      "Name the people who actually want you to succeed at this. And name who quietly doesn't.",
    hint: "Don't be polite. The honest list helps Sean know who you're walking past.",
  },
  {
    id: 5,
    title: "Concrete future self",
    prompt:
      "Describe one specific scene from your life six months from now where you can tell this worked. What are you wearing, doing, saying?",
    hint: "Specific beats abstract. \"I deadlifted my granddaughter\" beats \"I feel strong.\"",
  },
  {
    id: 6,
    title: "The exercise lie",
    prompt:
      "What's a belief about exercise — about what counts, what's effective, what you can do — that you've been carrying since you were younger? Is it still true?",
    hint: "Most of us are running 1996 software in 2026. Name yours.",
  },
  {
    id: 7,
    title: "Twenty pounds",
    prompt:
      "If you woke up tomorrow twenty pounds lighter, what's the first thing that would be different? Not what you'd look like — what you'd DO.",
    hint: "We're after behavior change, not body change. The body is the byproduct.",
  },
  {
    id: 8,
    title: "Boundary check",
    prompt:
      "What's one boundary you've been avoiding setting? Whose feelings have you been protecting at the cost of your own progress?",
    hint: "This isn't a video for them — it's for you. Say it out loud.",
  },
  {
    id: 9,
    title: "Past full",
    prompt:
      "Think about the last time you ate well past full. What were you actually hungry for in that moment?",
    hint: "Loneliness, anger, exhaustion, joy — name it.",
  },
  {
    id: 10,
    title: "Rest, defined",
    prompt:
      "What does rest actually mean to you? When did you last do that thing — not a substitute, the real thing?",
    hint: "Scrolling is not rest. Be honest.",
  },
  {
    id: 11,
    title: "Proudest meal",
    prompt:
      "Tell us about the meal you were proudest of this week. What made it work?",
    hint: "Could be how you assembled it, who you ate it with, that you didn't skip it. Whatever it is.",
  },
  {
    id: 12,
    title: "Letter to day-one self",
    prompt:
      "If you could record a 60-second message for the version of you that signed up for this program — what do you want her to know?",
    hint: "She needs to hear it. So do you.",
  },
];

/**
 * Pick the prompt for a given week. Rotates through CONTENT_PROMPTS based on
 * weeks elapsed since the program's epoch (Jan 1 2026, Monday-aligned).
 */
const ROTATION_EPOCH = new Date("2026-01-05T00:00:00Z"); // first Monday of 2026
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function getPromptForWeek(weekStart: Date): ContentPrompt {
  const weeksSinceEpoch = Math.max(
    0,
    Math.floor((weekStart.getTime() - ROTATION_EPOCH.getTime()) / MS_PER_WEEK)
  );
  const idx = weeksSinceEpoch % CONTENT_PROMPTS.length;
  return CONTENT_PROMPTS[idx];
}
