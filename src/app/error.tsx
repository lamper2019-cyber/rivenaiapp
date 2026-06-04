"use client";

// Route-level error boundary. Next.js renders this in place of any segment
// that throws during render so a single broken component never white-screens
// the whole app. `reset()` re-attempts rendering the failed segment.
//
// Kept in RIVEN's voice: calm, no blame, one clear action. Cream background,
// charcoal text, gold accent — same brand as every other screen.

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the server console (Railway logs). When error tracking
    // (Sentry) is wired up, this is where we'd also report it.
    console.error("[route-error]", error);
  }, [error]);

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center text-center px-container-mobile md:px-container-desktop max-w-md mx-auto">
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-4">
        Something slipped
      </p>
      <h1 className="font-display text-display-md text-charcoal tracking-tight mb-4">
        Let&apos;s try that again.
      </h1>
      <p className="font-body text-body-md text-on-surface-variant mb-8">
        A piece of this screen didn&apos;t load right. Your data is safe — give
        it another tap.
      </p>

      <div className="w-full max-w-xs space-y-3">
        <button
          type="button"
          onClick={() => reset()}
          className="block w-full text-center bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 hover:opacity-90 shadow-elevation-2"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="block w-full text-center bg-transparent text-charcoal py-5 rounded-full font-body text-label-md tracking-widest uppercase border border-charcoal transition-all active:scale-95 hover:bg-charcoal/5"
        >
          Back to home
        </a>
      </div>

      {/* Ambient gold glow — matches the brand's atmospheric accent. */}
      <div className="fixed top-[20%] right-[-10%] w-[35%] h-[35%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
