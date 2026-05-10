import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeWins,
  toWeightSeries,
  toWaistSeries,
  type Win,
} from "@/lib/progress";
import { Sparkline } from "@/components/sparkline";
import { PushSubscribeButton } from "@/components/push-subscribe-button";
import { DeleteAccountButton } from "./delete-account-button";

const PHASE_LABEL: Record<string, string> = {
  PHASE_1: "Phase 1 · Active",
  PHASE_2: "Phase 2",
  PHASE_3: "Phase 3",
  PHASE_4: "Phase 4",
};

export default async function ProfilePage() {
  const { userId } = auth();

  let profile = null;
  let checkIns: Awaited<ReturnType<typeof prisma.weeklyCheckIn.findMany>> = [];
  let wins: Win[] = [];

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: { profile: true },
      });
      profile = user?.profile ?? null;

      if (user) {
        checkIns = await prisma.weeklyCheckIn.findMany({
          where: { userId: user.id },
          orderBy: { weekStart: "asc" },
          take: 26, // last ~6 months of weekly check-ins
        });
      }

      if (profile) {
        wins = computeWins(profile, checkIns);
      }
    } catch {
      /* DB not connected — render minimal page */
    }
  }

  const weightSeries = toWeightSeries(checkIns);
  const waistSeries = toWaistSeries(checkIns);
  const photoCheckIns = checkIns.filter(
    (c) => c.photoFrontUrl || c.photoSideUrl
  );

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-3xl mx-auto py-12 space-y-section-gap">
      <header className="space-y-2">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Profile
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          {profile?.name ?? "Your transformation"}
        </h1>
        {profile && (
          <p className="font-body text-body-md text-on-surface-variant">
            {PHASE_LABEL[profile.phase] ?? profile.phase} ·{" "}
            {profile.startWeight} lbs → goal {profile.goalWeight} lbs
          </p>
        )}
      </header>

      {wins.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Wins
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {wins.map((w) => (
              <WinCard key={w.id} win={w} />
            ))}
          </div>
        </section>
      )}

      {profile && (
        <>
          <section className="space-y-3">
            <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
              Weight trend
            </h2>
            <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1 text-charcoal">
              <Sparkline
                data={weightSeries}
                unit="lbs"
                target={profile.goalWeight}
              />
              {profile.goalWeight && weightSeries.length > 0 && (
                <p className="font-body text-label-sm text-on-surface-variant/70 mt-2">
                  Dashed line = goal weight ({profile.goalWeight} lbs)
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
              Waist trend
            </h2>
            <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1 text-sage">
              <Sparkline data={waistSeries} unit="″" stroke="currentColor" />
            </div>
          </section>
        </>
      )}

      {photoCheckIns.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Photo timeline
          </h2>
          <PhotoTimeline checkIns={photoCheckIns} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Weekly
        </h2>
        <Link
          href="/check-in"
          className="block rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-4 hover:border-gold transition-colors shadow-elevation-1"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-display text-headline-md text-charcoal">
                Sunday check-in
              </p>
              <p className="font-body text-body-md text-on-surface-variant mt-1">
                Weight, waist, photos, and how the week actually went.
              </p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">
              arrow_forward
            </span>
          </div>
        </Link>
        <Link
          href="/content"
          className="block rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-4 hover:border-gold transition-colors shadow-elevation-1"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-display text-headline-md text-charcoal">
                This week&apos;s prompt
              </p>
              <p className="font-body text-body-md text-on-surface-variant mt-1">
                Record a 60-90 second answer.
              </p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">
              videocam
            </span>
          </div>
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Notifications
        </h2>
        <PushSubscribeButton
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Account
        </h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <SignOutButton>
            <button className="font-body text-label-md tracking-widest uppercase text-charcoal underline underline-offset-4">
              Sign out
            </button>
          </SignOutButton>
          <DeleteAccountButton />
        </div>
      </section>

      <div className="fixed bottom-[20%] left-[-15%] w-[40%] h-[30%] bg-sage/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────── */

function WinCard({ win }: { win: Win }) {
  const toneClasses =
    win.tone === "sage"
      ? "bg-tertiary-container/40 border-sage/40"
      : win.tone === "gold"
      ? "bg-secondary-container/40 border-gold/40"
      : "bg-surface-container-lowest border-outline-variant/60";

  return (
    <div className={`rounded-md border ${toneClasses} px-gutter py-4 shadow-elevation-1`}>
      <p className="font-display text-headline-md text-charcoal">{win.headline}</p>
      <p className="font-body text-body-md text-on-surface-variant mt-1">
        {win.detail}
      </p>
    </div>
  );
}

function PhotoTimeline({
  checkIns,
}: {
  checkIns: { id: string; weekStart: Date; photoFrontUrl: string | null; photoSideUrl: string | null }[];
}) {
  // Newest first.
  const ordered = [...checkIns].reverse();

  return (
    <div className="overflow-x-auto -mx-gutter px-gutter">
      <div className="flex gap-3 pb-2">
        {ordered.map((c) => (
          <div key={c.id} className="shrink-0 space-y-2">
            <p className="font-body text-label-sm text-on-surface-variant">
              {c.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
            <div className="flex gap-2">
              {c.photoFrontUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={c.photoFrontUrl}
                  alt={`Front photo from ${c.weekStart.toLocaleDateString()}`}
                  className="w-24 aspect-[3/4] object-cover rounded-md bg-surface-container border border-outline-variant/60"
                />
              )}
              {c.photoSideUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={c.photoSideUrl}
                  alt={`Side photo from ${c.weekStart.toLocaleDateString()}`}
                  className="w-24 aspect-[3/4] object-cover rounded-md bg-surface-container border border-outline-variant/60"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
