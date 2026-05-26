import type { CheerReceivedSummary } from "@/lib/cheer-received";

/**
 * Single quiet line at the top of /dashboard showing this week's cheer
 * count for the viewer. Hides when count is zero — empty weeks read as
 * a normal dashboard, no "0 women rooting for you" awkwardness.
 *
 * Peaceful-discipline coded: gold-accent dot, charcoal copy, sage-tinted
 * card. No emojis screaming for attention; the count does the work.
 */
export function CheerReceivedCard({
  summary,
}: {
  summary: CheerReceivedSummary;
}) {
  if (summary.count === 0) return null;

  const headline =
    summary.count === 1
      ? "Someone has your back this week"
      : `${summary.count} women have your back this week`;

  return (
    <section className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-4 shadow-elevation-1">
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-[20px] leading-none mt-0.5" aria-hidden>
          🌹
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-headline-sm text-charcoal leading-tight">
            {headline}
          </p>
          {summary.mostRecentContext && (
            <p className="font-body text-label-sm text-on-surface-variant mt-1">
              most recent: someone saw {summary.mostRecentContext}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
