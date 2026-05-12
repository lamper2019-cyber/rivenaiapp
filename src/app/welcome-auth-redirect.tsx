"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mounted on the public welcome page. If a Clerk session cookie is present,
 * swap the URL for /dashboard so returning members don't have to tap
 * through the marketing page every visit.
 *
 * We deliberately do NOT use Clerk's React hooks here — the welcome page
 * lives outside ClerkProvider so it stays statically rendered and
 * Cloudflare-cacheable. Cookie sniffing is a best-effort signal; if it
 * misses, the user just taps "Sign in" and Clerk handles the rest.
 *
 * Clerk sets `__client_uat*` (user-auth-timestamp) and `__session` cookies
 * on sign-in. Looking for either substring catches the active-session case
 * across Clerk versions without coupling us to an exact cookie name.
 */
export function WelcomeAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const c = document.cookie;
    if (c.includes("__client_uat") || c.includes("__session")) {
      router.replace("/dashboard");
    }
  }, [router]);

  return null;
}
