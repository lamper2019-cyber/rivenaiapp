import Link from "next/link";
import type { TriageEvent, TriageSeverity } from "@/lib/coach-triage";

const SEVERITY_STYLES: Record<TriageSeverity, { bg: string; dot: string }> = {
  red: { bg: "bg-soft-red/10 border-soft-red/40", dot: "bg-soft-red" },
  gold: { bg: "bg-gold/10 border-gold/50", dot: "bg-gold" },
  sage: { bg: "bg-sage/10 border-sage/40", dot: "bg-sage" },
};

export function TriageFeed({
  events,
  title = "Needs you",
}: {
  events: TriageEvent[];
  title?: string;
}) {
  if (events.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        {title} <span className="text-on-surface-variant/60">({events.length})</span>
      </h2>
      <ul className="space-y-2">
        {events.map((event) => {
          const styles = SEVERITY_STYLES[event.severity];
          return (
            <li key={`${event.clientId}:${event.category}`}>
              <Link
                href={event.href}
                className={`block rounded-md border px-gutter py-3 shadow-elevation-1 hover:shadow-elevation-2 transition-all ${styles.bg}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${styles.dot}`}
                    aria-hidden
                  />
                  <p className="flex-1 min-w-0 font-body text-body-md text-charcoal leading-snug">
                    {event.copy}
                  </p>
                  <span className="material-symbols-outlined text-charcoal/40 shrink-0 text-[20px]">
                    chevron_right
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
