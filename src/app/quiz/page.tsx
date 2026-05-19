import Link from "next/link";

export const metadata = {
  title: "Are you ready? — RIVEN Readiness Assessment",
  description:
    "A 3-minute assessment for Black women 35–55 doing body recomposition. Score your protein, movement, and recovery — get a tailored next step.",
};

/**
 * Top-of-funnel quiz landing page. SereneHealth-inspired layout (hero with
 * portrait + glass caption, 3-pillar grid, mission strip, testimonials on
 * dark surface, final CTA) — but in RIVEN's tokens. Cream cream-space,
 * gold accents, sage confirmation chips, charcoal text. No new colors.
 */
export default function QuizLandingPage() {
  return (
    <main className="relative min-h-screen flex flex-col">
      {/* ───────────── Top nav ───────────── */}
      <nav className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-outline-variant/30">
        <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop h-16 flex items-center justify-between">
          <Link
            href="/"
            className="font-display text-headline-md tracking-[0.2em] text-charcoal"
          >
            RIVEN
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="hidden sm:inline-block font-body text-label-md tracking-wide text-charcoal hover:opacity-70 transition-opacity"
            >
              Sign in
            </Link>
            <Link
              href="/quiz/start"
              className="bg-charcoal text-cream px-4 py-2.5 rounded-full font-body text-label-sm tracking-widest uppercase shadow-elevation-1 active:scale-95 hover:opacity-90 transition-all"
            >
              Start assessment
            </Link>
          </div>
        </div>
      </nav>

      {/* ───────────── Hero ───────────── */}
      <section className="relative overflow-hidden pt-12 md:pt-20 pb-16 md:pb-24">
        <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Hook side */}
          <div className="text-center lg:text-left space-y-6 order-2 lg:order-1">
            <span className="inline-block bg-tertiary-container/40 border border-sage/30 text-charcoal px-4 py-1.5 rounded-full font-body text-label-sm tracking-widest uppercase">
              The RIVEN Readiness Assessment
            </span>
            <h1 className="font-display text-display-md md:text-display-lg text-charcoal tracking-tight text-balance leading-[1.05]">
              Frustrated your body isn&apos;t responding the way it used to
              <span className="text-on-surface-variant"> — </span>
              <span className="italic font-display">even though</span>{" "}
              you&apos;re doing everything you&apos;re &ldquo;supposed&rdquo; to?
            </h1>
            <p className="font-body text-body-lg text-on-surface-variant max-w-xl mx-auto lg:mx-0">
              Answer 15 questions and find out exactly why — and what to do
              about it. Built for Black women 35–55 doing real body
              recomposition.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start pt-2">
              <Link
                href="/quiz/start"
                className="inline-block bg-charcoal text-cream py-4 px-8 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all"
              >
                Start the assessment
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 border border-charcoal/60 text-charcoal py-4 px-8 rounded-full font-body text-label-md tracking-widest uppercase hover:bg-charcoal/5 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">
                  expand_more
                </span>
                How it works
              </Link>
            </div>
            <p className="font-body text-label-sm text-on-surface-variant/70 pt-1">
              3 minutes · free · instant breakdown
            </p>
          </div>

          {/* Portrait side */}
          <div className="relative order-1 lg:order-2">
            {/* Decorative blurs behind the photo */}
            <div
              className="absolute -top-8 -right-8 w-60 h-60 bg-gold/15 rounded-full blur-3xl pointer-events-none"
              aria-hidden
            />
            <div
              className="absolute -bottom-10 -left-10 w-72 h-72 bg-sage/15 rounded-full blur-3xl pointer-events-none"
              aria-hidden
            />

            <div className="relative rounded-[2rem] overflow-hidden border-[10px] border-cream shadow-elevation-3 bg-charcoal/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/sean-portrait.jpg"
                alt="Sean Williams, coach and creator of RIVEN"
                width={948}
                height={1117}
                className="w-full aspect-[4/5] object-cover"
              />

              {/* Glass caption */}
              <div className="absolute bottom-5 left-5 right-5 bg-cream/70 backdrop-blur-xl border border-cream/60 rounded-2xl px-4 py-3 shadow-elevation-2">
                <div className="flex items-center gap-3">
                  <span
                    className="shrink-0 w-9 h-9 rounded-full bg-charcoal text-gold flex items-center justify-center font-display text-headline-sm leading-none"
                    aria-hidden
                  >
                    S
                  </span>
                  <div className="min-w-0">
                    <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant leading-tight">
                      Your coach
                    </p>
                    <p className="font-display text-headline-sm text-charcoal leading-tight truncate">
                      Sean Williams
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── 3 pillars ───────────── */}
      <section
        id="how-it-works"
        className="bg-surface-container-low/50 py-16 md:py-24"
      >
        <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop">
          <div className="text-center space-y-3 mb-12">
            <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
              What this scores
            </p>
            <h2 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance max-w-2xl mx-auto">
              The three things that actually drive body recomp after 35
            </h2>
            <p className="font-body text-body-lg text-on-surface-variant max-w-xl mx-auto">
              We score — and give you a plan for — each one.
            </p>
          </div>

          <div className="grid gap-4 md:gap-6 sm:grid-cols-3">
            <Pillar
              number="01"
              icon="restaurant"
              title="Nutrition rhythm"
              body="Protein, calories, and meal timing — the lever most women aren't pulling, no matter how clean they eat."
            />
            <Pillar
              number="02"
              icon="fitness_center"
              title="Movement"
              body="Daily steps and strength training. The combo that protects your metabolism and changes shape, not just the scale."
            />
            <Pillar
              number="03"
              icon="bedtime"
              title="Recovery"
              body="Sleep, stress, and cycle awareness. The piece every weight-loss program ignores — and why they stop working after 35."
            />
          </div>
        </div>
      </section>

      {/* ───────────── Mission + stats ───────────── */}
      <section className="py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop space-y-10">
          <div className="space-y-4 max-w-2xl">
            <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
              Our approach
            </p>
            <h2 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
              Built for the women every other program forgot
            </h2>
            <p className="font-body text-body-lg text-on-surface-variant leading-relaxed">
              I built RIVEN for the women I&apos;ve been coaching for years —
              Black women 35–55 who&apos;d done every program twice and still
              felt stuck. The body you had at 25 isn&apos;t the body you have
              at 45, and the program has to match.
            </p>
            <p className="font-body text-body-lg text-on-surface-variant leading-relaxed">
              Most women your age lose 3–5% of their muscle per decade if they
              don&apos;t actively train for it. That&apos;s why weight-loss-only
              plans stop working — and why &ldquo;eat less, move more&rdquo;
              keeps failing you. RIVEN is built around the levers that actually
              move the needle when your hormones, your sleep, and your life
              don&apos;t look like a 25-year-old&apos;s anymore.
            </p>
          </div>

          {/* Stat strip — placeholder numbers; Sean swap with real ones */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 pt-2 border-t border-outline-variant/40">
            <Stat number="8" label="Founding members" />
            <Stat number="12 wk" label="To visible change" />
            <Stat number="0.8g/lb" label="Protein floor" />
            <Stat number="100%" label="Sean reads every log" />
          </div>
        </div>
      </section>

      {/* ───────────── Voices ───────────── */}
      <section className="bg-charcoal text-cream py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop">
          <div className="text-center space-y-3 mb-12">
            <p className="font-body text-label-md tracking-widest uppercase text-gold">
              Voices
            </p>
            <h2 className="font-display text-headline-lg-mobile md:text-headline-lg text-cream text-balance">
              Real stories from women who stopped white-knuckling
            </h2>
          </div>

          <div className="grid gap-4 md:gap-6 md:grid-cols-3">
            <Testimonial
              quote="I tried everything. RIVEN was the first time the numbers actually moved."
              name="Keisha"
              tagline="Lost 14 lbs in 11 weeks"
            />
            <Testimonial
              quote="Sean's voice in my pocket every Monday is what made it stick."
              name="Yvonne"
              tagline="Down 2½ inches off her waist"
            />
            <Testimonial
              quote="I stopped white-knuckling food. Real change, not all-or-nothing."
              name="Brianna"
              tagline="22 weeks in"
            />
          </div>

          <p className="font-body text-label-sm text-cream/50 text-center mt-8">
            {/* SEAN: swap these for real client quotes when you have consent. */}
            Sample placeholders — swap with real quotes once approved.
          </p>
        </div>
      </section>

      {/* ───────────── Final CTA ───────────── */}
      <section className="py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-container-mobile md:px-container-desktop">
          <div className="rounded-[2rem] bg-secondary-container/40 border border-gold/40 px-gutter py-12 md:py-14 text-center space-y-5 shadow-elevation-2">
            <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
              Ready to find out?
            </p>
            <h2 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance max-w-xl mx-auto">
              15 questions stand between you and a real plan.
            </h2>
            <p className="font-body text-body-md text-on-surface-variant max-w-md mx-auto">
              3 minutes. No card needed. Sean reads every result.
            </p>
            <div className="pt-2">
              <Link
                href="/quiz/start"
                className="inline-block bg-charcoal text-cream py-4 px-10 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all"
              >
                Start the assessment
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── Footer ───────────── */}
      <footer className="border-t border-outline-variant/40 py-8">
        <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="font-display text-headline-sm tracking-[0.2em] text-charcoal">
            RIVEN
          </p>
          <p className="font-body text-label-sm text-on-surface-variant/70">
            Premium coaching for Black women 35–55 ·{" "}
            <a
              href="mailto:lamper.2019@gmail.com"
              className="underline underline-offset-4 text-charcoal"
            >
              Contact Sean
            </a>
          </p>
        </div>
      </footer>

      {/* Page-wide decorative blurs (kept subtle) */}
      <div className="fixed top-[20%] right-[-15%] w-[40%] h-[40%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-[10%] left-[-15%] w-[35%] h-[35%] bg-sage/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

