import type { MoodKind } from "@/lib/daily-mood";

/**
 * RIVEN-voice coaching lines that fire after she taps her mood on the
 * dashboard. The float-up animation handles the "send" gesture; the
 * ribbon collapses; this line is what replaces it.
 *
 * Banks are 5-6 lines per mood so they rotate convincingly over a month
 * without repeating. The picker is deterministic per (userId, central
 * date) — same user gets the same line on a given day, so the surface
 * doesn't change if she re-opens the app mid-afternoon.
 *
 * Voice rules (per CLAUDE.md + BRAND.md): direct, warm, no preamble,
 * no therapy clichés, no clean-eating moralizing. RIVEN talks like a
 * smart older brother, not a cheerleader. Peaceful discipline.
 */
export const COACH_MOOD_LINES: Record<MoodKind, readonly string[]> = {
  tired: [
    "Hey — we get it. Let it slide. Tomorrow's a new lock.",
    "Heavy day. Don't add guilt to it. Hit your protein floor and call it.",
    "Tired isn't a failure — it's data. Eat the meal you can stomach. Move tomorrow.",
    "When the day's already heavy, you don't need to be perfect. You need to be here. You're here.",
    "Some days the wall hits first. Hit your protein floor anyway. That's the only ask.",
    "On heavy days the bar drops to one thing: log a meal. That's it. Tomorrow we go again.",
  ],
  blah: [
    "Middle days are where the engine gets built. Show up. The trend reads consistency, not peaks.",
    "Meh is fine. Don't let meh turn into nothing. One meal. Then the next.",
    "You don't need to feel inspired to do the work. Most days you won't.",
    "Real talk: meh days are the test. Pass it by doing the next right thing.",
    "Quiet day. Quiet work. That's the whole protocol.",
    "Meh days build the streak. Don't think about it — just hit the next meal.",
  ],
  good: [
    "Good day. Lock it in. Tomorrow starts halfway there.",
    "This is what consistency feels like. Quiet, not loud. Stack these.",
    "You earned this feeling. Don't waste it on the wrong meal.",
    "Note this day. When the meh day comes, remember it can feel like this.",
    "Good days compound. Bank this one — hit your floor, get the walk in.",
    "When it feels easy is when you go harder. Add one more meal to the log.",
  ],
  fire: [
    "🔥 days are the cheat code. Do the thing you'd normally avoid. Now.",
    "Use it. Walk before sunset. Hit the protein floor twice over.",
    "Real talk: this is the energy we ride to results. Don't waste it scrolling.",
    "Lock in. Channel it into one specific action today — not hype.",
    "Days like this build the bank for the meh days. Stack hard.",
    "The momentum is real. Pick one thing you've been avoiding and do it before noon.",
  ],
} as const;

/**
 * Deterministic line pick based on userId + Central date. Same user
 * sees the same line all day on a given mood, but different days
 * surface different lines from the bank.
 */
export function pickCoachLineForMood(
  mood: MoodKind,
  userId: string,
  date: Date = new Date(),
): string {
  const bank = COACH_MOOD_LINES[mood];
  // Cheap deterministic hash of userId + YYYY-MM-DD. Don't need crypto here —
  // this is for content rotation, not security.
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const seed = `${userId}|${dateKey}|${mood}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return bank[Math.abs(hash) % bank.length];
}
