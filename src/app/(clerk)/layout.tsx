import { ClerkProvider } from "@clerk/nextjs";

/**
 * ClerkProvider only wraps routes that actually need auth state — sign-in,
 * sign-up, and the (app) protected route group. The public landing page
 * stays out of this group so it renders without depending on Clerk's
 * client SDK loading successfully.
 */
export default function ClerkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
