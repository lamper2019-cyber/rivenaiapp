/**
 * Auth shim that mirrors `@clerk/nextjs/server` but no-ops when Clerk env vars
 * are placeholders — so the dev server boots without real keys for design review.
 * Call sites import `auth` and `currentUser` from this module instead of Clerk
 * directly. As soon as real `sk_test_*` and `pk_test_*` values land in
 * `.env.local`, the shim transparently delegates to Clerk.
 */

import {
  auth as clerkAuth,
  currentUser as clerkCurrentUser,
} from "@clerk/nextjs/server";

export const isClerkConfigured =
  !!process.env.CLERK_SECRET_KEY &&
  !process.env.CLERK_SECRET_KEY.startsWith("sk_test_dummy") &&
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes("katydid");

type AuthState = { userId: string | null };

export function auth(): AuthState {
  if (!isClerkConfigured) return { userId: null };
  return clerkAuth() as AuthState;
}

export async function currentUser() {
  if (!isClerkConfigured) return null;
  return clerkCurrentUser();
}
