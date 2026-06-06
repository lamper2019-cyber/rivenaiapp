import Link from "next/link";
import Image from "next/image";
import { WelcomeAuthRedirect } from "./welcome-auth-redirect";
import { HideInNativeApp } from "./hide-in-native-app";

// Self-hosted welcome hero. Previously sourced from lh3.googleusercontent.com,
// which forced Railway's image optimizer to fetch upstream → re-encode →
// serve. Local hosting eliminates the upstream roundtrip; Next still emits
// AVIF/WebP variants and the responsive srcset.
const HERO_IMAGE = "/welcome-hero.png";

export default function WelcomePage() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-between py-12 px-container-mobile md:px-container-desktop max-w-7xl mx-auto w-full overflow-x-hidden">
      {/* Signed-in users skip the welcome page entirely — drops them straight
          on the dashboard. Client-side so this page stays statically
          renderable and Cloudflare-cacheable for signed-out visitors. */}
      <WelcomeAuthRedirect />

      {/* Wordmark */}
      <div className="w-full flex justify-center mb-12">
        <h2 className="font-display text-headline-lg tracking-[0.3em] text-charcoal">
          RIVEN
        </h2>
      </div>

      {/* Hero */}
      <div className="flex-grow flex flex-col items-center justify-center text-center max-w-2xl space-y-8">
        <div className="relative w-full aspect-[4/5] md:aspect-video rounded-xl overflow-hidden shadow-elevation-1 mb-8 bg-surface-container">
          <Image
            src={HERO_IMAGE}
            alt="A serene portrait of a mature Black woman in a minimalist wellness sanctuary, captured in soft golden-hour light."
            fill
            sizes="(max-width: 768px) 100vw, 672px"
            priority
            className="object-cover"
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

      {/* CTAs — Sign in primary (returning members are the majority), new
          visitor secondary. Both full-width tap targets. */}
      <div className="w-full max-w-sm mt-12 space-y-3">
        <Link
          href="/sign-in"
          className="block w-full text-center bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 hover:opacity-90 shadow-elevation-2"
        >
          Sign in
        </Link>
        {/* "I'm new" is web-only. Inside the iOS app we hide it (Netflix model:
            new members join + pay on the web, the app is sign-in only). */}
        <HideInNativeApp>
          <Link
            href="/sign-up"
            className="block w-full text-center bg-transparent text-charcoal py-5 rounded-full font-body text-label-md tracking-widest uppercase border border-charcoal transition-all active:scale-95 hover:bg-charcoal/5"
          >
            I&apos;m new — start here
          </Link>
        </HideInNativeApp>
        <div className="flex items-center justify-center gap-2 text-on-primary-container/60 pt-3">
          <span className="material-symbols-outlined text-[18px]">verified_user</span>
          <span className="font-body text-label-sm tracking-wide">
            Private &amp; Intentional Growth
          </span>
        </div>
      </div>
    </main>
  );
}
