import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { auth, currentUser, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TriggerMondayCheckinsButton } from "./trigger-monday-checkins-button";

/**
 * Coach profile page. Lives under (coach) so the layout already gates by
 * role — no role check needed here. Surface is intentionally light:
 * identity strip + sign-out actions. The client-side /profile page exists
 * for clients (sparklines, wins, weekly tiles, delete account); coaches
 * don't need any of that.
 */
export default async function CoachProfilePage() {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  const clerkUser = await currentUser();
  const dbUser = await prisma.user
    .findUnique({
      where: { clerkId: userId },
      select: { email: true, createdAt: true },
    })
    .catch(() => null);

  const email =
    dbUser?.email ??
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    "—";
  const memberSince = dbUser?.createdAt
    ? dbUser.createdAt.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-12 space-y-section-gap">
      <header className="space-y-2">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Coach
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          Sean
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          {email}
        </p>
      </header>

      {/* Account identity strip */}
      <section className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1 space-y-3">
        <div className="flex items-center gap-3">
          <span className="relative flex items-center justify-center w-12 h-12 shrink-0">
            <span className="absolute inset-0 rounded-full bg-gold/15" aria-hidden />
            <span className="absolute inset-1 rounded-full bg-cream" aria-hidden />
            <span className="material-symbols-outlined relative text-gold text-[22px] filled">
              shield_person
            </span>
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-body text-label-sm text-on-surface-variant/80">
              Role
            </p>
            <p className="font-body text-body-md text-charcoal">
              Coach · full client access
            </p>
          </div>
        </div>
        {memberSince && (
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-on-surface-variant/70 w-12 shrink-0 text-center text-[22px]">
              calendar_month
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-body text-label-sm text-on-surface-variant/80">
                Member since
              </p>
              <p className="font-body text-body-md text-charcoal">
                {memberSince}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Coaching tools — manual triggers Sean reaches for periodically. */}
      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Coaching tools
        </h2>
        <TriggerMondayCheckinsButton />
      </section>

      {/* Account actions */}
      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Account
        </h2>

        {/* Sign out → welcome page. */}
        {isClerkConfigured ? (
          <SignOutButton redirectUrl="/">
            <button
              type="button"
              className="block w-full text-center bg-charcoal text-cream py-4 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-1 hover:opacity-90 transition-all active:scale-95"
            >
              Sign out
            </button>
          </SignOutButton>
        ) : (
          <DisabledNote>
            Clerk isn&apos;t configured locally. Add real keys to .env.local to enable sign out.
          </DisabledNote>
        )}

        {/* Switch account → sign out, land on /sign-in so a different email can log in. */}
        {isClerkConfigured && (
          <SignOutButton redirectUrl="/sign-in">
            <button
              type="button"
              className="block w-full text-center bg-surface-container-lowest border border-outline-variant text-charcoal py-4 rounded-full font-body text-label-md tracking-widest uppercase hover:border-gold transition-colors active:scale-95"
            >
              Switch account
            </button>
          </SignOutButton>
        )}

        <p className="font-body text-label-sm text-on-surface-variant/70 mt-1">
          Switch account signs you out and opens the sign-in screen so you can
          log in as a different user — useful for previewing a client&apos;s
          view of the app.
        </p>
      </section>

      <div className="fixed bottom-[15%] left-[-15%] w-[35%] h-[30%] bg-sage/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

function DisabledNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-3 font-body text-body-md text-on-surface-variant">
      {children}
    </div>
  );
}
