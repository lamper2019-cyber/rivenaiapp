import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard";
import { pickQuoteForDate } from "@/lib/daily-quotes";
import { ASK_RIVEN_PROMPTS } from "@/lib/ask-riven-prompts";
import { RotatingText } from "@/components/rotating-text";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { NotificationOptIn } from "@/components/notification-opt-in";
import { CoachMessageBadge } from "@/components/coach-message-badge";
import { TUTORIAL_DONE_STEP } from "@/lib/tutorial";
import { getMealPacing, type MealPacingTier } from "@/lib/meal-pacing";
import { LogStepsForm } from "./log-steps-form";

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
    profile,
    todayTotals,
    weekCheckIn,
    weekContent,
    prompt,
    dayName,
    recentCoachMessages,
  } = data;

  const calorieRemaining = profile.cutCalories - todayTotals.calories;
  const proteinRemaining = profile.proteinFloor - todayTotals.protein;
  const stepRemaining = STEP_GOAL - todayTotals.steps;

  const greeting = pickGreeting(profile.name);
  const dailyQuote = pickQuoteForDate(new Date());
  const isSunday = dayName === "Sunday";

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

      {/* Today's targets — three progress cards */}
      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Today
        </h2>
        <div className="grid gap-3">
          <ProgressCard
            label="Calories"
            value={todayTotals.calories}
            target={profile.cutCalories}
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

      {/* Quick actions */}
      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Quick actions
        </h2>
        {/* Ask RIVEN — hero quick action, bigger and visually distinct */}
        <Link
          href="/chat"
          className="group relative block rounded-md bg-gradient-to-br from-secondary-container/70 via-cream to-tertiary-container/30 border border-gold/50 text-charcoal px-4 py-5 sm:px-gutter sm:py-6 hover:shadow-elevation-2 hover:border-gold transition-all shadow-elevation-1 overflow-hidden"
        >
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Animated icon with soft pulsing aura */}
            <div className="relative shrink-0 flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14">
              <span className="absolute inset-0 rounded-full bg-gold/30 riven-glow" aria-hidden />
              <span className="absolute inset-1 rounded-full bg-cream shadow-elevation-1" aria-hidden />
              <span className="material-symbols-outlined relative text-gold text-[28px] sm:text-[32px] filled">
                auto_awesome
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-body text-label-sm sm:text-label-md tracking-widest uppercase text-on-secondary-container">
                Ask RIVEN
              </span>
              <RotatingText
                lines={ASK_RIVEN_PROMPTS}
                intervalMs={5600}
                transitionMs={1000}
                maxLines={2}
                className="font-display text-body-md sm:text-headline-md text-charcoal mt-0.5 sm:mt-1 leading-snug"
              />
            </div>
            <span className="material-symbols-outlined text-charcoal/60 shrink-0 group-hover:translate-x-1 transition-transform">
              arrow_forward
            </span>
          </div>
        </Link>

        <LogStepsForm initial={todayTotals.steps} />
      </section>

      {/* Sunday check-in card — always visible, locked except Sunday */}
      {weekCheckIn ? (
        <div className="rounded-md bg-tertiary-container/40 border border-sage/40 px-gutter py-4">
          <p className="font-body text-label-md tracking-widest uppercase text-sage">
            Checked in this week
          </p>
          <p className="font-body text-body-md text-charcoal mt-2">
            Weight {weekCheckIn.weight} lbs · Waist {weekCheckIn.waist}″
          </p>
        </div>
      ) : isSunday ? (
        <PromptCard
          eyebrow="It's Sunday — check-in is open"
          title="The week, on the record."
          body="Eight questions, two photos, ten minutes. This is how Sean sees the trend."
          ctaLabel="Open the check-in"
          ctaHref="/check-in"
          tone="sage"
        />
      ) : (
        <SundayLockedCard dayName={dayName} />
      )}

      {/* Content prompt card — single-sentence prompt only; the hint lives
          alongside the full prompt on the /content recording page. */}
      {!weekContent ? (
        <PromptCard
          eyebrow="This week's prompt"
          title={prompt.prompt}
          ctaLabel="Record my answer"
          ctaHref="/content"
          tone="gold"
        />
      ) : (
        <div className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-4">
          <p className="font-body text-label-md tracking-widest uppercase text-on-secondary-container">
            Submitted this week · {prompt.title}
          </p>
          <Link
            href="/content"
            className="font-body text-body-md text-charcoal underline underline-offset-4 mt-2 inline-block"
          >
            Re-record →
          </Link>
        </div>
      )}

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

