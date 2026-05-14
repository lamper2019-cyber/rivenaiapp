import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/stripe";
import { startCheckout } from "./actions";

export const metadata = {
  title: "Pricing — RIVEN",
  description: "Premium coaching app for body recomposition. $50/month, 7-day free trial.",
};

/**
 * Public pricing page. Handles three states:
 *   1. Signed out → CTA goes to /sign-up
 *   2. Signed in, no active subscription → "Start free trial" button calls
 *      the startCheckout server action which bounces to Stripe Checkout
 *   3. Signed in, already subscribed → "You're already on RIVEN" + dashboard link
 *
 * Lives outside the (clerk) route group so it's not blocked by Clerk-protected
 * middleware. Public route allowlist in middleware.ts includes /pricing.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams?: { canceled?: string };
}) {
  const { userId } = auth();

  let signedIn = false;
  let alreadySubscribed = false;

  if (userId) {
    signedIn = true;
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { subscriptionStatus: true, role: true },
      });
      if (user?.role === "COACH" || hasActiveSubscription(user?.subscriptionStatus)) {
        alreadySubscribed = true;
      }
    } catch {
      /* DB unreachable — render the public state, paywall will catch later */
    }
  }

  return (
    <main className="relative min-h-screen flex flex-col px-container-mobile md:px-container-desktop max-w-3xl mx-auto py-12">
      <header className="flex justify-between items-center mb-12">
        <Link href="/" className="font-display text-headline-md tracking-[0.2em] text-charcoal">
          RIVEN
        </Link>
        {!signedIn && (
          <Link
            href="/sign-in"
            className="font-body text-label-md tracking-wide text-charcoal underline underline-offset-4"
          >
            Sign in
          </Link>
        )}
      </header>

      <div className="flex-grow flex flex-col items-center justify-center text-center space-y-6">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Membership
        </p>
        <h1 className="font-display text-display-lg text-charcoal tracking-tight max-w-2xl text-balance">
          The whole protocol, in your pocket.
        </h1>
        <p className="font-body text-body-lg text-on-surface-variant max-w-md mx-auto">
          Voice meal logging, Sean&apos;s coaching voice, weekly check-ins, Monday morning
          accountability. Built for Black women 35-55 doing real recomposition.
        </p>

        {searchParams?.canceled && (
          <div className="rounded-md bg-soft-red/10 border border-soft-red/40 px-gutter py-3 max-w-md">
            <p className="font-body text-body-md text-charcoal">
              Trial sign-up was canceled. No charge happened. Try again when you&apos;re ready.
            </p>
          </div>
        )}

        <div className="rounded-md bg-cream border border-gold/60 shadow-elevation-2 px-gutter py-8 mt-6 w-full max-w-sm space-y-5">
          <div>
            <p className="font-display text-display-md text-charcoal leading-none">
              $50
              <span className="font-body text-body-lg text-on-surface-variant"> / month</span>
            </p>
            <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mt-2">
              7-day free trial
            </p>
          </div>

          <ul className="space-y-2 text-left">
            <Feature>RIVEN AI in Sean&apos;s voice — chat anytime</Feature>
            <Feature>Voice meal logging with cultural food knowledge</Feature>
            <Feature>Personalized daily targets and progress tracking</Feature>
            <Feature>Sunday weekly check-ins + Monday Sean check-ins</Feature>
            <Feature>Weekly content prompts for accountability</Feature>
            <Feature>Cancel anytime through your billing portal</Feature>
          </ul>

          {alreadySubscribed ? (
            <Link
              href="/dashboard"
              className="block w-full text-center bg-charcoal text-cream py-4 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 transition-all"
            >
              You&apos;re on RIVEN — open dashboard
            </Link>
          ) : signedIn ? (
            <form action={startCheckout}>
              <button
                type="submit"
                className="block w-full text-center bg-charcoal text-cream py-4 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all"
              >
                Start your 7-day trial
              </button>
            </form>
          ) : (
            <Link
              href="/sign-up"
              className="block w-full text-center bg-charcoal text-cream py-4 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all"
            >
              Start your 7-day trial
            </Link>
          )}

          <p className="font-body text-label-sm text-on-surface-variant/70 text-center">
            Card is held during the trial. Charged $50 on day 8. Cancel any time
            before then and pay nothing.
          </p>
        </div>

        <p className="font-body text-label-sm text-on-surface-variant/70 max-w-md mx-auto mt-4">
          Need 1:1 coaching with Sean directly? That&apos;s separate from the app.{" "}
          <a
            href="mailto:lamper.2019@gmail.com"
            className="underline underline-offset-4 text-charcoal"
          >
            Reach out
          </a>
          .
        </p>
      </div>

      <div className="fixed top-[10%] right-[-10%] w-[35%] h-[35%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 font-body text-body-md text-charcoal">
      <span
        className="material-symbols-outlined text-sage text-[18px] mt-0.5 shrink-0"
        aria-hidden
      >
        check_circle
      </span>
      <span>{children}</span>
    </li>
  );
}
