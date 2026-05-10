import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
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
          },
        }}
      />
    </main>
  );
}
