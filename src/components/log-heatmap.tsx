/**
 * Inline 7-day meal-log heatmap for the coach roster row. Renders a row of
 * small circles — sage when she logged that day, dim when she missed.
 * Order: oldest on the left, today on the right.
 */
export function LogHeatmap({ days }: { days: boolean[] }) {
  return (
    <div className="flex items-center gap-1.5" aria-label="Last 7 days of logging">
      {days.map((logged, i) => (
        <span
          key={i}
          aria-label={logged ? "logged" : "missed"}
          className={`inline-block w-2 h-2 rounded-full ${
            logged ? "bg-sage" : "bg-on-surface-variant/25"
          }`}
        />
      ))}
      <span className="ml-1 font-body text-label-sm text-on-surface-variant/70">
        7-day
      </span>
    </div>
  );
}
