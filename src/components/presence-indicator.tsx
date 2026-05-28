/**
 * "Tracy and Adrienne are in RIVEN right now."
 *
 * Reads the list of first names of clients (minus the viewer) who've
 * opened /dashboard in the last 15 min, formatted as a quiet ambient
 * line below the time-aware ritual card. Self-hides when the room is
 * empty — no "you're alone" copy. Either she sees company or she
 * sees nothing.
 *
 * Two gold dots pulse softly to indicate "live." Same gold accent as
 * the rest of the editorial palette.
 */
export function PresenceIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;

  const label = formatPresenceLabel(names);

  return (
    <p
      className="inline-flex items-center gap-2 font-body text-label-sm text-on-surface-variant"
      aria-live="polite"
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-gold riven-pulse-soft"
        aria-hidden
      />
      {label}
    </p>
  );
}

function formatPresenceLabel(names: string[]): string {
  // Truncate to first 3 + count overflow. Reads natural at any size:
  //   1 name  → "Tracy is in RIVEN right now."
  //   2 names → "Tracy and Adrienne are in RIVEN right now."
  //   3 names → "Tracy, Adrienne, and Maya are in RIVEN right now."
  //   4+ → "Tracy, Adrienne, Maya, and 2 others are in RIVEN right now."
  if (names.length === 1) {
    return `${names[0]} is in RIVEN right now.`;
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are in RIVEN right now.`;
  }
  if (names.length === 3) {
    return `${names[0]}, ${names[1]}, and ${names[2]} are in RIVEN right now.`;
  }
  const visible = names.slice(0, 3);
  const overflow = names.length - 3;
  return `${visible.join(", ")}, and ${overflow} other${
    overflow === 1 ? "" : "s"
  } are in RIVEN right now.`;
}
