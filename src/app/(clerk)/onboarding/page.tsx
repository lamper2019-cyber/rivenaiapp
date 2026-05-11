import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureUserExists } from "@/lib/user-bootstrap";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const { userId } = auth();

  // Already-onboarded clients skip to the dashboard. Coaches never onboard —
  // bootstrap them straight to /coach if their email matches COACH_EMAIL.
  // The DB lookup is wrapped in try/catch (Phase 1 can run without a live DB)
  // but redirects MUST sit outside or the catch swallows the NEXT_REDIRECT.
  let shouldRedirectTo: string | null = null;
  if (userId && isClerkConfigured) {
    try {
      const bootstrapped = await ensureUserExists(userId);
      if (bootstrapped?.role === "COACH") {
        shouldRedirectTo = "/coach";
      } else {
        const existing = await prisma.user.findUnique({
          where: { clerkId: userId },
          include: { profile: { select: { id: true } } },
        });
        if (existing?.profile) shouldRedirectTo = "/dashboard";
      }
    } catch {
      /* no DB yet — render the form anyway */
    }
  }
  if (shouldRedirectTo) redirect(shouldRedirectTo);

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
