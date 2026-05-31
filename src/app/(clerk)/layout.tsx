import { ClerkProvider } from "@clerk/nextjs";
import { PostHogIdentify } from "@/components/posthog-identify";

/**
 * ClerkProvider only wraps routes that actually need auth state — sign-in,
 * sign-up, and the (app) protected route group. The public landing page
 * stays out of this group so it renders without depending on Clerk's
 * client SDK loading successfully.
 *
 * PostHogIdentify lives here (rather than deeper) so a single mount covers
 * both the client app and the coach side — anywhere a user is signed in,
 * PostHog learns who they are.
 */
export default function ClerkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <PostHogIdentify />
      {children}
    </ClerkProvider>
  );
}
