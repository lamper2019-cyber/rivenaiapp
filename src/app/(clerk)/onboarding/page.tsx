import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureUserExists } from "@/lib/user-bootstrap";
import { OnboardingFlow } from "./onboarding-flow";

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

  // The flow handles its own layout / header / progress dots / Sean voice
  // — no outer wrapper so each step owns the full screen.
  return <OnboardingFlow />;
}
