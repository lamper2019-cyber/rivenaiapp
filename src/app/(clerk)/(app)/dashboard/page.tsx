import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard";
import { resolveTodayCalorieTarget } from "@/lib/calorie-banking";
import { pickQuoteForDate } from "@/lib/daily-quotes";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { NotificationOptIn } from "@/components/notification-opt-in";
import { TUTORIAL_DONE_STEP } from "@/lib/tutorial";
import { getMealPacing, type MealPacingTier } from "@/lib/meal-pacing";
import { RefreshOnDayChange } from "@/components/refresh-on-day-change";
import { getCollectiveStats } from "@/lib/collective-counter";
import { getCheerCandidates } from "@/lib/cheer";
import { getPeerWinCandidates } from "@/lib/peer-wins";
import { getCheerReceivedThisWeek } from "@/lib/cheer-received";
import { getCheerCeremonyState } from "@/lib/cheer-ceremony";
import { getSundayRitualSnapshot } from "@/lib/sunday-ritual";
// Daily mood ribbon retired from /dashboard on 2026-05-27. Mood data
// model + MoodHistory on /profile both stay.
// Pulse toasts ("so-and-so just logged a meal") retired same day —
// Sean asked to remove the activity feed entirely. lib/pulse.ts +
// the underlying queries remain for any future surface.
import { PresenceIndicator } from "@/components/presence-indicator";
import { CoachMessageBadge } from "@/components/coach-message-badge";
import { CollectiveCounter } from "@/components/collective-counter";
import { CheerPrompts } from "@/components/cheer-prompts";
import { PeerWins } from "@/components/peer-wins";
import { CheerReceivedCard } from "@/components/cheer-received-card";
import { CheerCeremony } from "@/components/cheer-ceremony";
import { SundayRitual } from "@/components/sunday-ritual";
import { MonthlyWeightCheckinCard } from "@/components/monthly-weight-checkin-card";
import { getMonthlyWeightSnapshot } from "@/lib/monthly-weight-checkin";
import { SubscribedTracker } from "@/components/subscribed-tracker";

// Force a fresh server render on every request. The page reads `auth()` so
// it's already implicitly dynamic, but pinning it explicitly is belt-and-
// suspenders against any future Next.js change in default behavior. Pairs
// with <RefreshOnDayChange /> below — the server side is always fresh, the
// client side re-asks for it the moment the Central date rolls over or the
// tab becomes visible after being away.
export const dynamic = "force-dynamic";

const STEP_GOAL = 10000;

