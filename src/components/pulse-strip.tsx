import type { PulseEvent } from "@/lib/pulse";

/**
 * Ambient activity ticker at the top of /dashboard. Reads as "the room is
 * alive" — every meal log, streak hit, and check-in another woman just
 * did surfaces here. First names always per Sean's small-community brand.
 *
 * Server component: no animation libraries, just a stacked list that
 * fades in via the existing riven-rise-in keyframe. Each event gets a
 * tiny gold dot to signal motion without screaming for attention.
 */
export function PulseStrip({ events }: { events: PulseEvent[] }) {
  if (events.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        Right now in RIVEN
      </p>
      <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 shadow-elevation-1 overflow-hidden">
        <ul className="divide-y divide-outline-variant/30">
          {events.slice(0, 6).map((e, i) => (
            <li
              key={e.id}
              className="flex items-center gap-3 px-gutter py-2.5 riven-rise-in"
              style={{ animationDelay: `${80 * i}ms` }}
            >
              <span
                className="shrink-0 w-1.5 h-1.5 rounded-full bg-gold"
                aria-hidden
              />
              <p className="font-body text-body-md text-charcoal leading-snug flex-1 min-w-0 truncate">
                {e.copy}
              </p>
              <span className="font-body text-label-sm text-on-surface-variant/70 whitespace-nowrap">
                {relativeTime(e.at)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function relativeTime(d: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}
