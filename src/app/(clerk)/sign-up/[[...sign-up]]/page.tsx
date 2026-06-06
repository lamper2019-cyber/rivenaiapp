import Link from "next/link";
import { headers } from "next/headers";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  // See sign-in page for the full reasoning: Google OAuth dead-ends inside the
  // iOS webview, so we hide it when running in the native shell (RIVENApp UA).
  // On the web it stays. Email + Sign in with Apple remain available in the app.
  const isNativeApp = (headers().get("user-agent") ?? "").includes("RIVENApp");

  // Netflix model: you can't create an account (or pay) inside the iOS app —
  // Apple's rules make in-app subscriptions a 30% tax, so RIVEN is usage-only on
  // iOS. New members join on the web; the app is sign-in only. Instead of the
  // signup form, show a calm pointer to the website and a sign-in link for
  // members who already joined. (App Store reviewers get a comped demo account,
  // so this screen never blocks them.)
  if (isNativeApp) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-container-mobile py-12 max-w-sm mx-auto">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-4">
          Join RIVEN
        </p>
        <h1 className="font-display text-headline-lg text-charcoal tracking-tight mb-4">
          Memberships start on the web.
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mb-8">
          Head to <span className="text-charcoal">rivenmethod.com</span> to take
          the quiz and start your trial. Once you&apos;re in, come back here and
          sign in — everything syncs.
        </p>
        <Link
          href="/sign-in"
          className="block w-full text-center bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 hover:opacity-90 shadow-elevation-2"
        >
          I already have an account
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-container-mobile py-12">
      <SignUp
        appearance={{
          elements: {
            rootBox: "w-full max-w-sm",
            card: "bg-surface-container-lowest shadow-elevation-1 rounded-lg",
            headerTitle: "font-display text-headline-md text-charcoal",
            formButtonPrimary:
              "bg-charcoal text-cream rounded-full py-3 uppercase tracking-widest text-label-md normal-case",
            ...(isNativeApp
              ? {
                  socialButtonsBlockButton__google: "hidden",
                  socialButtonsIconButton__google: "hidden",
                }
              : {}),
          },
        }}
      />
    </main>
  );
}
