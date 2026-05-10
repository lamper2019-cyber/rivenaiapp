import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const { userId } = auth();

  // Already-onboarded clients skip straight to the dashboard.
  // Wrapped in try/catch because Phase 1 can run without a live DB —
  // a missing DATABASE_URL shouldn't block the form from rendering for design review.
  if (userId) {
    try {
      const existing = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: { profile: { select: { id: true } } },
      });
      if (existing?.profile) redirect("/dashboard");
    } catch {
      /* no DB yet — render the form anyway */
    }
  }

  return (
    <main className="relative min-h-screen px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-12">
      <header className="mb-section-gap space-y-3">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Step one of one
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
          Welcome — let&apos;s set up your profile.
        </h1>
        <p className="font-body text-body-lg text-on-surface-variant max-w-md">
          A few quick questions so RIVEN can calibrate your calorie and protein targets to you.
        </p>
      </header>

      <OnboardingForm />

      {/* Ambient warm glow (matches welcome screen) */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
