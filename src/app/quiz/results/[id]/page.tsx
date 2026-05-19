import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  AnswersSchema,
  generateInsights,
  nextStepFor,
  scoreBucket,
  type BudgetTier,
} from "@/lib/quiz";

export const metadata = {
  title: "Your readiness — RIVEN",
  description: "Your RIVEN readiness score, three insights from your answers, and your next step.",
};

/**
 * Dynamic results page. The Lead row already has score + budgetTier
 * precomputed (we don't trust the URL to carry them — score lives in
 * the DB, period). Insights are regenerated from the saved answers
 * so the bank can evolve without rewriting historical leads.
 */
export default async function QuizResultsPage({
  params,
}: {
  params: { id: string };
}) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    select: {
      firstName: true,
      score: true,
      budgetTier: true,
      answers: true,
    },
  });

  if (!lead) notFound();

  // Answers is JSON — parse-and-validate before we trust it. If anything's
  // off, render a graceful empty insights block instead of crashing.
  const parsed = AnswersSchema.safeParse(lead.answers);
  const insights: string[] = parsed.success ? generateInsights(parsed.data) : [];

  const bucket = scoreBucket(lead.score);
  const nextStep = nextStepFor(lead.budgetTier as BudgetTier, lead.firstName);

  // Score bar — visual fill 0-100% of cells (10 cells, one per yes).
  const scoreCells = Array.from({ length: 10 }, (_, i) => i < lead.score);

  return (
    <main className="relative min-h-screen flex flex-col px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-10 md:py-14 space-y-section-gap">
      <header className="flex justify-between items-center">
        <Link
          href="/"
          className="font-display text-headline-md tracking-[0.2em] text-charcoal"
        >
          RIVEN
        </Link>
        <Link
          href="/sign-in"
          className="font-body text-label-md tracking-wide text-charcoal underline underline-offset-4"
        >
          Sign in
        </Link>
      </header>

      {/* The big reveal — animated entrance. Cells fill left-to-right
          (riven-cell-fill, staggered), the score number pops just as the
          cells finish, then the headline + body rise in below. */}
      <section className="space-y-5 text-center">
        <p
          className="font-body text-label-md tracking-widest uppercase text-on-surface-variant riven-rise-in"
          style={{ animationDelay: "100ms" }}
        >
          {lead.firstName}&apos;s RIVEN readiness
        </p>

        <div className="space-y-4">
          <p
            className="font-display text-display-xl md:text-display-2xl text-charcoal leading-none riven-score-pop"
            style={{ animationDelay: "700ms" }}
          >
            {lead.score}
            <span className="font-display text-display-md text-on-surface-variant/60">
              {" "}
              / 10
            </span>
          </p>
          <div
            className="flex justify-center gap-1.5"
            aria-label={`Score: ${lead.score} out of 10`}
          >
            {scoreCells.map((on, i) => (
              <span
                key={i}
                style={on ? { animationDelay: `${100 + i * 60}ms` } : undefined}
                className={`inline-block w-3.5 h-3.5 rounded-sm ${
                  on
                    ? "bg-sage riven-cell-fill"
                    : "bg-outline-variant/40 opacity-60"
                }`}
              />
            ))}
          </div>
        </div>

        <h1
          className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance riven-rise-in"
          style={{ animationDelay: "1000ms" }}
        >
          {bucket.headline}
        </h1>
        <p
          className="font-body text-body-lg text-on-surface-variant max-w-xl mx-auto leading-relaxed riven-rise-in"
          style={{ animationDelay: "1180ms" }}
        >
          {bucket.body}
        </p>
      </section>

      <div className="border-t border-outline-variant/40" />

      {/* Three insights — cascade in after the big reveal lands. */}
      <section className="space-y-5">
        <p
          className="font-body text-label-md tracking-widest uppercase text-on-surface-variant riven-rise-in"
          style={{ animationDelay: "1400ms" }}
        >
          Three things your answers tell me
        </p>
        {insights.length === 0 ? (
          <p className="font-body text-body-md text-on-surface-variant">
            Your answers came through, but the breakdown didn&apos;t generate.
            Reach out and we&apos;ll send it manually.
          </p>
        ) : (
          <ol className="space-y-4">
            {insights.map((text, i) => (
              <li
                key={i}
                className="flex items-start gap-4 riven-rise-in"
                style={{ animationDelay: `${1550 + i * 180}ms` }}
              >
                <span className="shrink-0 w-7 h-7 rounded-full bg-secondary-container/50 border border-gold/40 flex items-center justify-center font-display text-label-md text-charcoal">
                  {i + 1}
                </span>
                <p className="font-body text-body-md text-charcoal leading-relaxed">
                  {text}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="border-t border-outline-variant/40" />

      {/* Next step — routed by budget tier. Last to land. */}
      <section
        className="space-y-4 rounded-md bg-secondary-container/30 border border-gold/40 p-gutter md:p-8 shadow-elevation-1 riven-rise-in"
        style={{ animationDelay: "2200ms" }}
      >
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          {nextStep.tag}
        </p>
        <p className="font-body text-body-lg text-charcoal leading-relaxed">
          {nextStep.copy}
        </p>
        <div className="pt-1">
          <Link
            href={nextStep.ctaHref}
            className="block w-full text-center bg-charcoal text-cream py-4 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all"
          >
            {nextStep.ctaLabel}
          </Link>
          {nextStep.note && (
            <p className="font-body text-label-sm text-on-surface-variant/80 text-center mt-3">
              {nextStep.note}
            </p>
          )}
        </div>
      </section>

      <section className="text-center pt-2 pb-6">
        <p className="font-body text-label-sm text-on-surface-variant/70">
          Questions? Reach out at{" "}
          <a
            href="mailto:lamper.2019@gmail.com"
            className="underline underline-offset-4 text-charcoal"
          >
            lamper.2019@gmail.com
          </a>
          .
        </p>
      </section>

      <div className="fixed top-[10%] right-[-10%] w-[35%] h-[35%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-[5%] left-[-10%] w-[30%] h-[30%] bg-sage/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
