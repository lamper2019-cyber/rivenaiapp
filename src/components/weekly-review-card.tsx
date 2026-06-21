import type { CalorieWeek, WaistSnapshot } from "@/lib/weekly-review";

/**
 * "This Week" — the at-a-glance weekly snapshot on /dashboard. Read-only:
 * weight average, calorie average (vs target), and waist, with one adjustment
 * line. The *inputs* (daily weight, waist) happen elsewhere — this is the
 * dashboard so she (and the trend) are visible any day, not just Sunday.
 */
export function WeeklyReviewCard({
  weightAvg,
  calorie,
  waist,
}: {
  weightAvg: number | null;
  calorie: CalorieWeek | null;
  waist: WaistSnapshot | null;
}) {
  // Nothing logged yet anywhere → don't show an empty shell.
  if (weightAvg == null && calorie == null && (waist?.current ?? null) == null) {
    return null;
  }

  return (
    <section
      aria-label="This week"
      className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-5 space-y-3"
    >
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        This week
      </p>

      <dl className="space-y-2.5">
        <Row label="Weight avg" value={weightAvg != null ? `${weightAvg.toFixed(1)} lb` : "—"} />
        <Row
          label="Calorie avg"
          value={calorie ? `${calorie.thisAvg.toLocaleString()} / day` : "—"}
          hint={calorie ? `target ${calorie.target.toLocaleString()}` : undefined}
        />
        <Row
          label="Waist"
          value={waist?.current != null ? `${waist.current.toFixed(1)} in` : "—"}
          delta={
            waist?.deltaIn != null && waist.deltaIn !== 0
              ? { down: waist.deltaIn < 0, amount: `${Math.abs(waist.deltaIn).toFixed(1)}` }
              : undefined
          }
        />
      </dl>

      <div className="pt-2 border-t border-outline-variant/40">
        <p className="font-body text-body-md text-charcoal">
          {adjustmentLine(calorie)}
        </p>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: { down: boolean; amount: string };
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="font-body text-body-md text-on-surface-variant">{label}</dt>
      <dd className="font-body text-body-md text-charcoal flex items-baseline gap-2">
        {hint && <span className="text-label-sm text-on-surface-variant/70">{hint}</span>}
        <span className="font-display text-headline-sm tabular-nums">{value}</span>
        {delta && (
          <span className={`text-label-sm ${delta.down ? "text-sage" : "text-charcoal"}`}>
            {delta.down ? "▼" : "▲"} {delta.amount}
          </span>
        )}
      </dd>
    </div>
  );
}

/** The one actionable read — derived from the calorie average vs target. */
function adjustmentLine(c: CalorieWeek | null): string {
  if (!c || c.direction === "none") return "Keep logging — the more days you log, the sharper your week reads.";
  switch (c.direction) {
    case "under":
      return "Adjustment: under target — right where a cut lives. Hold the line.";
    case "on":
      return "Adjustment: right on target — clean week. Keep it boring.";
    case "over":
      return "Adjustment: over target — clamp down a little this week.";
  }
}
