import Link from "next/link";

type Person = { id: string; firstName: string };

/**
 * "Today" status strip at the top of the coach roster. Two rows: who logged
 * at least one meal in the current Central-time day, and who hasn't yet.
 * "Quiet" is NOT a red flag — someone might just not have eaten yet at 10am.
 * Actual silence (24h+) lives in the Needs you bucket below.
 */
export function TodayStrip({
  logged,
  quiet,
}: {
  logged: Person[];
  quiet: Person[];
}) {
  if (logged.length === 0 && quiet.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        Today
      </h2>
      <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-3 shadow-elevation-1 space-y-2.5">
        {logged.length > 0 && (
          <Row label="Logged" people={logged} dotClass="bg-sage" />
        )}
        {quiet.length > 0 && (
          <Row label="Quiet" people={quiet} dotClass="bg-on-surface-variant/40" />
        )}
      </div>
    </section>
  );
}

function Row({
  label,
  people,
  dotClass,
}: {
  label: string;
  people: Person[];
  dotClass: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-2 inline-block w-2 h-2 rounded-full shrink-0 ${dotClass}`}
        aria-hidden
      />
      <p className="flex-1 min-w-0 font-body text-body-md text-charcoal leading-snug">
        <span className="font-body text-label-sm tracking-wide text-on-surface-variant mr-2">
          {label} ({people.length}):
        </span>
        {people.map((p, i) => (
          <span key={p.id}>
            <Link
              href={`/coach/clients/${p.id}`}
              className="hover:opacity-70 transition-opacity"
            >
              {p.firstName}
            </Link>
            {i < people.length - 1 && (
              <span className="text-on-surface-variant"> · </span>
            )}
          </span>
        ))}
      </p>
    </div>
  );
}
