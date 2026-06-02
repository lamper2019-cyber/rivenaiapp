import { getRecentMeals, getTodayTotals } from "./actions";
import { LogForm } from "./log-form";
import { startOfCentralDay } from "@/lib/dates";
import { RefreshOnDayChange } from "@/components/refresh-on-day-change";

// Force fresh render per request — without this, a tab opened yesterday
// would still show yesterday's "Today" meals after the date rolls over.
// Paired with <RefreshOnDayChange /> which triggers a soft refresh when
// the tab becomes visible after being hidden, or when the Central date
// changes.
export const dynamic = "force-dynamic";

export default async function LogPage() {
  // Pull recent meals and slice to today's only. We deliberately keep just
  // the "Today" section in the UI — no Frequent, no Earlier this week — so
  // the log page stays focused on what's happening right now.
  const [recentMeals, todayTotals] = await Promise.all([
    getRecentMeals(12),
    getTodayTotals(),
  ]);

  const todayStart = startOfCentralDay();
  const todayMeals = recentMeals.filter((m) => m.createdAt >= todayStart);

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-12">
      <RefreshOnDayChange />
      <header className="mb-section-gap space-y-3">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Log a meal
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
          What did you eat?
        </h1>
        <p className="font-body text-body-md text-on-surface-variant max-w-md">
          Tell RIVEN like you&apos;d tell RIVEN. We&apos;ll handle the macros.
        </p>
      </header>

      <LogForm todayMeals={todayMeals} initialTotals={todayTotals} />

      <div className="fixed top-[-10%] right-[-10%] w-[30%] h-[30%] bg-gold/5 blur-[100px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
