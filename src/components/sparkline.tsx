/**
 * Pure-SVG sparkline. No charting library — keeps the visual on-brand
 * (DESIGN.md says minimalism, ambient shadows, no harsh dividers).
 */

import type { SeriesPoint } from "@/lib/progress";

type SparklineProps = {
  data: SeriesPoint[];
  unit: string;
  /** Optional horizontal target line (e.g. goal weight). */
  target?: number;
  /** Color of the line stroke. Defaults to charcoal. */
  stroke?: string;
  /** Optional descriptive class for the wrapper. */
  className?: string;
};

const VIEWBOX_W = 320;
const VIEWBOX_H = 100;
const PAD_X = 12;
const PAD_Y = 12;

export function Sparkline({
  data,
  unit,
  target,
  stroke = "currentColor",
  className,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-[100px] rounded-md bg-surface-container/40 border border-outline-variant/40 ${className ?? ""}`}>
        <p className="font-body text-label-sm text-on-surface-variant/70">
          No data yet — submit a check-in to start the chart.
        </p>
      </div>
    );
  }

  if (data.length === 1) {
    const [only] = data;
    return (
      <div className={`flex items-center justify-center h-[100px] rounded-md bg-surface-container/40 border border-outline-variant/40 ${className ?? ""}`}>
        <p className="font-display text-headline-md text-charcoal">
          {only.y}
          <span className="font-body text-label-sm text-on-surface-variant ml-1">{unit}</span>
        </p>
      </div>
    );
  }

  // Compute axis ranges. Pad y-range by 5% so the line never touches the edge.
  const ys = data.map((d) => d.y);
  const yMinRaw = Math.min(...ys, target ?? Infinity);
  const yMaxRaw = Math.max(...ys, target ?? -Infinity);
  const yRange = Math.max(yMaxRaw - yMinRaw, 1);
  const yMin = yMinRaw - yRange * 0.1;
  const yMax = yMaxRaw + yRange * 0.1;

  const xs = data.map((d) => d.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xRange = Math.max(xMax - xMin, 1);

  const toX = (x: number) =>
    PAD_X + ((x - xMin) / xRange) * (VIEWBOX_W - 2 * PAD_X);
  const toY = (y: number) =>
    PAD_Y + (1 - (y - yMin) / (yMax - yMin)) * (VIEWBOX_H - 2 * PAD_Y);

  // Path string.
  const pathD = data
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(2)} ${toY(p.y).toFixed(2)}`)
    .join(" ");

  // Area fill underneath the line, fades to transparent.
  const areaD =
    pathD +
    ` L ${toX(data[data.length - 1].x).toFixed(2)} ${VIEWBOX_H - PAD_Y} ` +
    ` L ${toX(data[0].x).toFixed(2)} ${VIEWBOX_H - PAD_Y} Z`;

  const latest = data[data.length - 1];
  const first = data[0];
  const delta = latest.y - first.y;
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const deltaAbs = Math.abs(delta).toFixed(1);

  const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-2">
        <p className="font-display text-headline-md text-charcoal">
          {latest.y}
          <span className="font-body text-label-sm text-on-surface-variant ml-1">{unit}</span>
        </p>
        {data.length > 1 && (
          <p className="font-body text-label-sm text-on-surface-variant">
            {deltaSign}
            {deltaAbs} {unit} since {first.label}
          </p>
        )}
      </div>

      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        preserveAspectRatio="none"
        className="w-full h-[100px]"
        style={{ color: stroke }}
        aria-label={`Trend chart: ${first.label} to ${latest.label}, ${data.length} data points`}
        role="img"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Optional target line */}
        {target !== undefined && (
          <line
            x1={PAD_X}
            x2={VIEWBOX_W - PAD_X}
            y1={toY(target)}
            y2={toY(target)}
            stroke="#A8A29A"
            strokeWidth="0.75"
            strokeDasharray="2,3"
          />
        )}

        {/* Area under line */}
        <path d={areaD} fill={`url(#${gradientId})`} />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Endpoint dots */}
        {data.map((p, i) => (
          <circle
            key={i}
            cx={toX(p.x)}
            cy={toY(p.y)}
            r={i === data.length - 1 ? 2.5 : 1.5}
            fill="currentColor"
          />
        ))}
      </svg>

      <div className="flex justify-between mt-1">
        <span className="font-body text-label-sm text-on-surface-variant/70">{first.label}</span>
        <span className="font-body text-label-sm text-on-surface-variant/70">{latest.label}</span>
      </div>
    </div>
  );
}
