import fs from "fs";
import path from "path";
import Link from "next/link";
import { ScrollReveal } from "@/components/scroll-reveal";

export const metadata = {
  title: "Are you ready? — RIVEN Readiness Assessment",
  description:
    "A 3-minute assessment for Black women 35–55 doing body recomposition. Score your protein, movement, and recovery — get a tailored next step.",
};

/**
 * Top-of-funnel quiz landing page. Editorial / quiet-luxury treatment in
 * RIVEN's tokens (cream cream-space, gold accents, sage confirmation,
 * charcoal text). Same copy + flow as before; this pass elevates the feel:
 *
 *   A — Editorial pillar columns (typography-led, no Material icons)
 *   B — Pull-quote testimonials (no SaaS stars, plain time-marker captions)
 *   C — Hero anchor: thin-gold-rule eyebrow + ornament dot
 *   D — Varied section rhythm + scroll-triggered fade-ins
 *   E — Hero page-load choreography (sequential rise-in)
 *   F — Soul Food card with actual freebie thumbnail
 *   G — Editorial drop cap + thin gold rule on Mission
 *   H — Client portrait spread (graceful hide until icp-portrait.* lands
 *       in /public; checked at SSR via fs)
 */

const ICP_CANDIDATES = [
  "icp-portrait.jpg",
  "icp-portrait.png",
  "icp-portrait.webp",
];

/** Editorial section ornament — thin gold rule with a centered diamond.
 *  Used in the hero anchor and as the small motif between headline + body. */
