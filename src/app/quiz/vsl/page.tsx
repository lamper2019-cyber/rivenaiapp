import Link from "next/link";

export const metadata = {
  title: "Watch the breakdown — RIVEN",
  description:
    "A 7-minute breakdown of how RIVEN turns peaceful discipline into pounds-off for Black women 35+. Watch, then decide.",
};

/**
 * WARM-bucket landing. Quiz takers scoring 50–74 land here from
 * /quiz/results/[id]. The video itself drops in via VSL_EMBED_URL once
 * Sean records it; the page renders a placeholder shell until then so
 * the route doesn't 404. Below the video, the CTA goes to /sign-up
 * (existing $50/mo, 7-day trial) — WARM doesn't get the founding rate.
 */

// SEAN: swap this to the real video embed URL when the VSL is recorded.
// Accepts YouTube, Vimeo, or self-hosted MP4 — see render below.
const VSL_EMBED_URL: string | null = null;

export default function VslPage() {
  return (
    <main className="relative min-h-screen flex flex-col px-container-mobile md:px-container-desktop max-w-3xl mx-auto py-10 md:py-14 space-y-section-gap">
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

      <section className="space-y-5 text-center">
        <span className="inline-block bg-tertiary-container/40 border border-sage/30 text-charcoal px-4 py-1.5 rounded-full font-body text-label-sm tracking-widest uppercase">
          The 7-minute breakdown
        </span>
        <h1 className="font-display text-display-sm md:text-display-md text-charcoal text-balance leading-[1.1]">
          How peaceful discipline turns into pounds-off
          <span className="text-on-surface-variant"> — </span>
          for women 35+
        </h1>
        <p className="font-body text-body-lg text-on-surface-variant max-w-xl mx-auto">
          Sean walks through the exact system. No fluff, no upsell-mid-video.
          Watch it once, then decide.
        </p>
      </section>

      {/* Video frame */}
      <section>
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-charcoal shadow-elevation-3 border-[8px] border-cream">
          {VSL_EMBED_URL ? (
            <iframe
              src={VSL_EMBED_URL}
              title="The RIVEN breakdown"
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-cream/80 p-gutter text-center">
              <span
                className="material-symbols-outlined text-[56px] text-gold mb-3"
                aria-hidden
              >
                play_circle
              </span>
              <p className="font-display text-headline-sm text-cream">
                Video lands here
              </p>
              <p className="font-body text-body-md text-cream/70 mt-2 max-w-sm">
                Sean&apos;s recording the breakdown right now. Drop your email
                below and we&apos;ll send the link the moment it&apos;s live.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="space-y-4 rounded-2xl bg-secondary-container/30 border border-gold/40 p-gutter md:p-8 shadow-elevation-1 text-center">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Ready to start?
        </p>
        <h2 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance max-w-xl mx-auto">
          Start your 7-day trial — see RIVEN from the inside
        </h2>
        <p className="font-body text-body-md text-on-surface-variant max-w-md mx-auto">
          $50/mo. Card held during trial, charged on day 8. Cancel anytime
          before then and pay nothing.
        </p>
        <div className="pt-1">
          <Link
            href="/sign-up"
            className="inline-block bg-charcoal text-cream py-4 px-10 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all"
          >
            Start the 7-day trial
          </Link>
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
