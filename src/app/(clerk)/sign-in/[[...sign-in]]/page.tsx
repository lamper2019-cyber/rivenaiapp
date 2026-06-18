import { headers } from "next/headers";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  // Social logins dead-end inside the iOS webview: Google blocks webview OAuth
  // by policy, and Sign in with Apple errored in App Review (rejection
  // 2026-06-18, Guideline 2.1(a), tested on iPad). So in the native shell
  // (detected via the `RIVENApp` user-agent tag from capacitor.config.ts) we
  // hide BOTH and leave EMAIL + PASSWORD as the only in-app method — the
  // reviewer's demo account signs in that way. On the web, all options stay.
  // Note: with no third-party login shown in-app, Apple's Sign-in-with-Apple
  // requirement (4.8) doesn't apply, so email-only is compliant here.
  const isNativeApp = (headers().get("user-agent") ?? "").includes("RIVENApp");

  return (
    <main className="min-h-screen flex items-center justify-center px-container-mobile py-12">
      <SignIn
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
                  // Sign in with Apple errored in the webview during App Review
                  // (2026-06-18) — hide it in-app too; email+password is the path.
                  socialButtonsBlockButton__apple: "hidden",
                  socialButtonsIconButton__apple: "hidden",
                  // Netflix model: no account creation inside the iOS app, so
                  // hide Clerk's "Don't have an account? Sign up" footer link.
                  // New members join on the web; the app is sign-in only.
                  footerAction: "hidden",
                }
              : {}),
          },
        }}
      />
    </main>
  );
}
