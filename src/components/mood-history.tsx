import {
  MOOD_CAUSES_BY_MOOD,
  MOOD_EMOJI,
  MOOD_KINDS,
  MOOD_LABEL,
  moodCauseLabel,
  type MoodHistoryEntry,
  type MoodKind,
} from "@/lib/daily-mood";

/**
 * Last 30 days of mood history rendered as:
 *
 *   1. A compact heatmap-style strip — one cell per day, colored by mood.
 *      She can see her own pattern at a glance.
 *   2. A mood tally bar chart (% per mood).
 *   3. A cause tally for the mood she's hit most ("of your N meh days,
 *      X were sleep, Y were motivation, ..."). Reads the cause chip
 *      list FOR THAT MOOD — different chips per mood now.
 *
 * Empty state (no mood data yet) → component self-hides.
 */
export function MoodHistory({ entries }: { entries: MoodHistoryEntry[] }) {
  if (entries.length === 0) return null;

  const moodCounts: Record<MoodKind, number> = {
    tired: 0,
    blah: 0,
    good: 0,
    fire: 0,
  };
  // Cause counts indexed by mood — each mood has its own cause vocab.
  // Map<cause, count> per mood so we can render the tally cleanly.
  const causeByMood: Record<MoodKind, Map<string, number>> = {
    tired: new Map(),
    blah: new Map(),
    good: new Map(),
    fire: new Map(),
  };
  for (const e of entries) {
    moodCounts[e.mood] += 1;
    if (e.cause) {
      const m = causeByMood[e.mood];
      m.set(e.cause, (m.get(e.cause) ?? 0) + 1);
    }
  }

  const topMood = (Object.keys(moodCounts) as MoodKind[]).reduce<MoodKind>(
    (best, k) => (moodCounts[k] > moodCounts[best] ? k : best),
    "tired",
  );

  return (
    <section className="space-y-3">
      <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        Mood · last 30 days
      </h2>

      <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-5 shadow-elevation-1 space-y-5">
        {/* Heatmap strip. */}
        <div className="flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <span
              key={e.centralDate.toISOString()}
              title={`${e.centralDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "America/Chicago",
              })} · ${MOOD_LABEL[e.mood]}${
                e.cause ? ` · ${moodCauseLabel(e.cause)}` : ""
              }`}
              className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[14px] ${pillBg(
                e.mood,
              )}`}
              aria-label={`${e.centralDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}: ${MOOD_LABEL[e.mood]}`}
            >
              {MOOD_EMOJI[e.mood]}
            </span>
          ))}
        </div>

        {/* Mood tally bar chart. */}
        <div className="space-y-1.5">
          {MOOD_KINDS.map((kind) => {
            const count = moodCounts[kind];
            const pct =
              entries.length > 0
                ? Math.round((count / entries.length) * 100)
                : 0;
            return (
              <div key={kind} className="flex items-center gap-3">
                <span className="w-6 text-center text-[16px]" aria-hidden>
                  {MOOD_EMOJI[kind]}
                </span>
                <div className="flex-1 h-2 rounded-full bg-surface-container overflow-hidden">
                  <div
                    className="h-full rounded-full bg-charcoal/30 transition-all"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                </div>
                <span className="font-body text-label-sm tabular-nums text-on-surface-variant">
                  {count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Cause tally for the top mood — drives "what's actually
            driving her ___ days." */}
        {moodCounts[topMood] >= 2 && (
          <CauseTally
            mood={topMood}
            causeCounts={causeByMood[topMood]}
            totalDays={moodCounts[topMood]}
          />
        )}
      </div>
    </section>
  );
}

function CauseTally({
  mood,
  causeCounts,
  totalDays,
}: {
  mood: MoodKind;
  causeCounts: Map<string, number>;
  totalDays: number;
}) {
  // Read the canonical chip list for THIS mood, then render only the
  // ones with a non-zero count. Legacy values (e.g. "stress" stored
  // under 'fire' before we switched to per-mood chips) get appended
  // afterward so the data isn't hidden — but flagged with no bar.
  const chips = MOOD_CAUSES_BY_MOOD[mood];
  const knownCount = chips.reduce((sum, c) => sum + (causeCounts.get(c) ?? 0), 0);
  const legacyCount = Array.from(causeCounts.entries()).reduce(
    (sum, [k, v]) => (chips.includes(k) ? sum : sum + v),
    0,
  );
  const totalCausedDays = knownCount + legacyCount;

  if (totalCausedDays === 0) {
    return (
      <p className="font-body text-label-sm text-on-surface-variant/70 border-t border-outline-variant/40 pt-3">
        Tap the follow-up on the dashboard to see what&apos;s driving your{" "}
        {MOOD_LABEL[mood]} days.
      </p>
    );
  }
  return (
    <div className="border-t border-outline-variant/40 pt-3 space-y-2">
      <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
        Of your {totalDays} {MOOD_LABEL[mood]} days
      </p>
      <ul className="space-y-1">
        {chips.map((chip) => (
          <CauseRow
            key={chip}
            label={chip}
            count={causeCounts.get(chip) ?? 0}
            max={totalCausedDays}
          />
        ))}
      </ul>
    </div>
  );
}

function CauseRow({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  if (count === 0) return null;
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <li className="flex items-center gap-3">
      <span className="font-body text-label-sm text-charcoal w-16">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-container overflow-hidden">
        <div
          className="h-full rounded-full bg-gold/60"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <span className="font-body text-label-sm tabular-nums text-on-surface-variant">
        {count}
      </span>
    </li>
  );
}

function pillBg(mood: MoodKind): string {
  switch (mood) {
    case "fire":
      return "bg-gold/30";
    case "good":
      return "bg-tertiary-container/60";
    case "blah":
      return "bg-surface-container";
    case "tired":
      return "bg-soft-red/15";
  }
}
