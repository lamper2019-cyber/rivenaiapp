import Link from "next/link";

export const metadata = {
  title: "Are you ready? — RIVEN Readiness Assessment",
  description:
    "A 3-minute assessment for Black women 35–55 doing body recomposition. Score your protein, movement, and recovery — get a tailored next step.",
};

/**
 * Top-of-funnel quiz landing page. Lives outside the (clerk) route group so
 * it's static-friendly and edge-cacheable. Frustration hook → value prop →
 * credibility → CTA. Matches the Priestley "$1M Landing Page" structure but
 * in Sean's voice and RIVEN's brand tokens.
 */
export default function QuizLandingPage() {
  return (
    <main className="relative min-h-screen flex flex-col px-container-mobile md:px-container-desktop max-w-3xl mx-auto py-10 md:py-14">
      <header className="flex justify-between items-center mb-10">
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

      {/* HOOK — frustration */}
      <section className="space-y-6 text-center">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          The RIVEN Readiness Assessment
        </p>
        <h1 className="font-display text-display-md md:text-display-lg text-charcoal tracking-tight text-balance leading-[1.05]">
          Frustrated your body isn&apos;t responding the way it used to
          <span className="text-on-surface-variant"> — </span>
          <span className="italic font-display">even though</span> you&apos;re
          doing everything you&apos;re &ldquo;supposed&rdquo; to?
        </h1>
        <p className="font-body text-body-lg text-on-surface-variant max-w-xl mx-auto">
          Answer 15 questions and find out exactly why — and what to do about
          it. Built for Black women 35–55 doing real body recomposition.
        </p>

        <div className="pt-2">
          <Link
            href="/quiz/start"
            className="inline-block bg-charcoal text-cream py-5 px-10 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all"
          >
            Start the assessment
          </Link>
          <p className="font-body text-label-sm text-on-surface-variant/70 mt-3">
            3 minutes · free · instant breakdown
          </p>
        </div>
      </section>

      <div className="my-14 border-t border-outline-variant/40" />

      {/* VALUE PROP — three pillars */}
      <section className="space-y-6">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant text-center">
          What this scores
        </p>
        <p className="font-body text-body-lg text-charcoal text-center max-w-xl mx-auto">
          We measure — and give you a plan for — the three things that
          actually drive body recomp after 35.
        </p>

        <div className="grid gap-4 sm:grid-cols-3 pt-3">
          <Pillar
            number="01"
            title="Nutrition rhythm"
            body="Protein, calories, and meal timing — the lever most women aren't pulling, no matter how clean they eat."
          />
          <Pillar
            number="02"
            title="Movement"
            body="Daily steps and strength training. The combo that protects your metabolism and changes shape, not just the scale."
          />
          <Pillar
            number="03"
            title="Recovery"
            body="Sleep, stress, and cycle awareness. The piece every weight-loss program ignores — and why they stop working after 35."
          />
        </div>
      </section>

      <div className="my-14 border-t border-outline-variant/40" />

      {/* CREDIBILITY */}
      <section className="space-y-6">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Who built this
        </p>
        <div className="flex items-start gap-4">
          {/* Sean monogram — matches the coach badge pattern */}
          <div
            className="shrink-0 w-16 h-16 rounded-full bg-charcoal text-gold flex items-center justify-center shadow-elevation-1"
            aria-hidden
          >
            <span className="font-display text-display-sm leading-none">S</span>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="font-display text-headline-sm text-charcoal">
                Sean Williams
              </p>
              <p className="font-body text-label-md text-on-surface-variant">
                Coach, RIVEN Method
              </p>
            </div>
            <p className="font-body text-body-md text-charcoal leading-relaxed">
              I built RIVEN for the women I&apos;ve been coaching for years —
              Black women 35–55 who&apos;d done every program twice and still
              felt stuck. The body you had at 25 isn&apos;t the body you have
              at 45, and the program has to match. This assessment is the
              same first conversation I&apos;d have with you before we built
              your plan.
            </p>
          </div>
        </div>

        <div className="rounded-md bg-secondary-container/30 border border-gold/40 p-gutter mt-4">
          <p className="font-body text-body-md text-charcoal leading-relaxed">
            <span className="font-body text-label-md tracking-widest uppercase text-on-surface-variant block mb-1.5">
              Real talk
            </span>
            Most women your age lose 3–5% of their muscle per decade if they
            don&apos;t actively train for it. That&apos;s why weight-loss-only
            plans stop working — and why &ldquo;eat less, move more&rdquo;
            keeps failing you. RIVEN is built around the levers that actually
            move the needle when your hormones, your sleep, and your life
            don&apos;t look like a 25-year-old&apos;s anymore.
          </p>
        </div>
      </section>

      <div className="my-14 border-t border-outline-variant/40" />

      {/* CTA REPEAT */}
      <section className="text-center space-y-3 pb-8">
        <Link
          href="/quiz/start"
          className="inline-block bg-charcoal text-cream py-5 px-10 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all"
        >
          Start the assessment
        </Link>
        <p className="font-body text-label-sm text-on-surface-variant/70">
          3 minutes · free · instant breakdown
        </p>
      </section>

      <div className="fixed top-[10%] right-[-10%] w-[35%] h-[35%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-[5%] left-[-10%] w-[30%] h-[30%] bg-sage/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

function Pillar({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1 space-y-2">
      <p className="font-body text-label-sm tracking-widest text-gold">{number}</p>
      <p className="font-display text-headline-sm text-charcoal">{title}</p>
      <p className="font-body text-body-md text-on-surface-variant leading-relaxed">
        {body}
      </p>
    </div>
  );
}
