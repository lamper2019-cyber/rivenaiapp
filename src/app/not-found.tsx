import Link from "next/link";

// Branded 404. Replaces Next.js's bare gray default for any URL that doesn't
// match a route. Same calm cream/charcoal/gold language as the rest of RIVEN.
export default function NotFound() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center text-center px-container-mobile md:px-container-desktop max-w-md mx-auto">
      <p className="font-display text-display-lg text-charcoal tracking-tight mb-2">
        404
      </p>
      <h1 className="font-display text-headline-md text-charcoal tracking-tight mb-4">
        This page wandered off.
      </h1>
      <p className="font-body text-body-md text-on-surface-variant mb-8">
        The link may be old or mistyped. Let&apos;s get you back on track.
      </p>

      <div className="w-full max-w-xs space-y-3">
        <Link
          href="/dashboard"
          className="block w-full text-center bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 hover:opacity-90 shadow-elevation-2"
        >
          Go to home
        </Link>
        <Link
          href="/"
          className="block w-full text-center bg-transparent text-charcoal py-5 rounded-full font-body text-label-md tracking-widest uppercase border border-charcoal transition-all active:scale-95 hover:bg-charcoal/5"
        >
          Back to welcome
        </Link>
      </div>

      <div className="fixed bottom-[15%] left-[-10%] w-[35%] h-[35%] bg-sage/10 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
