/**
 * Time-aware ritual logic for the top of /dashboard.
 *
 * Picks one of four "slots" based on the current Central-time hour:
 *
 *   morning   6 AM - 11 AM   → set the intention for the day
 *   midday   11 AM -  5 PM   → meal pacing + log nudge
 *   evening   5 PM - 11 PM   → close out the day, tomorrow's focus
 *   night    11 PM -  6 AM   → quiet "rest up" moment, no ask
 *
 * The slot is computed from a Date so we can pass a stub for testing.
 * The component reads this + her profile/today data to render the
 * right card.
 */

export type RitualSlot = "morning" | "midday" | "evening" | "night";

export function currentRitualSlot(now: Date = new Date()): RitualSlot {
  // Pull the hour-of-day in Central time without doing math by hand
  // (handles DST automatically).
  const hourString = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).format(now);
  const hour = parseInt(hourString, 10) % 24;
  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "midday";
  if (hour >= 17 && hour < 23) return "evening";
  return "night";
}

/**
 * Pick today's "one thing" focus for the morning ritual card. Reads
 * her latest day's macros + steps to surface the most relevant
 * micro-goal. Designed as a calm sentence, not a barked instruction.
 */
export type MorningFocus = {
  label: string;
  detail: string;
};

export function pickMorningFocus(args: {
  yesterdayProteinHit: boolean;
  yesterdayStepsK: number;
  proteinFloorG: number;
}): MorningFocus {
  if (!args.yesterdayProteinHit) {
    return {
      label: "Hit your protein floor.",
      detail: `${args.proteinFloorG}g. Front-load breakfast.`,
    };
  }
  if (args.yesterdayStepsK < 6) {
    return {
      label: "Move before noon.",
      detail: "Steps were light yesterday. 20 minutes outside is enough.",
    };
  }
  return {
    label: "Stack another clean day.",
    detail: "Yesterday was on point. Repeat it.",
  };
}