function Ornament({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-3 ${className}`.trim()}
      aria-hidden
    >
      <span className="block w-8 h-px bg-gold/60" />
      <span className="text-gold text-sm leading-none">◆</span>
      <span className="block w-8 h-px bg-gold/60" />
    </div>
  );
}

export default function QuizLandingPage() {
  // SSR file-existence check for H. Renders the spread only if Sean's dropped
  // an icp-portrait.{jpg,png,webp} into /public. Falls back to nothing
  // (no broken image) until then.
  const icpFilename = ICP_CANDIDATES.find((name) => {
    try {
      fs.accessSync(path.join(process.cwd(), "public", name));
      return true;
    } catch {
      return false;
    }
  });
  const icpSrc = icpFilename ? `/${icpFilename}` : null;

  return (
    <main className="relative min-h-screen flex flex-col">
      {/* ───────────── Top nav ───────────── */}
      <nav className="sticky top-0 z-40 bg-cream/80 backdrop-blur-xl border-b border-outline-variant/30">
        <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop h-24 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center text-charcoal"
            aria-label="RIVEN home"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/riven-logo.png"
              alt=""
              width={500}
              height={500}
              className="h-20 w-auto object-contain"
            />
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

      {/* ───────── Hero — C (anchor) + E (choreography) ───────── */}
      <section className="relative overflow-hidden pt-14 md:pt-24 pb-20 md:pb-28">
        <div className="max-w-3xl mx-auto px-container-mobile md:px-container-desktop text-center">
          {/* C — Editorial eyebrow: gold rules + label, no chip. */}
          <div
            className="flex items-center justify-center gap-3 riven-rise-in"
            style={{ animationDelay: "100ms" }}
          >
            <span className="block w-10 h-px bg-gold/60" aria-hidden />
            <p className="font-body text-label-sm tracking-[0.3em] uppercase text-charcoal">
              The RIVEN Readiness Assessment
            </p>
            <span className="block w-10 h-px bg-gold/60" aria-hidden />
          </div>

          {/* E — Headline rises after eyebrow. */}
          <h1
            className="font-display text-display-md md:text-display-lg text-charcoal tracking-tight text-balance leading-[1.05] mt-8 riven-rise-in"
            style={{ animationDelay: "300ms" }}
          >
            Frustrated your body isn&apos;t responding the way it used to
            <span className="text-on-surface-variant"> — </span>
            <span className="italic font-display">even though</span>{" "}
            you&apos;re doing everything you&apos;re &ldquo;supposed&rdquo; to?
          </h1>

          {/* C — Small ornament between headline + body. */}
          <Ornament
            className="mt-8 riven-rise-in"
            // animation-delay is on the inline style below; this className just
            // marks it for the keyframe. Wrapper handles delay.
          />
          <div
            className="riven-rise-in"
            style={{ animationDelay: "500ms" }}
            aria-hidden
          >
            {/* invisible placeholder so the ornament's stagger feels real */}
          </div>

          <p
            className="font-body text-body-lg text-on-surface-variant max-w-xl mx-auto mt-8 riven-rise-in"
            style={{ animationDelay: "650ms" }}
          >
            Answer 15 questions and find out exactly why — and what to do
            about it. Built for Black women 35–55 doing real body
            recomposition.
          </p>

          <div
            className="pt-6 riven-rise-in"
            style={{ animationDelay: "900ms" }}
          >
            <Link
              href="/quiz/start"
              className="block w-full sm:inline-block sm:w-auto sm:min-w-[20rem] text-center bg-charcoal text-cream py-4 px-10 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all"
            >
              Start the assessment
            </Link>
          </div>

          <p
            className="font-body text-label-sm text-on-surface-variant/70 pt-3 riven-rise-in"
            style={{ animationDelay: "1100ms" }}
          >
            3 minutes · free · instant breakdown
          </p>
        </div>

        {/* Ambient decorative blurs */}
        <div
          className="absolute top-12 right-[-8%] w-72 h-72 bg-gold/15 rounded-full blur-3xl pointer-events-none -z-10"
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-[-8%] w-80 h-80 bg-sage/15 rounded-full blur-3xl pointer-events-none -z-10"
          aria-hidden
        />
      </section>

      {/* ────── 3 Pillars — A (editorial typography-led columns) ────── */}
      <section
        id="how-it-works"
        className="bg-surface-container-low/50 py-20 md:py-28"
      >
        <ScrollReveal>
          <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop">
            <div className="text-center space-y-3 mb-14 md:mb-20">
              <Ornament className="mb-6" />
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

            {/* A — typography-led columns. No box, no icon, no shadow.
                Big serif numeral + thin gold rule + title + body. */}
            <div className="grid gap-12 md:gap-16 sm:grid-cols-3">
              <PillarColumn
                number="01"
                title="Nutrition rhythm"
                body="Protein, calories, and meal timing — the lever most women aren't pulling, no matter how clean they eat."
              />
              <PillarColumn
                number="02"
                title="Movement"
                body="Daily steps and strength training. The combo that protects your metabolism and changes shape, not just the scale."
              />
              <PillarColumn
                number="03"
                title="Recovery"
                body="Sleep, stress, and cycle awareness. The piece every weight-loss program ignores — and why they stop working after 35."
              />
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ────── Mission — G (drop cap + thin rule) ────── */}
      <section className="py-24 md:py-32">
        <ScrollReveal>
          <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
              <div className="relative">
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
                </div>
              </div>

              <div className="space-y-5">
                <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
                  Our approach
                </p>
                {/* G — thin gold rule under the eyebrow, editorial signal. */}
                <span className="block w-12 h-px bg-gold/70" aria-hidden />
                <h2 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
                  Built for the women every other program forgot
                </h2>

                {/* Per Sean: break the wall of text into texting-style
                    thoughts — one beat per paragraph, more breath between
                    them. The drop cap rides the first paragraph; size
                    reduced to 4rem so it doesn't overshoot the now-shorter
                    first beat. */}
                <div className="space-y-6">
                  <p className="font-body text-body-lg text-on-surface-variant leading-relaxed first-letter:font-display first-letter:text-[4rem] first-letter:leading-[0.8] first-letter:float-left first-letter:mr-3 first-letter:mt-1 first-letter:text-charcoal">
                    I built RIVEN for the women I&apos;ve been coaching for years —
                    Black women 35–55 who&apos;d done every program twice and still
                    felt stuck.
                  </p>
                  <p className="font-body text-body-lg text-on-surface-variant leading-relaxed">
                    The body you had at 25 isn&apos;t the body you have at 45,
                    and the program has to match.
                  </p>
                  <p className="font-body text-body-lg text-on-surface-variant leading-relaxed">
                    Most women your age lose 3–5% of their muscle per decade if
                    they don&apos;t actively train for it.
                  </p>
                  <p className="font-body text-body-lg text-on-surface-variant leading-relaxed">
                    That&apos;s why weight-loss-only plans stop working — and
                    why &ldquo;eat less, move more&rdquo; keeps failing you.
                  </p>
                  <p className="font-body text-body-lg text-on-surface-variant leading-relaxed">
                    RIVEN is built around the levers that actually move the
                    needle when your hormones, your sleep, and your life
                    doesn&apos;t look like a 25-year-old&apos;s anymore.
                  </p>
                </div>
                <p className="font-body text-label-md tracking-wide text-charcoal pt-2">
                  — Sean Williams, RIVEN
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ────── Voices — B (pull-quotes, no stars, plain captions) ────── */}
      <section className="bg-charcoal text-cream py-20 md:py-28">
        <ScrollReveal>
          <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop">
            <div className="text-center space-y-3 mb-14 md:mb-20">
              <div
                className="flex items-center justify-center gap-3 mb-6"
                aria-hidden
              >
                <span className="block w-10 h-px bg-gold/60" />
                <span className="text-gold text-sm leading-none">◆</span>
                <span className="block w-10 h-px bg-gold/60" />
              </div>
              <p className="font-body text-label-md tracking-widest uppercase text-gold">
                Voices
              </p>
              <h2 className="font-display text-headline-lg-mobile md:text-headline-lg text-cream text-balance max-w-2xl mx-auto">
                Real stories from women who stopped white-knuckling
              </h2>
            </div>

            <div className="grid gap-12 md:gap-14 md:grid-cols-3">
              <PullQuote
                quote="I tried everything. RIVEN was the first time the numbers actually moved."
                name="Keisha"
                tagline="Two months in"
              />
              <PullQuote
                quote="Sean's voice in my pocket every Monday is what made it stick."
                name="Yvonne"
                tagline="Six months"
              />
              <PullQuote
                quote="I stopped white-knuckling food. Real change, not all-or-nothing."
                name="Brianna"
                tagline="22 weeks in"
              />
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ────── H — Client portrait spread (renders only if file exists) ────── */}
      {icpSrc && (
        <section className="py-20 md:py-28">
          <ScrollReveal>
            <div className="max-w-5xl mx-auto px-container-mobile md:px-container-desktop">
              <div className="relative rounded-[2rem] overflow-hidden shadow-elevation-3 border-[10px] border-cream">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={icpSrc}
                  alt=""
                  className="w-full aspect-[21/9] object-cover"
                />
              </div>
              <p className="font-body text-body-lg text-charcoal italic leading-relaxed mt-8 max-w-xl mx-auto text-center">
                Two months in. Logging is just what I do now.
              </p>
            </div>
          </ScrollReveal>
        </section>
      )}

      {/* ────── Final CTA (tighter — close the loop) ────── */}
      <section className="py-16 md:py-20">
        <ScrollReveal>
          <div className="max-w-3xl mx-auto px-container-mobile md:px-container-desktop">
            <div className="rounded-[2rem] bg-secondary-container/40 border border-gold/40 px-gutter py-12 md:py-14 text-center space-y-5 shadow-elevation-2">
              <Ornament />
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
        </ScrollReveal>
      </section>

      {/* ────── F — Soul Food card with real thumbnail ────── */}
      <section className="pb-16 md:pb-24">
        <ScrollReveal>
          <div className="max-w-3xl mx-auto px-container-mobile md:px-container-desktop">
            <a
              href="/downloads/freebie.png"
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl bg-surface-container-lowest border border-outline-variant/60 px-gutter py-5 shadow-elevation-1 hover:shadow-elevation-2 hover:border-gold/50 transition-all"
            >
              <div className="flex items-center gap-4">
                {/* F — actual freebie preview instead of a Material icon.
                    Small portrait-orientation thumb so she sees a hint of
                    the layout. */}
                <div className="shrink-0 w-14 h-16 rounded-md overflow-hidden border border-outline-variant/60 bg-cream shadow-elevation-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/downloads/freebie.png"
                    alt=""
                    width={500}
                    height={625}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-label-sm tracking-widest uppercase text-gold">
                    Not ready yet? Quick win first
                  </p>
                  <p className="font-display text-headline-sm text-charcoal leading-tight mt-1">
                    The RIVEN Soul Food Cheat Sheet
                  </p>
                  <p className="font-body text-body-md text-on-surface-variant mt-1">
                    Cultural foods Black women 35+ can eat AND lose weight on.
                    Free download, no signup.
                  </p>
                </div>
                <span
                  className="material-symbols-outlined text-charcoal/50 shrink-0 self-center"
                  aria-hidden
                >
                  download
                </span>
              </div>
            </a>
          </div>
        </ScrollReveal>
      </section>

      {/* ────── Footer ────── */}
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

      {/* Ambient page-wide blurs (kept subtle) */}
      <div className="fixed top-[20%] right-[-15%] w-[40%] h-[40%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-[10%] left-[-15%] w-[35%] h-[35%] bg-sage/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

/* ───────────── A — Editorial pillar column ───────────── */
function PillarColumn({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="space-y-4">
      <p className="font-display text-display-md text-gold leading-none">
        {number}
      </p>
      <span className="block w-10 h-px bg-gold/60" aria-hidden />
      <h3 className="font-display text-headline-sm text-charcoal">{title}</h3>
      <p className="font-body text-body-md text-on-surface-variant leading-relaxed">
        {body}
      </p>
    </div>
  );
}

/* ───────────── B — Pull-quote testimonial ───────────── */
function PullQuote({
  quote,
  name,
  tagline,
}: {
  quote: string;
  name: string;
  tagline: string;
}) {
  return (
    <figure className="space-y-5">
      <span
        className="font-display text-display-lg text-gold leading-none block select-none"
        aria-hidden
      >
        “
      </span>
      <blockquote className="font-body text-body-lg text-cream italic leading-relaxed">
        {quote}
      </blockquote>
      <figcaption className="space-y-2">
        <span className="block w-12 h-px bg-cream/40" aria-hidden />
        <p className="font-body text-label-md tracking-widest uppercase text-cream/80">
          {name} · {tagline}
        </p>
      </figcaption>
    </figure>
  );
}