function Pillar({
  number,
  icon,
  title,
  body,
}: {
  number: string;
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1 space-y-3">
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl bg-tertiary-container/50 flex items-center justify-center text-charcoal"
          aria-hidden
        >
          <span className="material-symbols-outlined text-[22px]">{icon}</span>
        </span>
        <p className="font-body text-label-sm tracking-widest uppercase text-gold">
          {number}
        </p>
      </div>
      <p className="font-display text-headline-sm text-charcoal">{title}</p>
      <p className="font-body text-body-md text-on-surface-variant leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <p className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal leading-none">
        {number}
      </p>
      <p className="font-body text-label-sm tracking-wide text-on-surface-variant mt-2">
        {label}
      </p>
    </div>
  );
}

function Testimonial({
  quote,
  name,
  tagline,
}: {
  quote: string;
  name: string;
  tagline: string;
}) {
  return (
    <figure className="rounded-2xl bg-charcoal/40 border border-cream/15 p-gutter space-y-4 shadow-elevation-1">
      <div className="flex gap-1 text-gold" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="material-symbols-outlined text-[16px]">
            star
          </span>
        ))}
      </div>
      <blockquote className="font-body text-body-md text-cream leading-relaxed italic">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <figcaption className="flex items-center gap-3 pt-1">
        <span
          className="shrink-0 w-9 h-9 rounded-full bg-secondary-container/40 border border-gold/40 flex items-center justify-center font-display text-label-md text-cream"
          aria-hidden
        >
          {name.charAt(0)}
        </span>
        <div>
          <p className="font-body text-body-md text-cream leading-tight">{name}</p>
          <p className="font-body text-label-sm text-cream/60 leading-tight">
            {tagline}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
