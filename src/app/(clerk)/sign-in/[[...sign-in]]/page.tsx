import { headers } from "next/headers";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  // Google OAuth is blocked inside app webviews (Google's own policy), so the
  // "Continue with Google" button dead-ends in the iOS app. Hide it when we're
  // running inside the native shell (detected via the `RIVENApp` user-agent tag
  // set in capacitor.config.ts). On the web it stays visible as normal.
  // Email + Sign in with Apple remain available in the app.
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
                }
              : {}),
          },
        }}
      />
    </main>
  );
}
