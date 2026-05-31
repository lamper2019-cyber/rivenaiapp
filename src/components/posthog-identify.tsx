"use client";

import { useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { identifyUser } from "@/components/posthog";

/**
 * Tells PostHog who the signed-in user is. Mounted once inside ClerkProvider
 * (in the (clerk) layout) so it covers every authenticated route — the
 * client app AND the coach side.
 *
 * While the visitor is anonymous this no-ops. The moment Clerk hands us a
 * real user we call identify(), which does two things that matter:
 *   1. Stamps every future event with their Clerk user id, so usage and
 *      retention are tracked per real person instead of a random anon id.
 *   2. Merges the anonymous pre-signup journey (landing → quiz → VSL →
 *      pricing) onto that same person — so the sales funnel connects across
 *      the sign-up boundary instead of breaking into two strangers.
 *
 * distinctId = Clerk user id. The "paid" funnel step (SubscribedTracker on
 * /dashboard?subscribed=1) fires under the same identity, so the whole
 * funnel lands on one person.
 *
 * identifyUser() is itself a no-op when NEXT_PUBLIC_POSTHOG_KEY is absent
 * (local dev / forks), so this is safe to mount unconditionally.
 */
export function PostHogIdentify() {
  const { isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isSignedIn || !user) return;
    void identifyUser(user.id, {
      email: user.primaryEmailAddress?.emailAddress ?? "",
      name: user.fullName ?? "",
    });
  }, [isSignedIn, user]);

  return null;
}
