import Link from "next/link";

const HERO_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDVySudo5N655CccxJkSI1W4KLMS2kIe1GfxHIYxWXZPfbzHpEFqlhS89ZU08nbqYzK-PpeC6SeXHbAIaxEGQA4dI-HJnvB87tmjoVgvMbAC2-9xCvcL0wWxaocNZBskTUMjONsn-nQHaYUaVAmVVurnNfk5SjCA57HcR_8upLve1nheLl-kopgWMX5Aela6MIYu6F5p2Wmcbve2fcjYYTlK4tGPcj9pc73z6SeTzMM9KQYlv_0nzwlom_n3I0rku7klzMTOV_ASS1d";

export default function WelcomePage() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-between py-12 px-container-mobile md:px-container-desktop max-w-7xl mx-auto w-full overflow-x-hidden">
      {/* Wordmark */}
      <div className="w-full flex justify-center mb-12">
        <h2 className="font-display text-headline-lg tracking-[0.3em] text-charcoal">
          RIVEN
        </h2>
      </div>

      {/* Hero */}
      <div className="flex-grow flex flex-col items-center justify-center text-center max-w-2xl space-y-8">
        <div className="relative w-full aspect-[4/5] md:aspect-video rounded-xl overflow-hidden shadow-elevation-1 mb-8 bg-surface-container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HERO_IMAGE}
            alt="A serene portrait of a mature Black woman in a minimalist wellness sanctuary, captured in soft golden-hour light."
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-cream/40 to-transparent" />
        </div>

        <div className="space-y-4">
          <h1 className="font-display text-display-lg text-charcoal tracking-tight">
            Welcome to RIVEN
          </h1>
          <p className="font-body text-body-lg text-on-primary-container max-w-md mx-auto">
            Your transformation starts today.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="w-full max-w-sm mt-12 space-y-6">
        <Link
          href="/sign-up"
          className="block w-full text-center bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 hover:opacity-90 shadow-elevation-2"
        >
          Let&apos;s begin
        </Link>
        <div className="flex items-center justify-center gap-2 text-on-primary-container/60">
          <span className="material-symbols-outlined text-[18px]">verified_user</span>
          <span className="font-body text-label-sm tracking-wide">
            Private &amp; Intentional Growth
          </span>
        </div>
        <p className="text-center font-body text-label-sm text-on-surface-variant/70">
          Already a member?{" "}
          <Link href="/sign-in" className="text-charcoal underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>

      {/* Decorative ambient glows (DESIGN.md: subtle warm halos) */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-gold/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-sage/5 blur-[100px] rounded-full pointer-events-none" />
    </main>
  );
}
