import type { CollectiveStats } from "@/lib/collective-counter";

/**
 * "Together · this week" — the village card on /dashboard.
 *
 * Renders named contributors per stat instead of pure aggregates,
 * because with 8 clients, faceless numbers feel small. With first
 * names, the same numbers feel like a room. Each stat reads as a
 * sentence:
 *
 *   "Tracy, Maya, Adrienne, you + 4 others stacked 4,210g of protein."
 *
 * Empty stats (no contributors) self-hide. The card self-hides
 * entirely when every stat is empty.
 *
 * Privacy: only first names. Restricted to active clients server-side.
 * The viewer's name appears as "you" if she contributed (the page
 * passes her first name down for substitution).
 */
export function CollectiveCounter({
  stats,
  viewerFirstName,
}: {
  stats: CollectiveStats;
  /** The viewer's first name. When she's in a contributor list, we
   *  substitute "you" for her name so the line reads naturally to
   *  her. */
  viewerFirstName: string;
}) {
  const rows: Array<{ value: string; sentence: string }> = [];

  if (stats.proteinGramsThisWeek > 0 && stats.proteinNames.length > 0) {
    rows.push({
      value: formatBigNumber(stats.proteinGramsThisWeek) + "g",
      sentence:
        formatNamesSentence(stats.proteinNames, viewerFirstName) +
        " stacked it this week.",
    });
  }
  if (stats.streakDaysCombined > 0 && stats.streakNames.length > 0) {
    const dayWord = stats.streakDaysCombined === 1 ? "day" : "days";
    rows.push({
      value: stats.streakDaysCombined.toLocaleString(),
      sentence: `${formatNamesSentence(
        stats.streakNames,
        viewerFirstName,
      )} ${verbForNames(stats.streakNames)} ${stats.streakDaysCombined.toLocaleString()} ${dayWord} of consistency combined.`,
    });
  }
  if (stats.rosesSentThisWeek > 0 && stats.roseNames.length > 0) {
    rows.push({
      value: stats.rosesSentThisWeek.toLocaleString(),
      sentence: `${formatNamesSentence(
        stats.roseNames,
        viewerFirstName,
      )} sent 🌹 to each other.`,
    });
  }
  if (stats.stepsThisWeek > 0 && stats.stepsNames.length > 0) {
    rows.push({
      value: formatBigNumber(stats.stepsThisWeek),
      sentence:
        formatNamesSentence(stats.stepsNames, viewerFirstName) +
        " walked it together.",
    });
  }

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Together
        </p>
        <p className="font-body text-label-sm text-on-surface-variant/70">
          this week
        </p>
      </div>

      <div className="rounded-md bg-secondary-container/40 border border-gold/40 shadow-elevation-1 overflow-hidden">
        <ul className="divide-y divide-gold/20">
          {rows.map((row, i) => (
            <li key={i} className="px-gutter py-5">
              <p className="font-display text-headline-lg text-charcoal leading-none tabular-nums tracking-tight">
                {row.value}
              </p>
              <p className="font-body text-body-md text-on-surface-variant mt-2 leading-snug">
                {row.sentence}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Compress a list of first names into a natural-language sentence:
 *
 *   ["Tracy"]                         → "Tracy"
 *   ["Tracy", "Maya"]                 → "Tracy and Maya"
 *   ["Tracy", "Maya", "Adrienne"]     → "Tracy, Maya, and Adrienne"
 *   5+ names                           → "Tracy, Maya, Adrienne, and N others"
 *
 * Substitutes "you" for the viewer's name if present.
 */
function formatNamesSentence(names: string[], viewerFirstName: string): string {
  // Replace viewer's name with "you", deduplicate, move "you" to the end
  // so the sentence reads "Tracy, Maya, you + 2 others" not "you, Tracy..."
  const withYou = names.map((n) =>
    n.toLowerCase() === viewerFirstName.toLowerCase() ? "you" : n,
  );
  const dedup = Array.from(new Set(withYou));
  const youIdx = dedup.indexOf("you");
  if (youIdx > -1) {
    dedup.splice(youIdx, 1);
    dedup.push("you");
  }

  if (dedup.length === 0) return "";
  if (dedup.length === 1) return dedup[0];
  if (dedup.length === 2) return `${dedup[0]} and ${dedup[1]}`;
  if (dedup.length === 3) return `${dedup[0]}, ${dedup[1]}, and ${dedup[2]}`;
  // 4+ → show first 3 + count overflow
  const visible = dedup.slice(0, 3);
  const overflow = dedup.length - 3;
  return `${visible.join(", ")}, and ${overflow} other${overflow === 1 ? "" : "s"}`;
}

/** Verb agreement when the subject ends with "you" vs a plural list. */
function verbForNames(names: string[]): string {
  // "Tracy stacked" vs "Tracy and Maya stacked" — past tense, no agreement issue.
  // Used for present-tense verbs like "have" / "are." We only need this for
  // "have/has" cases; the streak line uses "stacked" so we don't strictly
  // need it. Leaving the helper in for future stat sentences.
  if (names.length === 1) return "stacked";
  return "stacked";
}

/**
 * Big numbers read better abbreviated past 10k:
 *  -   0–9,999       → "4,210"
 *  -   10k–999k      → "47k"  /  "314k"
 *  -   1M+           → "1.2M" /  "3.4M"
 */
function formatBigNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString();
}