function PromptCard({
  eyebrow,
  title,
  body,
  subBody,
  ctaLabel,
  ctaHref,
  tone,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  subBody?: string;
  ctaLabel: string;
  ctaHref: string;
  tone: "sage" | "gold";
}) {
  const toneClasses =
    tone === "sage"
      ? "bg-tertiary-container/40 border-sage/40"
      : "bg-secondary-container/40 border-gold/40";

  return (
    <Link
      href={ctaHref}
      className={`block rounded-md border ${toneClasses} px-gutter py-5 hover:shadow-elevation-2 transition-shadow`}
    >
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        {eyebrow}
      </p>
      <h3 className="font-display text-headline-md text-charcoal mt-2">
        {title}
      </h3>
      {body && (
        <p className="font-body text-body-md text-charcoal mt-3 leading-relaxed">
          {body}
        </p>
      )}
      {subBody && (
        <p className="font-body text-label-sm text-on-surface-variant/80 mt-2">
          {subBody}
        </p>
      )}
      <p className="font-body text-label-md tracking-widest uppercase text-charcoal mt-4 inline-flex items-center gap-1">
        {ctaLabel}
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </p>
    </Link>
  );
}

function SundayLockedCard({ dayName }: { dayName: string }) {
  // Days remaining until next Sunday — Sunday = 0, Monday = 6, …, Saturday = 1.
  const daysUntilSunday: Record<string, number> = {
    Sunday: 0,
    Monday: 6,
    Tuesday: 5,
    Wednesday: 4,
    Thursday: 3,
    Friday: 2,
    Saturday: 1,
  };
  const days = daysUntilSunday[dayName] ?? 0;
  const dayLabel = days === 1 ? "Tomorrow" : `In ${days} days`;

  // Urgency ramps over the week:
  //   Saturday  → gold border + strong pulse + glow
  //   Friday    → gold-tinted border + soft pulse
  //   Mon–Thu   → neutral, very subtle pulse
  const isSaturday = days === 1;
  const isFriday = days === 2;

  const tone = isSaturday
    ? "border-gold/70 bg-secondary-container/40 riven-pulse-strong"
    : isFriday
    ? "border-gold/40 bg-secondary-container/20 riven-pulse-soft"
    : "border-outline-variant/60 bg-surface-container/40 riven-pulse-soft";

  const eyebrowColor = isSaturday
    ? "text-on-secondary-container"
    : isFriday
    ? "text-on-secondary-container/80"
    : "text-on-surface-variant";

  const counterColor = isSaturday
    ? "text-gold font-semibold"
    : "text-on-surface-variant/70";

  const titleByDays = isSaturday
    ? "Sunday check-in opens tomorrow."
    : isFriday
    ? "Two days out. Start thinking about your week."
    : "Sunday check-in is on the calendar.";

  return (
    <div
      className={`relative rounded-md border ${tone} px-gutter py-5`}
      aria-disabled
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p
            className={`font-body text-label-md tracking-widest uppercase flex items-center gap-1.5 ${eyebrowColor}`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isSaturday ? "schedule" : "lock"}
            </span>
            Sunday check-in
          </p>
          <h3 className="font-display text-headline-md text-charcoal mt-2">
            {titleByDays}
          </h3>
          <p className="font-body text-body-md text-on-surface-variant mt-2">
            Weight, waist, photos, and how the week actually went. Sean reads every
            answer.
          </p>
          <p className={`font-body text-label-sm mt-3 ${counterColor}`}>
            {dayLabel}
            {isSaturday && " · ~9:00 AM CT reminder will ping your phone"}
          </p>
        </div>
        <span
          className={`material-symbols-outlined mt-1 ${
            isSaturday ? "text-gold" : "text-on-surface-variant/60"
          }`}
        >
          {isSaturday ? "notifications_active" : "calendar_month"}
        </span>
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
  const hour = new Date().getHours();
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
