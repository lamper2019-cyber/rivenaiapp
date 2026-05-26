import type { CheerReceivedSummary } from "@/lib/cheer-received";

/**
 * Persistent surface showing this week's cheer tally for the viewer.
 * Hides at zero (empty weeks read as a normal dashboard).
 *
 * The headline names the count. The subtitle, when present, names the
 * "why" of the most recent rose — softened so it reads as recognition,
 * not exposure ("she saw you show up on a heavy day" not "your heavy
 * day"). The subject of the sentence is HER, the receiver.
 *
 * Renders alongside the falling-roses ceremony (which fires only on
 * fresh unseen roses) — that one is the moment, this one is the
 * persistent reminder.
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
              Sent because {summary.mostRecentContext}.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
