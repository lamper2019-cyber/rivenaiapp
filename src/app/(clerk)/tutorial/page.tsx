import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TUTORIAL_DONE_STEP } from "@/lib/tutorial";
import { TutorialSlides } from "./tutorial-slides";

/**
 * Post-profile tutorial walkthrough. The route is its own page (not a modal)
 * so progress survives a hard reload — the slide index is read straight from
 * profile.tutorialStep on every render.
 */
export default async function TutorialPage() {
  const { userId } = auth();

  if (!isClerkConfigured) {
    return (
      <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto pt-12">
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          Tutorial
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-3">
          Add real Clerk keys to .env.local to view the tutorial.
        </p>
      </main>
    );
  }

  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: {
      profile: { select: { tutorialStep: true } },
    },
  });

  // No profile yet — they need to finish the calorie/protein form first.
  if (!user?.profile) redirect("/onboarding");

  // Already done — bounce to the main app.
  if (user.profile.tutorialStep >= TUTORIAL_DONE_STEP) redirect("/dashboard");

  // tutorialStep stored as 0..4 (which slide they're currently on). The
  // client component handles "Next" animation + server persistence.
  const startSlide = Math.min(Math.max(user.profile.tutorialStep, 0), 3);

  return <TutorialSlides startSlide={startSlide} />;
}