export default async function DashboardPage() {
  const { userId } = auth();

  if (!userId) {
    return (
      <UnauthedPlaceholder>
        {isClerkConfigured
          ? "Please sign in."
          : "Add real Clerk keys to .env.local to view your dashboard."}
      </UnauthedPlaceholder>
    );
  }

  let data;
  try {
    data = await loadDashboardData(userId);
  } catch {
    return (
      <UnauthedPlaceholder>
        Database not connected. Run `npx prisma migrate dev --name init` against Railway Postgres.
      </UnauthedPlaceholder>
    );
  }

  if (!data) {
    redirect("/onboarding");
  }

  // Profile exists but the post-profile walkthrough hasn't been completed —
  // run it before showing the dashboard. tutorialStep persists per-user so
  // closing the app mid-tutorial picks up on the same slide.
  if (data.profile.tutorialStep < TUTORIAL_DONE_STEP) {
    redirect("/tutorial");
  }

  const {
    userId: clientUserId,
    profile,
    todayTotals,
    presentNames,
    recentCoachMessages,
  } = data;
  // ritualSlot, morningFocus, latestSeanPrompt still load on the
  // server (the loader is a stable contract) but the time-aware
  // ritual card and the inline Sean bubble are both gone. Sean now
  // lives entirely in the top-right "Message from Sean" pill which
  // routes to /chat. The greeting + rotating Sean-voice quote took
  // the inline slot.

  // Ambient community trio + Sunday ritual snapshot. Best-effort: each
  // Promise resolves to a safe fallback so a slow query or empty result
  // never blocks the rest of the dashboard. Run in parallel because none
  // of them depend on each other.
  const [
    collectiveStats,
    cheerCandidates,
    peerWinCandidates,
    sundaySnapshot,
    cheerReceived,
    cheerCeremony,
    monthlyWeightSnapshot,
  ] = await Promise.all([
    getCollectiveStats().catch(() => null),
    getCheerCandidates(clientUserId).catch(() => []),
    getPeerWinCandidates(clientUserId).catch(() => []),
    getSundayRitualSnapshot(clientUserId).catch(() => null),
    getCheerReceivedThisWeek(clientUserId).catch(() => null),
    getCheerCeremonyState(clientUserId).catch(() => null),
    getMonthlyWeightSnapshot(clientUserId).catch(() => null),
  ]);

  // Only render the Sunday surface when there IS a prompt AND we're
  // either inside the open window OR she already participated this week
  // (so she can re-read her own pick + the room's tally on Monday).
  // Participation = tapped a choice (tap formats) OR wrote an answer
  // (legacy "open" format). Tally / others lists count too so the room
  // stays visible to anyone who shows up after Sunday closes.
  const showSunday =
    sundaySnapshot?.prompt !== null &&
    sundaySnapshot !== null &&
    (sundaySnapshot.isOpen ||
      sundaySnapshot.myChoice !== null ||
      sundaySnapshot.totalTaps > 0 ||
      sundaySnapshot.myAnswer !== null ||
      sundaySnapshot.others.length > 0);

  // Honors the calorie-banking lever first (smooth-my-week clients), then
  // per-day cycling (Rora et al.), then flat cutCalories. So every client
  // sees the number that actually applies to her today. `banked.banked` is
  // true only when banking moved today's number off her base cut — drives
  // the explainer line under the ring.
  const banked = await resolveTodayCalorieTarget(clientUserId, profile);
  const calorieTarget = banked.target;
  const calorieRemaining = calorieTarget - todayTotals.calories;
  const proteinRemaining = profile.proteinFloor - todayTotals.protein;
  const stepRemaining = STEP_GOAL - todayTotals.steps;

  // pickGreeting() and the day-quote line both retired — the time-aware
  // ritual card carries the greeting + intent based on hour, and the
  // generic motivational quote didn't earn the screen space.

  // Meal-pacing — drives the reminder card AND tints the sticky log pill
  // when she's behind. Best-effort; if it fails we still render the page.
  let pacing: Awaited<ReturnType<typeof getMealPacing>> = null;
  try {
    pacing = await getMealPacing(userId);
  } catch {
    /* swallow */
  }

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-3xl mx-auto py-12 space-y-section-gap">
      <RefreshOnDayChange />

      {/* Fires the PostHog "subscription_started" funnel event once when a
          new subscriber lands here from Stripe Checkout (?subscribed=1),
          then cleans the URL. Suspense-wrapped because it reads
          useSearchParams(). */}
      <Suspense fallback={null}>
        <SubscribedTracker />
      </Suspense>

      {/* Falling-roses ceremony: fires if she opens /dashboard with any
          unseen 🌹 from peers. Renders as a fixed full-screen overlay so
          it sits above all other content; dismisses to nothing once she
          taps "Lock it in" and the markCheersAsSeen action lands. */}
      {cheerCeremony && cheerCeremony.roses.length > 0 && (
        <CheerCeremony
          roses={cheerCeremony.roses}
          overflowCount={cheerCeremony.overflowCount}
          isFirstCeremony={cheerCeremony.isFirstCeremony}
        />
      )}

      {/* Top-right "Message from Sean" pill — solid charcoal, serif
          S monogram, red unread count dot. Routes to /chat where she
          can read the thread and type back. Self-hides when there's
          zero coach-message history. */}
      <CoachMessageBadge messages={recentCoachMessages} />

      {/* Greeting + rotating Sean-voice quote. Replaced the time-aware
          ritual card on 2026-05-27 — Sean wanted the old "Good morning,
          [Name]" treatment back. Quote rotates daily off the seeded
          bank in @/lib/daily-quotes. */}
      <header className="space-y-2">
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          {pickGreeting(profile.name.split(/\s+/)[0])}
        </h1>
        <p className="font-body text-body-md text-on-surface-variant max-w-prose">
          {pickQuoteForDate(new Date())}
        </p>
      </header>

      {/* Presence chip — self-hides on a quiet morning. */}
      {presentNames.length > 0 && (
        <div className="rounded-full bg-surface-container-lowest border border-outline-variant/60 px-4 py-2 inline-flex">
          <PresenceIndicator names={presentNames} />
        </div>
      )}

      {/* 30-day weight check-in. Surfaces only when getMonthlyWeightSnapshot
          says she's due (30+ days since last check-in / signup). Slider-only
          — two numbers, no photos, no questionnaire. Submitting writes a
          WeeklyCheckIn row + updates Profile.currentWeight, and the card
          self-hides on next render. The full /check-in route still exists
          for clients who want the heavier form, but this is now the
          default monthly cadence. */}
      {monthlyWeightSnapshot && (
        <MonthlyWeightCheckinCard snapshot={monthlyWeightSnapshot} />
      )}

      {/* Self-hides if already installed as PWA or dismissed. */}
      <PwaInstallBanner />

      {/* Self-hides if push is already on, blocked, or iOS-not-installed
          (in which case the install banner is the right path). */}
      <NotificationOptIn
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
      />

      {pacing?.isBehind && <MealReminderCard tier={pacing.tier} />}

      {/* Ambient community surfaces. Each one self-hides on empty data,
          so on a quiet morning none of them render and the dashboard
          reads exactly as it used to.

          DailyMoodRibbon retired 2026-05-27 — its slot now belongs to
          the Message-from-Sean bubble above. Mood data model + mood
          history on /profile both stay. */}
      {showSunday && sundaySnapshot?.prompt && (
        <SundayRitual
          promptId={sundaySnapshot.prompt.id}
          question={sundaySnapshot.prompt.question}
          kind={sundaySnapshot.prompt.kind}
          options={sundaySnapshot.prompt.options}
          tally={sundaySnapshot.tally}
          myChoice={sundaySnapshot.myChoice}
          totalTaps={sundaySnapshot.totalTaps}
          myAnswer={sundaySnapshot.myAnswer}
          others={sundaySnapshot.others}
          isOpen={sundaySnapshot.isOpen}
        />
      )}
      {/* "🌹 N women have your back this week" — surfaces every received
          cheer in-app so push reliability isn't the only signal. First
          thing she sees after Sunday ritual / above the activity feed. */}
      {cheerReceived && <CheerReceivedCard summary={cheerReceived} />}
      {cheerCandidates.length > 0 && (
        <CheerPrompts candidates={cheerCandidates} />
      )}
      {/* Peer wins — celebratory mirror of CheerPrompts. Shows when
          someone hit a streak milestone or just finished a monthly
          check-in. Same one-tap 🌹 send mechanic, positive trigger. */}
      {peerWinCandidates.length > 0 && (
        <PeerWins candidates={peerWinCandidates} />
      )}
      {/* Pulse toasts ("So-and-so just logged a meal" pop-ups) retired
          2026-05-27 — Sean asked to remove the activity feed entirely.
          The aggregate "Together" stats below still show. */}
      {collectiveStats && (
        <CollectiveCounter
          stats={collectiveStats}
          viewerFirstName={profile.name.split(/\s+/)[0]}
        />
      )}

      {/* Today's targets — three progress cards */}
      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Today
        </h2>
        {/* Smooth-my-week explainer. Only shows when banking actually moved
            today's number off her base cut — tells her WHY the target looks
            different so it never feels like a glitch. */}
        {banked.banked && (
          <p className="font-body text-label-sm text-on-surface-variant leading-relaxed">
            {calorieTarget > banked.base ? (
              <>
                Smoothing your week — you banked{" "}
                <span className="text-gold">
                  {(calorieTarget - banked.base).toLocaleString()} cal
                </span>{" "}
                from earlier, so today&apos;s target is up to{" "}
                {calorieTarget.toLocaleString()}.
              </>
            ) : (
              <>
                Smoothing your week — you ran over earlier, so today trims{" "}
                <span className="text-gold">
                  {(banked.base - calorieTarget).toLocaleString()} cal
                </span>{" "}
                down to {calorieTarget.toLocaleString()}.
              </>
            )}
          </p>
        )}
        <div className="grid gap-3">
          <ProgressCard
            label="Calories"
            value={todayTotals.calories}
            target={calorieTarget}
            unit=""
            remainingLabel={
              calorieRemaining > 0
                ? `${calorieRemaining} remaining`
                : `${Math.abs(calorieRemaining)} over`
            }
          />
          <ProgressCard
            label="Protein"
            value={todayTotals.protein}
            target={profile.proteinFloor}
            unit="g"
            remainingLabel={
              proteinRemaining > 0
                ? `${proteinRemaining}g still to floor`
                : `floor met`
            }
            requireToHit
          />
          <ProgressCard
            label="Steps"
            value={todayTotals.steps}
            target={STEP_GOAL}
            unit=""
            remainingLabel={
              stepRemaining > 0
                ? `${stepRemaining.toLocaleString()} to go`
                : `goal hit`
            }
          />
        </div>
      </section>

      {/* Removed per Sean — wasn't earning the screen real estate:
            - Ask RIVEN hero (the bottom-nav Chat tab covers this)
            - LogStepsForm (steps progress still renders in Today below)
            - Sunday check-in card (path remains via /check-in + push)
            - This Week's Prompt content card (path remains via /content)
          The weekly community moments live above (mood ribbon, Sunday
          ritual, cheer card). The big check-in moved to monthly cadence
          — fires on the 1st via the renamed sunday-reminder cron. */}

      <div className="fixed top-[10%] right-[-10%] w-[35%] h-[35%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />

      <StickyLogPill behind={pacing?.isBehind ?? false} />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────── */

function ProgressCard({
  label,
  value,
  target,
  unit,
  remainingLabel,
  requireToHit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  remainingLabel: string;
  requireToHit?: boolean;
}) {
  const pct = target > 0 ? Math.min((value / target) * 100, 110) : 0;
  // For protein floor, "over" is bad and "under" is bad too. For calories, "over" is bad.
  const isOver = !requireToHit && value > target;
  const isMet = requireToHit && value >= target;

  const fillColor = isOver
    ? "bg-soft-red"
    : isMet
    ? "bg-sage"
    : "bg-charcoal";

  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1">
      <div className="flex items-baseline justify-between">
        <p className="font-body text-label-md tracking-wide uppercase text-on-surface-variant">
          {label}
        </p>
        <p className="font-body text-label-sm text-on-surface-variant/80">
          {remainingLabel}
        </p>
      </div>
      <p className="font-display text-headline-md text-charcoal mt-2">
        {value.toLocaleString()}
        {unit}
        <span className="font-body text-body-md text-on-surface-variant/70">
          {" "}
          / {target.toLocaleString()}
          {unit}
        </span>
      </p>
      <div className="mt-3 h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${fillColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Greeting picker. Runs Central time so the server (UTC on Railway)
 * doesn't say "Up early" when she opens the app at 8 PM.
 */
function pickGreeting(name: string): string {
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10,
  );
  if (hour < 5) return `Up early, ${name}.`;
  if (hour < 12) return `Good morning, ${name}.`;
  if (hour < 18) return `Afternoon, ${name}.`;
  return `Evening, ${name}.`;
}

function UnauthedPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto pt-12">
      <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
        Daily Dashboard
      </h1>
      <p className="font-body text-body-md text-on-surface-variant mt-3">{children}</p>
    </main>
  );
}

