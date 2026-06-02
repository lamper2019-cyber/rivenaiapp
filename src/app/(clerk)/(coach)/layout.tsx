import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { ensureUserExists, type BootstrappedUser } from "@/lib/user-bootstrap";
import { CoachBottomNav } from "@/components/coach-bottom-nav";

/**
 * Coach-only layout. Anyone whose User.role !== COACH is redirected to the
 * client dashboard. Bootstraps the User row so a fresh coach account works
 * the moment RIVEN signs in with the COACH_EMAIL address.
 *
 * `redirect()` throws a NEXT_REDIRECT control-flow error — keep redirects
 * outside try/catch or the catch will swallow them and render the wrong nav.
 */
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = auth();

  if (!isClerkConfigured) {
    return (
      <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto pt-12">
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          Coach view
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-3">
          Add real Clerk keys to .env.local to view the coach dashboard.
        </p>
      </main>
    );
  }

  if (!userId) redirect("/sign-in");

  let user: BootstrappedUser | null = null;
  let dbErrored = false;
  try {
    user = await ensureUserExists(userId);
  } catch {
    dbErrored = true;
  }

  if (dbErrored) {
    return (
      <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto pt-12">
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          Coach view
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-3">
          Database not connected. Run `npx prisma migrate dev` against Railway Postgres.
        </p>
      </main>
    );
  }

  if (!user || user.role !== "COACH") redirect("/dashboard");

  return (
    <div className="relative min-h-screen pt-safe pb-28">
      {children}
      <CoachBottomNav />
    </div>
  );
}
