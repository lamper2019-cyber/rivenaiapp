import type { CollectiveStats } from "@/lib/collective-counter";

/**
 * The "RIVEN women, together" stat strip. Small community, big-feeling
 * collective totals. Hides any stat that's still at zero so we never show
 * "0 lbs lost combined" — that's the opposite of momentum.
 */
export function CollectiveCounter({ stats }: { stats: CollectiveStats }) {
  const cells: Array<{ value: string; label: string }> = [];

  if (stats.mealsThisWeek > 0) {
    cells.push({
      value: stats.mealsThisWeek.toLocaleString(),
      label: "meals logged this week",
    });
  }
  if (stats.proteinGoalsToday > 0) {
    cells.push({
      value: stats.proteinGoalsToday.toLocaleString(),
      label: "protein goals hit today",
    });
  }
  if (stats.monthlyStepsK > 0) {
    cells.push({
      value: `${stats.monthlyStepsK.toLocaleString()}k`,
      label: "steps this month, together",
    });
  }
  if (stats.poundsLostCombined > 0) {
    cells.push({
      value: stats.poundsLostCombined.toLocaleString(),
      label: "pounds lost, combined",
    });
  }

  if (cells.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        Together
      </p>
      <div className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-5 shadow-elevation-1">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-2">
          {cells.map((c) => (
            <div key={c.label} className="text-center sm:text-left">
              <p className="font-display text-headline-md text-charcoal leading-none">
                {c.value}
              </p>
              <p className="font-body text-label-sm text-on-surface-variant mt-1.5 leading-snug">
                {c.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
