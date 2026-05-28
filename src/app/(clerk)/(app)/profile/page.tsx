import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeWins, toWeightSeries, type Win } from "@/lib/progress";
import { PushSubscribeButton } from "@/components/push-subscribe-button";
import { Sparkline } from "@/components/sparkline";
import { startOfCentralMonth } from "@/lib/dates";
import { DeleteAccountButton } from "./delete-account-button";
import { getMyMoodHistory, type MoodHistoryEntry } from "@/lib/daily-mood";
import { MoodHistory } from "@/components/mood-history";

// Weight sparkline returned after the 2026-05-27 simplification — the
// 30-day slider check-in writes here so the graph has real signal.
// Waist trend is intentionally NOT shown; Sean wanted weight as the
// primary number-to-watch on /profile.

export default async function ProfilePage() {
  const { userId } = auth();

  let profile = null;
  let hasStripeCustomer = false;
  let subscriptionStatus: string | null = null;
  let checkIns: Awaited<ReturnType<typeof prisma.weeklyCheckIn.findMany>> = [];
  let wins: Win[] = [];
  // "monthCheckIn" — this month's check-in row, used to swap the
  // /check-in CTA card for a "✓ checked in this month" state. Reads the
  // WeeklyCheckIn table by month-start (the column name is historical;
  // see comment in /check-in/actions.ts).
  let monthCheckIn: {
    id: string;
    weight: number;
    waist: number;
  } | null = null;
  let moodHistory: MoodHistoryEntry[] = [];

  const monthStart = startOfCentralMonth();

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: { profile: true },
      });
      profile = user?.profile ?? null;
      hasStripeCustomer = !!user?.stripeCustomerId;
      subscriptionStatus = user?.subscriptionStatus ?? null;

      if (user) {
        [checkIns, monthCheckIn, moodHistory] = await Promise.all([
          prisma.weeklyCheckIn.findMany({
            where: { userId: user.id },
            orderBy: { weekStart: "asc" },
            // Last ~12 entries — was 6mo of weekly rows (26), now 12mo of
            // monthly rows. Historical weekly rows still show up here.
            take: 12,
          }),
          prisma.weeklyCheckIn.findUnique({
            where: { userId_weekStart: { userId: user.id, weekStart: monthStart } },
            select: { id: true, weight: true, waist: true },
          }),
          getMyMoodHistory(user.id, 30),
        ]);
      }

      if (profile) {
        wins = computeWins(profile, checkIns);
      }
    } catch {
      /* DB not connected — render minimal page */
    }
  }

  // Photo timeline is the one survivor of the trend-chart cleanup —
  // visual progress without the sparkline vibe.
  const photoCheckIns = checkIns.filter(
    (c) => c.photoFrontUrl || c.photoSideUrl,
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
        {/* Phase indicator removed per Sean — the four protocol phases
            weren't being actively progressed against, so showing
            "Phase 1 · Active" felt aspirational rather than honest. */}
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

      {/* Weight trend returned 2026-05-27 — now that the 30-day slider
          check-in writes a row regularly, the chart has real signal.
          Waist trend stays hidden (Sean wants weight as the only
          tracked number on /profile). Streak-protection block remains
          out — that data still feeds proactive logic but doesn't
          earn screen real estate. */}
      {checkIns.length > 0 && profile && (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Weight
          </h2>
          <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-5 shadow-elevation-1 text-charcoal">
            <Sparkline
              data={toWeightSeries(checkIns)}
              unit="lb"
              target={profile.goalWeight}
            />
            <p className="font-body text-label-sm text-on-surface-variant/70 mt-3">
              Goal {profile.goalWeight} lb · Start {profile.startWeight} lb
            </p>
          </div>
        </section>
      )}

      {photoCheckIns.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Photo timeline
          </h2>
          <PhotoTimeline checkIns={photoCheckIns} />
        </section>
      )}

      {/* Mood history — last 30 days. Self-hides on empty data (new
          clients without enough taps yet). */}
      <MoodHistory entries={moodHistory} />

      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Check-in
        </h2>

        {monthCheckIn ? (
          <div className="rounded-md bg-tertiary-container/40 border border-sage/40 px-gutter py-4 shadow-elevation-1">
            <p className="font-body text-label-md tracking-widest uppercase text-sage">
              Checked in this month
            </p>
            <p className="font-body text-body-md text-charcoal mt-2">
              Weight {monthCheckIn.weight} lbs · Waist {monthCheckIn.waist}″
            </p>
          </div>
        ) : (
          // The primary monthly check-in is now the slider card at the
          // top of /dashboard (it auto-surfaces every 30 days). This
          // link stays for clients who want the heavier form — photos,
          // sleep, stress, wins-and-struggles — but is no longer the
          // default path.
          <Link
            href="/check-in"
            className="block rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-4 hover:border-gold transition-colors shadow-elevation-1"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-display text-headline-md text-charcoal">
                  Full check-in
                </p>
                <p className="font-body text-body-md text-on-surface-variant mt-1">
                  Photos, sleep, stress, and wins from the month — optional.
                </p>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant">
                arrow_forward
              </span>
            </div>
          </Link>
        )}

        {/* "This week's prompt" content card removed per Sean — same
            spirit as the dashboard cleanup. The /content route still
            exists for anyone who lands there directly, but the profile
            doesn't surface it anymore. */}
      </section>

      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Notifications
        </h2>
        <PushSubscribeButton
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        />
      </section>

      {hasStripeCustomer && (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Billing
          </h2>
          <p className="font-body text-body-md text-on-surface-variant">
            {subscriptionStatus === "trialing"
              ? "You're on a free trial. Card will be charged on day 8."
              : subscriptionStatus === "active"
                ? "Subscription is active. $50 / month."
                : subscriptionStatus === "past_due"
                  ? "Payment failed. Update your card to keep access."
                  : subscriptionStatus === "canceled"
                    ? "Subscription canceled. Renew anytime."
                    : "Manage your billing on Stripe's secure portal."}
          </p>
          <form action="/api/stripe/portal" method="POST">
            <button
              type="submit"
              className="inline-flex items-center gap-2 font-body text-label-md tracking-widest uppercase text-charcoal underline underline-offset-4 hover:opacity-80"
            >
              <span className="material-symbols-outlined text-[18px]">credit_card</span>
              Manage billing
            </button>
          </form>
        </section>
      )}

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
                  width={96}
                  height={128}
                  loading="lazy"
                  decoding="async"
                  className="w-24 aspect-[3/4] object-cover rounded-md bg-surface-container border border-outline-variant/60"
                />
              )}
              {c.photoSideUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={c.photoSideUrl}
                  alt={`Side photo from ${c.weekStart.toLocaleDateString()}`}
                  width={96}
                  height={128}
                  loading="lazy"
                  decoding="async"
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
