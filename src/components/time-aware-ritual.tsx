import Link from "next/link";
import type { MorningFocus, RitualSlot } from "@/lib/ritual-of-day";

/**
 * Top-of-dashboard ritual card. Adapts based on Central time of day:
 *
 *   morning  → set the intention ("Today's one thing: hit your floor")
 *   midday   → meal pacing snapshot + Log button
 *   evening  → end-of-day close ("How'd today land?")
 *   night    → quiet rest moment, no ask
 *
 * Replaces the old static greeting block. Below this, the rest of
 * the dashboard surfaces (mood ribbon, sunday ritual, cheers, etc.)
 * still render — but the time-aware card is the FIRST thing she sees,
 * so the page has a clear daily anchor.
 *
 * Brand: charcoal headlines on cream, gold accent ornament, label-md
 * tracking-widest uppercase eyebrows. Same editorial system as the
 * rest of the dashboard.
 */
export function TimeAwareRitual({
  slot,
  firstName,
  morningFocus,
  todayCalories,
  todayProtein,
  cutCalorieTarget,
  proteinFloorG,
  hasLoggedToday,
}: {
  slot: RitualSlot;
  firstName: string;
  morningFocus: MorningFocus;
  todayCalories: number;
  todayProtein: number;
  cutCalorieTarget: number;
  proteinFloorG: number;
  hasLoggedToday: boolean;
}) {
  if (slot === "morning") {
    return (
      <section className="space-y-3">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Morning
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
          Good morning, {firstName}.
        </h1>
        <div className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-5 shadow-elevation-1">
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Today&apos;s one thing
          </p>
          <p className="font-display text-headline-md text-charcoal mt-2 leading-snug">
            {morningFocus.label}
          </p>
          <p className="font-body text-body-md text-on-surface-variant mt-1 leading-relaxed">
            {morningFocus.detail}
          </p>
        </div>
      </section>
    );
  }

  if (slot === "midday") {
    const calPct =
      cutCalorieTarget > 0
        ? Math.min(100, Math.round((todayCalories / cutCalorieTarget) * 100))
        : 0;
    const proteinPct =
      proteinFloorG > 0
        ? Math.min(100, Math.round((todayProtein / proteinFloorG) * 100))
        : 0;
    return (
      <section className="space-y-3">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Midday
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
          Half the day, {firstName}.
        </h1>
        <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-5 shadow-elevation-1 space-y-3">
          <StatRow
            label="Calories"
            value={`${todayCalories.toLocaleString()} / ${cutCalorieTarget.toLocaleString()}`}
            pct={calPct}
          />
          <StatRow
            label="Protein"
            value={`${todayProtein}g / ${proteinFloorG}g`}
            pct={proteinPct}
          />
          {!hasLoggedToday && (
            <Link
              href="/log"
              className="block w-full text-center bg-charcoal text-cream py-3 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-1 hover:opacity-90 active:scale-95 transition-all"
            >
              Log a meal
            </Link>
          )}
        </div>
      </section>
    );
  }

  if (slot === "evening") {
    return (
      <section className="space-y-3">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Evening
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
          How&apos;d today land, {firstName}?
        </h1>
        <p className="font-body text-body-md text-on-surface-variant leading-relaxed max-w-md">
          Tap a mood below to close out the day. RIVEN reads the patterns
          at the monthly check-in.
        </p>
      </section>
    );
  }

  // night
  return (
    <section className="space-y-3">
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        Late
      </p>
      <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
        Rest up, {firstName}.
      </h1>
      <p className="font-body text-body-md text-on-surface-variant leading-relaxed max-w-md">
        Tomorrow&apos;s the lock. The room will be here.
      </p>
    </section>
  );
}

function StatRow({
  label,
  value,
  pct,
}: {
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="font-body text-label-md tracking-wide uppercase text-on-surface-variant">
          {label}
        </p>
        <p className="font-body text-body-md text-charcoal tabular-nums">
          {value}
        </p>
      </div>
      <div className="mt-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div
          className="h-full bg-charcoal rounded-full transition-all"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
