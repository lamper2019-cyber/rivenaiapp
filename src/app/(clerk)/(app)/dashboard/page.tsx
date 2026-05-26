import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard";
import { getTodayCalorieTarget } from "@/lib/calorie-schedule";
import { pickQuoteForDate } from "@/lib/daily-quotes";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { NotificationOptIn } from "@/components/notification-opt-in";
import { CoachMessageBadge } from "@/components/coach-message-badge";
import { TUTORIAL_DONE_STEP } from "@/lib/tutorial";
import { getMealPacing, type MealPacingTier } from "@/lib/meal-pacing";
import { RefreshOnDayChange } from "@/components/refresh-on-day-change";
import { getRecentPulseEvents } from "@/lib/pulse";
import { getCollectiveStats } from "@/lib/collective-counter";
import { getCheerCandidates } from "@/lib/cheer";
import { getCheerReceivedThisWeek } from "@/lib/cheer-received";
import { getSundayRitualSnapshot } from "@/lib/sunday-ritual";
import { PulseStrip } from "@/components/pulse-strip";
import { CollectiveCounter } from "@/components/collective-counter";
import { CheerPrompts } from "@/components/cheer-prompts";
import { CheerReceivedCard } from "@/components/cheer-received-card";
import { SundayRitual } from "@/components/sunday-ritual";

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
    dayName,
    recentCoachMessages,
  } = data;

  // Ambient community trio + Sunday ritual snapshot. Best-effort: each
  // Promise resolves to a safe fallback so a slow query or empty result
  // never blocks the rest of the dashboard. Run in parallel because none
  // of them depend on each other.
  const [
    pulseEvents,
    collectiveStats,
    cheerCandidates,
    sundaySnapshot,
    cheerReceived,
  ] = await Promise.all([
    getRecentPulseEvents(clientUserId).catch(() => []),
    getCollectiveStats().catch(() => null),
    getCheerCandidates(clientUserId).catch(() => []),
    getSundayRitualSnapshot(clientUserId).catch(() => null),
    getCheerReceivedThisWeek(clientUserId).catch(() => null),
  ]);

  // Only render the Sunday surface when there IS a prompt AND we're
  // either inside the open window OR she already participated this week
  // (so she can re-read her own answer + others' on Monday morning).
  const showSunday =
    sundaySnapshot?.prompt !== null &&
    sundaySnapshot !== null &&
    (sundaySnapshot.isOpen ||
      sundaySnapshot.myAnswer !== null ||
      sundaySnapshot.others.length > 0);

  // Honors per-day calorie cycling (Rora et al.); falls back to flat
  // cutCalories when no schedule is set, so every other client sees the
  // same number they always have.
  const calorieTarget = getTodayCalorieTarget(profile);
  const calorieRemaining = calorieTarget - todayTotals.calories;
  const proteinRemaining = profile.proteinFloor - todayTotals.protein;
  const stepRemaining = STEP_GOAL - todayTotals.steps;

  const greeting = pickGreeting(profile.name);
  const dailyQuote = pickQuoteForDate(new Date());

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
      {recentCoachMessages.length > 0 && (
        <CoachMessageBadge messages={recentCoachMessages} />
      )}

      <header className="space-y-2">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          {dayName}
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
          {greeting}
        </h1>
        <p className="font-body text-body-md text-on-surface-variant italic max-w-md">
          {dailyQuote}
        </p>
      </header>

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
          reads exactly as it used to. */}
      {showSunday && sundaySnapshot?.prompt && (
        <SundayRitual
          promptId={sundaySnapshot.prompt.id}
          question={sundaySnapshot.prompt.question}
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
      <PulseStrip events={pulseEvents} />
      {collectiveStats && <CollectiveCounter stats={collectiveStats} />}

      {/* Today's targets — three progress cards */}
      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Today
        </h2>
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
          Sunday ritual lives at the top of the dashboard now; that's the
          weekly community moment, and /check-in itself is being redesigned
          to be easier on its own page. */}

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

function pickGreeting(name: string): string {
  // Compute the hour in Central time. The server runs UTC on Railway, so
  // `new Date().getHours()` would say it's 1 AM when the user opens the
  // app at 8 PM CDT — wrong greeting, broken brand voice.
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
