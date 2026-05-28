/**
 * Message bank for Sean's 3x/day proactive check-ins on the unified
 * thread. The morning-checkin / midday-checkin / evening-checkin cron
 * routes pick a variant from these arrays based on the date so the
 * same client doesn't see the same phrasing two days in a row.
 *
 * Voice rules (per CLAUDE.md + BRAND.md): direct, warm, no preamble,
 * no preachy. Sean talks like a smart older brother. Closed questions
 * with tap-chip options so she can engage in <2 seconds.
 *
 * Each variant carries:
 *   - text: what Sean's message reads as (1-2 short sentences)
 *   - chips: 3-4 reply options. The chip "value" is what gets saved
 *     as her reply (also fed to the AI for the auto-reply context).
 *     The chip "label" is what she sees on the button.
 */

export type ChipOption = { label: string; value: string };
export type DailyPromptVariant = {
  text: string;
  chips: ChipOption[];
};

export const MORNING_VARIANTS: DailyPromptVariant[] = [
  {
    text: "Morning. What's the move today?",
    chips: [
      { label: "walk", value: "walking today" },
      { label: "strength", value: "strength session today" },
      { label: "rest", value: "rest day" },
      { label: "open", value: "haven't decided yet" },
    ],
  },
  {
    text: "How you waking up?",
    chips: [
      { label: "🔥 ready", value: "fire" },
      { label: "🙂 good", value: "good" },
      { label: "🥱 slow", value: "meh" },
      { label: "😤 heavy", value: "tired" },
    ],
  },
  {
    text: "Real talk: one thing you'll lock in by noon?",
    chips: [
      { label: "protein", value: "protein floor by noon" },
      { label: "water", value: "water" },
      { label: "steps", value: "steps before lunch" },
      { label: "other", value: "something else" },
    ],
  },
  {
    text: "Morning. Pick the focus.",
    chips: [
      { label: "meals", value: "meals on point" },
      { label: "movement", value: "movement today" },
      { label: "rest", value: "recovery" },
      { label: "mind", value: "mindset" },
    ],
  },
  {
    text: "Heavy day ahead or quiet day ahead?",
    chips: [
      { label: "heavy", value: "heavy" },
      { label: "quiet", value: "quiet" },
      { label: "no plan", value: "no plan yet" },
    ],
  },
] as const;

export const MIDDAY_VARIANTS: DailyPromptVariant[] = [
  {
    text: "Half the day. What did breakfast look like?",
    chips: [
      { label: "skipped", value: "skipped breakfast" },
      { label: "light", value: "light breakfast" },
      { label: "protein hit", value: "hit my protein at breakfast" },
      { label: "log it", value: "want to log it now" },
    ],
  },
  {
    text: "Light on the log so far. Where's your head?",
    chips: [
      { label: "busy", value: "busy day, behind" },
      { label: "no appetite", value: "no appetite today" },
      { label: "forgot", value: "forgot to log" },
      { label: "log now", value: "logging now" },
    ],
  },
  {
    text: "Lunch lock-in. What's the play?",
    chips: [
      { label: "leftovers", value: "leftovers" },
      { label: "out", value: "going out" },
      { label: "skipping", value: "skipping lunch" },
      { label: "thinking", value: "thinking about it" },
    ],
  },
  {
    text: "How's the morning landing?",
    chips: [
      { label: "🔥", value: "fire" },
      { label: "🙂", value: "good" },
      { label: "🥱", value: "meh" },
      { label: "😤", value: "tired" },
    ],
  },
] as const;

export const EVENING_VARIANTS: DailyPromptVariant[] = [
  {
    text: "How'd today land?",
    chips: [
      { label: "😤", value: "tired" },
      { label: "🥱", value: "meh" },
      { label: "🤩", value: "good" },
      { label: "🔥", value: "fire" },
    ],
  },
  {
    text: "One thing that went right today?",
    chips: [
      { label: "protein", value: "hit protein" },
      { label: "movement", value: "moved my body" },
      { label: "showed up", value: "showed up at all" },
      { label: "other", value: "something else" },
    ],
  },
  {
    text: "Tomorrow's move — what's the focus?",
    chips: [
      { label: "meals", value: "meals" },
      { label: "walk", value: "walk" },
      { label: "sleep", value: "sleep" },
      { label: "open", value: "still thinking" },
    ],
  },
  {
    text: "Real talk: did today match the plan?",
    chips: [
      { label: "yes", value: "yes" },
      { label: "mostly", value: "mostly" },
      { label: "not really", value: "not really" },
    ],
  },
  {
    text: "What's the lesson from today?",
    chips: [
      { label: "food", value: "food choices" },
      { label: "energy", value: "energy management" },
      { label: "discipline", value: "showing up anyway" },
      { label: "nothing", value: "nothing today" },
    ],
  },
] as const;

/**
 * Deterministic variant picker — same date + slot returns the same
 * variant. Rotates day-by-day. Uses the slot index in the bank length
 * modulo math so a long bank cycles through fully.
 */
export function pickVariant(
  slot: "morning" | "midday" | "evening",
  date: Date = new Date(),
): DailyPromptVariant {
  const bank =
    slot === "morning"
      ? MORNING_VARIANTS
      : slot === "midday"
        ? MIDDAY_VARIANTS
        : EVENING_VARIANTS;
  // Days since Jan 1, 2026 — gives a monotonic integer that increments
  // daily for the rotation.
  const epoch = new Date("2026-01-01T00:00:00Z").getTime();
  const dayIndex = Math.floor((date.getTime() - epoch) / 86_400_000);
  const offset =
    slot === "morning" ? 0 : slot === "midday" ? 1 : 2;
  const idx = ((dayIndex + offset) % bank.length + bank.length) % bank.length;
  return bank[idx];
}
