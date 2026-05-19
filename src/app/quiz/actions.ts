"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  AnswersSchema,
  ContactSchema,
  budgetTierFromAnswers,
  scoreFromAnswers,
} from "@/lib/quiz";

export type SubmitQuizState =
  | { ok: true; leadId: string }
  | { ok: false; error: string };

/**
 * Server action invoked from the /quiz/start client flow. Validates the
 * contact + answers payload via zod, computes the score and budget tier,
 * persists a Lead row, then redirects to the results page. The redirect
 * happens OUTSIDE try/catch — `redirect()` throws NEXT_REDIRECT and a
 * catch block would swallow it (this bit us before; see HANDOFF.md
 * known issues).
 */
export async function submitQuiz(formData: FormData): Promise<void> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    redirect("/quiz/start?error=missing_payload");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    redirect("/quiz/start?error=invalid_payload");
  }

  const contactCandidate = (parsed as { contact?: unknown })?.contact;
  const answersCandidate = (parsed as { answers?: unknown })?.answers;

  const contactResult = ContactSchema.safeParse(contactCandidate);
  const answersResult = AnswersSchema.safeParse(answersCandidate);

  if (!contactResult.success || !answersResult.success) {
    redirect("/quiz/start?error=validation_failed");
  }

  const contact = contactResult.data;
  const answers = answersResult.data;

  const score = scoreFromAnswers(answers);
  const budgetTier = budgetTierFromAnswers(answers);

  // Best-effort IP capture. Cloudflare puts the real client IP in
  // cf-connecting-ip; fall back to x-forwarded-for, first hop.
  const hdrs = headers();
  const cfIp = hdrs.get("cf-connecting-ip");
  const xff = hdrs.get("x-forwarded-for")?.split(",")[0].trim();
  const ipAddress = cfIp ?? xff ?? null;
  const country = hdrs.get("cf-ipcountry") ?? null;

  let leadId: string;
  try {
    const lead = await prisma.lead.create({
      data: {
        firstName: contact.firstName,
        email: contact.email,
        phone: contact.phone ?? null,
        ipAddress,
        country,
        answers,
        score,
        budgetTier,
      },
      select: { id: true },
    });
    leadId = lead.id;
  } catch (err) {
    console.error("[quiz] failed to create Lead", err);
    redirect("/quiz/start?error=save_failed");
  }

  redirect(`/quiz/results/${leadId}`);
}
