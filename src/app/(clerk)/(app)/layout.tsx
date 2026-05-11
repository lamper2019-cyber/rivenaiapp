import { redirect } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { auth, isClerkConfigured } from "@/lib/auth";
import { ensureUserExists, type BootstrappedUser } from "@/lib/user-bootstrap";

/**
 * Protected client routes. Bootstraps the User row, then redirects coaches
 * away to /coach so Sean never sees the client-side dashboard/nav by accident.
 *
 * `redirect()` throws a NEXT_REDIRECT control-flow error — the call MUST sit
 * outside try/catch or the catch swallows the redirect and the layout renders
 * the wrong nav.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = auth();

  let user: BootstrappedUser | null = null;
  if (userId && isClerkConfigured) {
    try {
      user = await ensureUserExists(userId);
    } catch {
      /* DB unavailable — render the inner page's placeholder */
    }
  }
  if (user?.role === "COACH") redirect("/coach");

  return (
    <div className="relative min-h-screen pt-safe pb-28">
      {children}
      <BottomNav />
    </div>
  );
}
