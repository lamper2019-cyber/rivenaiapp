import { headers } from "next/headers";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  // See sign-in page for the full reasoning: Google OAuth dead-ends inside the
  // iOS webview, so we hide it when running in the native shell (RIVENApp UA).
  // On the web it stays. Email + Sign in with Apple remain available in the app.
  const isNativeApp = (headers().get("user-agent") ?? "").includes("RIVENApp");

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
