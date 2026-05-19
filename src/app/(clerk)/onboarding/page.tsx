import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureUserExists } from "@/lib/user-bootstrap";
import { OnboardingFlow } from "./onboarding-flow";
import {
  AnswersSchema,
  labelForChoiceAnswer,
  type BudgetTier,
} from "@/lib/quiz";

export default async function OnboardingPage() {
  const { userId } = auth();

  // Already-onboarded clients skip to the dashboard. Coaches never onboard —
  // bootstrap them straight to /coach if their email matches COACH_EMAIL.
  // The DB lookup is wrapped in try/catch (Phase 1 can run without a live DB)
  // but redirects MUST sit outside or the catch swallows the NEXT_REDIRECT.
  let shouldRedirectTo: string | null = null;
  let userEmail: string | null = null;
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
        userEmail = existing?.email ?? null;
      }
    } catch {
      /* no DB yet — render the form anyway */
    }
  }
  if (shouldRedirectTo) redirect(shouldRedirectTo);

  // If she came in from the quiz funnel, pull her most recent Lead by email
  // so we can welcome her back with the answers we already have. Email is
  // lowercased on Lead create (ContactSchema), so match lower-case here too.
  // Best-effort: any failure just hides the banner.
  let quizLead: QuizLeadSummary | null = null;
  if (userEmail) {
    try {
      const lead = await prisma.lead.findFirst({
        where: { email: userEmail.toLowerCase() },
        orderBy: { createdAt: "desc" },
        select: {
          firstName: true,
          score: true,
          budgetTier: true,
          answers: true,
        },
      });
      if (lead) {
        const parsed = AnswersSchema.safeParse(lead.answers);
        if (parsed.success) {
          quizLead = {
            firstName: lead.firstName,
            score: lead.score,
            budgetTier: lead.budgetTier as BudgetTier,
            obstacle: labelForChoiceAnswer("q13", parsed.data.q13),
            goal: labelForChoiceAnswer("q12", parsed.data.q12),
          };
        }
      }
    } catch {
      /* swallow — banner is optional */
    }
  }

  // The flow handles its own layout / header / progress dots / Sean voice
  // — no outer wrapper so each step owns the full screen.
  return <OnboardingFlow quizLead={quizLead} />;
}

export type QuizLeadSummary = {
  firstName: string;
  score: number;
  budgetTier: BudgetTier;
  obstacle: string;
  goal: string;
};
