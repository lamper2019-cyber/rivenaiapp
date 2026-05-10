import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, isClerkConfigured } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard";
import { pickQuoteForDate } from "@/lib/daily-quotes";
import { ASK_RIVEN_PROMPTS } from "@/lib/ask-riven-prompts";
import { RotatingText } from "@/components/rotating-text";
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

  const {
    profile,
    todayTotals,
    weekCheckIn,
    weekContent,
    prompt,
    dayName,
  } = data;

  const calorieRemaining = profile.cutCalories - todayTotals.calories;
  const proteinRemaining = profile.proteinFloor - todayTotals.protein;
  const stepRemaining = STEP_GOAL - todayTotals.steps;

  const greeting = pickGreeting(profile.name);
  const dailyQuote = pickQuoteForDate(new Date());
  const isSunday = dayName === "Sunday";

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-3xl mx-auto py-12 space-y-section-gap">
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
        <div className="grid sm:grid-cols-2 gap-3">
          <Link
            href="/log"
            className="rounded-md bg-charcoal text-cream px-gutter py-4 hover:opacity-90 transition-opacity shadow-elevation-1 flex items-center justify-between"
          >
            <span className="font-body text-body-md tracking-wide">Log a meal</span>
            <span className="material-symbols-outlined">edit_note</span>
          </Link>
          <Link
            href="/chat"
            className="group rounded-md bg-gradient-to-br from-secondary-container/60 via-surface-container-lowest to-surface-container-lowest border border-gold/40 text-charcoal px-gutter py-4 hover:border-gold hover:shadow-elevation-2 transition-all shadow-elevation-1 flex items-center justify-between gap-3 overflow-hidden"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-body text-label-sm tracking-widest uppercase text-on-secondary-container/80">
                Ask RIVEN
              </span>
              <RotatingText
                lines={ASK_RIVEN_PROMPTS}
                intervalMs={3200}
                className="font-display text-body-lg text-charcoal whitespace-nowrap"
              />
            </div>
            <span className="material-symbols-outlined text-gold shrink-0 group-hover:scale-110 transition-transform">
              auto_awesome
            </span>
          </Link>
        </div>
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

      {/* Content prompt card */}
      {!weekContent ? (
        <PromptCard
          eyebrow={`This week's prompt · #${prompt.id}`}
          title={prompt.title}
          body={prompt.prompt}
          subBody={prompt.hint}
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
  body: string;
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
      <p className="font-body text-body-md text-charcoal mt-3 leading-relaxed">
        {body}
      </p>
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
  const dayLabel = days === 1 ? "1 day" : `${days} days`;

  return (
    <div
      className="relative rounded-md border border-outline-variant/60 bg-surface-container/40 px-gutter py-5 opacity-75"
      aria-disabled
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">lock</span>
            Sunday check-in
          </p>
          <h3 className="font-display text-headline-md text-charcoal mt-2">
            Opens Sunday morning.
          </h3>
          <p className="font-body text-body-md text-on-surface-variant mt-2">
            Weight, waist, photos, and how the week actually went. Sean reads every
            answer.
          </p>
          <p className="font-body text-label-sm text-on-surface-variant/70 mt-3">
            {days === 0 ? "Available now" : `Available in ${dayLabel}`}
          </p>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant/60 mt-1">
          calendar_month
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
