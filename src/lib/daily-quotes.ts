/**
 * Sean-voice motivational lines that rotate under the dashboard greeting.
 * Picked deterministically by day-of-year so a client sees the same line all
 * day — and a different one tomorrow.
 */

export const DAILY_QUOTES = [
  "The body keeps the score. The plate writes the page.",
  "Strong on Sunday means honest on Wednesday.",
  "Protein anchors the day. Everything else is decoration.",
  "You're not behind. You're early to the rest of your life.",
  "The work isn't loud. The results are.",
  "Discipline is just self-respect with a calendar.",
  "Show up for her — the version of you four months from now.",
  "Cycle, sleep, stress. Read the trend, not the day.",
  "You don't need to be motivated. You need to be there.",
  "The scale is a snapshot. You're a feature film.",
  "Tracking isn't a cage. It's a flashlight.",
  "Two weeks consistent beats two months perfect.",
  "Hard now, easy later. Easy now, hard forever.",
  "Drink the water. Walk the walk. Hit the protein.",
  "The day didn't go sideways. A meal did. That's it.",
  "Sleep is a fat-burning tool you forget exists.",
  "Hormones aren't the enemy. They're information.",
  "Boring food eaten consistently beats exciting food eaten chaotically.",
  "The version of you who quits never gets to meet the one who didn't.",
  "Your future self ate the breakfast you're about to eat.",
] as const;

export function pickQuoteForDate(date: Date): string {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}
