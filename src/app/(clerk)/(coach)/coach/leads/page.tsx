import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  AnswersSchema,
  PRACTICE_QUESTIONS,
  labelForChoiceAnswer,
  type BudgetTier,
} from "@/lib/quiz";

const TIERS: Array<{ key: BudgetTier | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "FREE", label: "PDF guide" },
  { key: "APP", label: "App" },
  { key: "COACH", label: "Coach" },
  { key: "DONE_FOR_YOU", label: "Done for you" },
];

const TIER_LABEL: Record<BudgetTier, string> = {
  FREE: "PDF guide",
  APP: "App",
  COACH: "Coach",
  DONE_FOR_YOU: "Done for you",
};

type LeadsSearchParams = { tier?: string };

export default async function CoachLeadsPage({
  searchParams,
}: {
  searchParams: LeadsSearchParams;
}) {
  const tierFilter = TIERS.some((t) => t.key === searchParams.tier)
    ? (searchParams.tier as BudgetTier | "ALL")
    : "ALL";

  // Per-tier counts for the chip labels. One groupBy hits all of them.
  const tierCounts = await prisma.lead.groupBy({
    by: ["budgetTier"],
    _count: { _all: true },
  });
  const countByTier: Record<string, number> = {};
  let totalCount = 0;
  for (const row of tierCounts) {
    countByTier[row.budgetTier] = row._count._all;
    totalCount += row._count._all;
  }

  const leads = await prisma.lead.findMany({
    where: tierFilter === "ALL" ? {} : { budgetTier: tierFilter },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      firstName: true,
      email: true,
      phone: true,
      score: true,
      budgetTier: true,
      answers: true,
      createdAt: true,
      country: true,
    },
  });

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-3xl mx-auto py-12 space-y-section-gap pb-32">
      <header className="space-y-2">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Coach
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          Quiz leads
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          {totalCount} {totalCount === 1 ? "lead" : "leads"} captured from the
          assessment funnel. Sorted newest first.
        </p>
      </header>

      {/* Tier filter chips. Selected tier syncs via search param so deep
          links / refresh keep the view. */}
      <nav
        className="flex gap-2 overflow-x-auto -mx-container-mobile px-container-mobile md:mx-0 md:px-0"
        aria-label="Filter by budget tier"
      >
        {TIERS.map((t) => {
          const isActive = tierFilter === t.key;
          const count =
            t.key === "ALL" ? totalCount : countByTier[t.key] ?? 0;
          const href =
            t.key === "ALL" ? "/coach/leads" : `/coach/leads?tier=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={`shrink-0 px-4 py-2 rounded-full font-body text-label-md tracking-wide transition-all ${
                isActive
                  ? "bg-charcoal text-cream"
                  : "bg-surface-container-lowest border border-outline-variant/60 text-on-surface-variant hover:text-charcoal hover:border-charcoal/40"
              }`}
            >
              {t.label}{" "}
              <span
                className={
                  isActive ? "text-cream/70" : "text-on-surface-variant/60"
                }
              >
                ({count})
              </span>
            </Link>
          );
        })}
      </nav>

      {leads.length === 0 ? (
        <div className="rounded-md bg-surface-container/40 border border-outline-variant/40 px-gutter py-10 text-center space-y-2">
          <p className="font-body text-body-md text-on-surface-variant">
            {tierFilter === "ALL"
              ? "No quiz leads yet. Once someone runs through the readiness assessment, they'll land here."
              : "No leads in this tier. Try a different filter or wait for traffic."}
          </p>
          {tierFilter === "ALL" && (
            <p className="font-body text-label-sm text-on-surface-variant/70">
              The assessment lives at{" "}
              <Link
                href="/quiz"
                className="underline underline-offset-4 text-charcoal"
              >
                /quiz
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => (
            <li key={lead.id}>
              <LeadCard lead={lead} />
            </li>
          ))}
        </ul>
      )}

      <div className="fixed top-[10%] right-[-10%] w-[35%] h-[35%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

type LeadRow = {
  id: string;
  firstName: string;
  email: string;
  phone: string | null;
  score: number;
  budgetTier: string;
  answers: unknown; // JSON — validate inside the component
  createdAt: Date;
  country: string | null;
};

function LeadCard({ lead }: { lead: LeadRow }) {
  const parsed = AnswersSchema.safeParse(lead.answers);
  const answers = parsed.success ? parsed.data : null;

  const ageLabel = relativeAge(lead.createdAt);
  const tierLabel = TIER_LABEL[lead.budgetTier as BudgetTier] ?? lead.budgetTier;

  const scoreTone =
    lead.score >= 7
      ? "bg-sage/25 text-charcoal border-sage/40"
      : lead.score >= 4
      ? "bg-gold/25 text-charcoal border-gold/50"
      : "bg-soft-red/15 text-charcoal border-soft-red/40";

  return (
    <details className="group rounded-md bg-surface-container-lowest border border-outline-variant/60 shadow-elevation-1 overflow-hidden">
      <summary className="list-none cursor-pointer px-gutter py-4 hover:bg-cream/30 transition-colors">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="font-display text-headline-sm text-charcoal truncate">
                {lead.firstName}
              </p>
              <p className="font-body text-label-sm text-on-surface-variant whitespace-nowrap">
                {ageLabel}
              </p>
            </div>
            <p className="font-body text-label-sm text-on-surface-variant/80 truncate">
              {lead.email}
              {lead.phone && (
                <span className="text-on-surface-variant/60"> · {lead.phone}</span>
              )}
              {lead.country && (
                <span className="text-on-surface-variant/60"> · {lead.country}</span>
              )}
            </p>
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-body text-label-sm border ${scoreTone}`}
              >
                {lead.score} / 10
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-body text-label-sm bg-secondary-container/40 border border-gold/40 text-charcoal">
                {tierLabel}
              </span>
              {answers && (
                <span className="font-body text-label-sm text-on-surface-variant/70 truncate">
                  {labelForChoiceAnswer("q11", answers.q11)}
                </span>
              )}
            </div>
          </div>
          <span
            className="material-symbols-outlined text-charcoal/40 shrink-0 self-center transition-transform group-open:rotate-180"
            aria-hidden
          >
            expand_more
          </span>
        </div>
      </summary>

      {answers && (
        <div className="px-gutter pb-5 pt-1 border-t border-outline-variant/40 space-y-4 bg-cream/40">
          <div className="grid sm:grid-cols-2 gap-3 pt-3">
            <DetailField
              label="90-day goal"
              value={labelForChoiceAnswer("q12", answers.q12)}
            />
            <DetailField
              label="Biggest obstacle"
              value={labelForChoiceAnswer("q13", answers.q13)}
            />
            <DetailField
              label="Support she wants"
              value={labelForChoiceAnswer("q14", answers.q14)}
            />
            <DetailField
              label="Best practices score"
              value={`${lead.score} of 10 yes`}
            />
          </div>

          {answers.q15 && (
            <div className="rounded-md bg-secondary-container/30 border border-gold/40 px-3 py-3">
              <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant mb-1">
                Note from her
              </p>
              <p className="font-body text-body-md text-charcoal leading-relaxed whitespace-pre-wrap">
                {answers.q15}
              </p>
            </div>
          )}

          <div>
            <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant mb-2">
              Practices (yes/no)
            </p>
            <ul className="space-y-1.5">
              {PRACTICE_QUESTIONS.map((q) => {
                const v = answers[q.id as keyof typeof answers] as "yes" | "no";
                const yes = v === "yes";
                return (
                  <li
                    key={q.id}
                    className="flex items-start gap-2 font-body text-body-md text-charcoal leading-snug"
                  >
                    <span
                      className={`material-symbols-outlined text-[18px] mt-0.5 shrink-0 ${
                        yes ? "text-sage" : "text-on-surface-variant/40"
                      }`}
                      aria-hidden
                    >
                      {yes ? "check_circle" : "radio_button_unchecked"}
                    </span>
                    <span className={yes ? "" : "text-on-surface-variant"}>
                      {q.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={`mailto:${lead.email}?subject=${encodeURIComponent(
                `Your RIVEN readiness — ${lead.firstName}`,
              )}`}
              className="inline-flex items-center gap-1.5 bg-charcoal text-cream px-4 py-2 rounded-full font-body text-label-sm tracking-wide hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[16px]">mail</span>
              Email her
            </a>
            {lead.phone && (
              <a
                href={`sms:${lead.phone}`}
                className="inline-flex items-center gap-1.5 border border-charcoal/60 text-charcoal px-4 py-2 rounded-full font-body text-label-sm tracking-wide hover:bg-charcoal/5 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">sms</span>
                Text her
              </a>
            )}
          </div>
        </div>
      )}
    </details>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-body text-label-sm tracking-wide text-on-surface-variant/80">
        {label}
      </p>
      <p className="font-body text-body-md text-charcoal mt-0.5 leading-snug">
        {value}
      </p>
    </div>
  );
}

/** Compact "2 days ago" / "3 hours ago" formatter. */
function relativeAge(createdAt: Date): string {
  const ms = Date.now() - createdAt.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ms < minute) return "just now";
  if (ms < hour) return `${Math.floor(ms / minute)}m ago`;
  if (ms < day) return `${Math.floor(ms / hour)}h ago`;
  if (ms < 7 * day) return `${Math.floor(ms / day)}d ago`;
  return createdAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  });
}
