import { getRecentMeals, getTodayTotals } from "./actions";
import { LogForm } from "./log-form";

export default async function LogPage() {
  const [recentMeals, todayTotals] = await Promise.all([
    getRecentMeals(8),
    getTodayTotals(),
  ]);

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

      <LogForm recentMeals={recentMeals} initialTotals={todayTotals} />

      <div className="fixed top-[-10%] right-[-10%] w-[30%] h-[30%] bg-gold/5 blur-[100px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
