import type { CollectiveStats } from "@/lib/collective-counter";

/**
 * "Together · this week" — four big numbers stacked editorial-style.
 * Quiet, premium, no icons. Cream-on-secondary card with a thin gold rule
 * dividing it down the middle (or horizontally on small screens). Hides
 * any stat still at zero, and self-hides entirely on a quiet week.
 *
 * Layout: 2x2 on desktop (one stat per quadrant), single-column on mobile.
 * The gold rule lives between rows so the spine reads as one column on
 * phones — feels less like a dashboard, more like a page in a journal.
 */
export function CollectiveCounter({ stats }: { stats: CollectiveStats }) {
  const cells: Array<{ value: string; label: string }> = [];

  if (stats.proteinGramsThisWeek > 0) {
    cells.push({
      value: formatBigNumber(stats.proteinGramsThisWeek),
      label: "grams of protein logged",
    });
  }
  if (stats.streakDaysCombined > 0) {
    cells.push({
      value: stats.streakDaysCombined.toLocaleString(),
      label: "streak days, combined",
    });
  }
  if (stats.rosesSentThisWeek > 0) {
    cells.push({
      value: stats.rosesSentThisWeek.toLocaleString(),
      label: "🌹 sent to each other",
    });
  }
  if (stats.stepsThisWeek > 0) {
    cells.push({
      value: formatBigNumber(stats.stepsThisWeek),
      label: "steps walked",
    });
  }

  if (cells.length === 0) return null;

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
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {cells.map((c, i) => {
            // Hairline dividers between cells. On mobile (1 col): every
            // cell except the last has a bottom border. On desktop (2
            // col): vertical separator between columns, horizontal
            // between rows. We compute it inline because the grid count
            // depends on `cells.length` at runtime.
            const isLast = i === cells.length - 1;
            const isRightCol = i % 2 === 1;
            const isLastRow = i >= cells.length - 2;
            return (
              <div
                key={c.label}
                className={[
                  "px-gutter py-6 sm:py-7",
                  // Mobile: bottom border on every cell except last.
                  !isLast ? "border-b border-gold/20 sm:border-b-0" : "",
                  // Desktop: bottom border between rows.
                  !isLastRow ? "sm:border-b sm:border-gold/20" : "",
                  // Desktop: left border on the right column so the
                  // vertical rule splits the card down the middle.
                  isRightCol ? "sm:border-l sm:border-gold/20" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <p className="font-display text-headline-lg sm:text-display-lg text-charcoal leading-none tabular-nums tracking-tight">
                  {c.value}
                </p>
                <p className="font-body text-label-md text-on-surface-variant mt-2 leading-snug">
                  {c.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * Big numbers read better with thousands abbreviated past 10k. Under that,
 * the comma format is clearer ("4,210" reads more concretely than "4.2k").
 *
 *  -   0–9,999       → "4,210"
 *  -   10k–999k      → "47k"  /  "314k"
 *  -   1M+           → "1.2M" /  "3.4M"
 */
function formatBigNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 10_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  return n.toLocaleString();
}