// pickGreeting() removed — the time-aware ritual card now provides the
// greeting + per-slot copy. Recoverable from git if needed.

function MealReminderCard({ tier }: { tier: MealPacingTier }) {
  const { eyebrow, body } = reminderCopyFor(tier);
  return (
    <Link
      href="/log"
      className="block rounded-md bg-gold/15 border border-gold/60 px-gutter py-4 shadow-elevation-1 hover:bg-gold/20 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-body text-label-md tracking-widest uppercase text-on-secondary-container">
            {eyebrow}
          </p>
          <p className="font-body text-body-md text-charcoal mt-1">{body}</p>
        </div>
        <span className="material-symbols-outlined text-charcoal/70 shrink-0">
          arrow_forward
        </span>
      </div>
    </Link>
  );
}

function reminderCopyFor(tier: MealPacingTier): { eyebrow: string; body: string } {
  switch (tier) {
    case "midday":
      return {
        eyebrow: "Haven't logged yet",
        body: "What did breakfast look like? Takes 5 seconds with voice.",
      };
    case "afternoon":
      return {
        eyebrow: "Half the day's gone",
        body: "Catch up the morning and lunch before you forget the details.",
      };
    case "evening":
      return {
        eyebrow: "Light day on the log",
        body: "Run through what you ate today — even rough numbers beat zero.",
      };
    // Early/late tiers shouldn't trigger isBehind, but keep the type exhaustive.
    case "early":
    case "late":
      return {
        eyebrow: "Log a meal",
        body: "Voice or text — it takes a few seconds.",
      };
  }
}

function StickyLogPill({ behind }: { behind: boolean }) {
  // Floats above the bottom nav. Charcoal pill on a calm day, gold when she's
  // behind so the eye catches it on the same page where the reminder card
  // lives. Tap routes to /log.
  const tone = behind
    ? "bg-gold text-charcoal border border-gold riven-pulse-soft"
    : "bg-charcoal text-cream border border-charcoal";
  return (
    <Link
      href="/log"
      aria-label="Log a meal"
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)_+_84px)] left-3 right-3 z-40 inline-flex items-center justify-center gap-2 rounded-full py-3.5 font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-[0.98] transition-all max-w-3xl mx-auto ${tone}`}
    >
      <span className="material-symbols-outlined text-[20px] filled">mic</span>
      Log a meal
    </Link>
  );
}
