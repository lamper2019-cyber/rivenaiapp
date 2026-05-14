import { getFrequentMeals, getRecentMeals, getTodayTotals } from "./actions";
import { LogForm } from "./log-form";
import { startOfCentralDay } from "@/lib/dates";

export default async function LogPage() {
  // Pull 20 recent meals so we can comfortably split into "today" + "earlier"
  // — most clients log 3-5/day so 20 covers ~4-5 days of history.
  const [recentMeals, frequentMeals, todayTotals] = await Promise.all([
    getRecentMeals(20),
    getFrequentMeals(5),
    getTodayTotals(),
  ]);

  // Split server-side by Central-time today vs earlier, so the client doesn't
  // have to reason about timezones.
  const todayStart = startOfCentralDay();
  const todayMeals = recentMeals.filter((m) => m.createdAt >= todayStart);
  const earlierMeals = recentMeals.filter((m) => m.createdAt < todayStart).slice(0, 8);

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-12">
      <header className="mb-section-gap space-y-3">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Log a meal
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
          What did you eat?
        </h1>
        <p className="font-body text-body-md text-on-surface-variant max-w-md">
          Tell RIVEN like you&apos;d tell Sean. We&apos;ll handle the macros.
        </p>
      </header>

      <LogForm
        todayMeals={todayMeals}
        earlierMeals={earlierMeals}
        frequentMeals={frequentMeals}
        initialTotals={todayTotals}
      />

      <div className="fixed top-[-10%] right-[-10%] w-[30%] h-[30%] bg-gold/5 blur-[100px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
