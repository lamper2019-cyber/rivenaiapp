/**
 * Bootstrap the User row for a signed-in Clerk account.
 *
 * Called from protected layouts on every request — idempotent. Two jobs:
 *   1. Create the User row on first hit (so onboarding isn't the only entry
 *      point that can mint a User; coaches never see onboarding).
 *   2. If the email is in COACH_EMAIL and the existing role is CLIENT,
 *      upgrade to COACH. This means setting COACH_EMAIL after Sean already
 *      signed up will still promote him.
 *
 * Never downgrades — removing an email from COACH_EMAIL won't strip the role.
 * That's intentional; downgrade is a deliberate action, not a side effect of
 * an env-var typo.
 */

import type { Role } from "@prisma/client";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCoachEmail } from "@/lib/coach";

export type BootstrappedUser = {
  id: string;
  clerkId: string;
  email: string;
  role: Role;
};

export async function ensureUserExists(
  clerkId: string
): Promise<BootstrappedUser | null> {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, clerkId: true, email: true, role: true },
  });

  if (existing) {
    if (existing.role === "CLIENT" && isCoachEmail(existing.email)) {
      const upgraded = await prisma.user.update({
        where: { id: existing.id },
        data: { role: "COACH" },
        select: { id: true, clerkId: true, email: true, role: true },
      });
      return upgraded;
    }
    return existing;
  }

  // First-time row. Pull email from Clerk.
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    `${clerkId}@noemail.local`;

  const role: Role = isCoachEmail(email) ? "COACH" : "CLIENT";

  const created = await prisma.user.create({
    data: { clerkId, email, role },
    select: { id: true, clerkId: true, email: true, role: true },
  });
  return created;
}
