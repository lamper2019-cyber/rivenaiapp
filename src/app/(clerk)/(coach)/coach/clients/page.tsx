import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getClientWeekNumber } from "@/lib/content-prompts";
import { startOfIsoWeek } from "@/lib/week";

const PHASE_LABEL: Record<string, string> = {
  PHASE_1: "Phase 1",
  PHASE_2: "Phase 2",
  PHASE_3: "Phase 3",
  PHASE_4: "Phase 4",
};

type RosterSearchParams = { q?: string };

export default async function CoachClientsPage({
  searchParams,
}: {
  searchParams: RosterSearchParams;
}) {
  const query = (searchParams.q ?? "").trim();
  const weekStart = startOfIsoWeek(new Date());
  const today = startOfDay(new Date());

  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      ...(query
        ? {
            OR: [
              { email: { contains: query, mode: "insensitive" } },
              { profile: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
      profile: {
        select: {
          name: true,
          phase: true,
          onboardedAt: true,
          cutCalories: true,
          proteinFloor: true,
          currentWeight: true,
          goalWeight: true,
        },
      },
      weeklyCheckIns: {
        orderBy: { weekStart: "desc" },
        take: 1,
        select: { weekStart: true, weight: true },
      },
      dailyTotals: {
        where: { date: today },
        take: 1,
        select: { totalCalories: true, totalProtein: true },
      },
    },
    orderBy: [{ profile: { name: "asc" } }, { email: "asc" }],
  });

  const checkedInThisWeek = (lastCheckInWeekStart: Date | undefined) =>
    lastCheckInWeekStart
      ? lastCheckInWeekStart.getTime() === weekStart.getTime()
      : false;

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-3xl mx-auto py-12 space-y-section-gap">
      <header className="space-y-2">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Coach
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          Your clients
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          {clients.length} {clients.length === 1 ? "client" : "clients"}
          {query ? ` matching "${query}"` : ""}.
        </p>
      </header>

      <form className="flex gap-2" action="/coach/clients" method="GET">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name or email"
          className="flex-1 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-gutter py-3 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/60 focus:border-charcoal focus:outline-none transition-colors"
        />
        <button
          type="submit"
          className="rounded-md bg-charcoal text-cream px-5 py-3 font-body text-body-md hover:opacity-90 transition-opacity"
        >
          Search
        </button>
      </form>

      {clients.length === 0 ? (
        <div className="rounded-md bg-surface-container/40 border border-outline-variant/40 px-gutter py-8 text-center">
          <p className="font-body text-body-md text-on-surface-variant">
            {query
              ? "No clients match that search."
              : "No clients yet. Once someone signs up and finishes onboarding, they'll show up here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {clients.map((c) => {
            const profile = c.profile;
            const lastCheckIn = c.weeklyCheckIns[0];
            const todayCalories = c.dailyTotals[0]?.totalCalories ?? 0;
            const calorieTarget = profile?.cutCalories ?? 0;
            const calPct =
              calorieTarget > 0
                ? Math.min(110, Math.round((todayCalories / calorieTarget) * 100))
                : 0;

            const dotTone = checkedInThisWeek(lastCheckIn?.weekStart)
              ? "bg-sage"
              : lastCheckIn
              ? "bg-gold"
              : "bg-on-surface-variant/40";

            const lastCheckInLabel = lastCheckIn
              ? lastCheckIn.weekStart.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : "no check-in yet";

            const week = profile
              ? getClientWeekNumber(profile.onboardedAt)
              : null;

            return (
              <li key={c.id}>
                <Link
                  href={`/coach/clients/${c.id}`}
                  className="block rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-4 hover:shadow-elevation-2 hover:border-charcoal/40 transition-all shadow-elevation-1"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 inline-block w-2 h-2 rounded-full shrink-0 ${dotTone}`}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <p className="font-display text-headline-sm text-charcoal truncate">
                          {profile?.name ?? c.email.split("@")[0]}
                        </p>
                        <p className="font-body text-label-sm text-on-surface-variant whitespace-nowrap">
                          {week !== null ? `Week ${week}` : "not onboarded"}
                          {profile && ` · ${PHASE_LABEL[profile.phase] ?? profile.phase}`}
                        </p>
                      </div>
                      <p className="font-body text-label-sm text-on-surface-variant/80 mt-0.5 truncate">
                        {c.email}
                      </p>

                      {profile ? (
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <div>
                            <p className="font-body text-label-sm text-on-surface-variant/80">
                              Today
                            </p>
                            <p className="font-body text-body-md text-charcoal">
                              {todayCalories.toLocaleString()}
                              <span className="text-on-surface-variant/70">
                                {" "}
                                / {calorieTarget.toLocaleString()} cal
                              </span>
                              <span className="text-on-surface-variant/60 text-label-sm ml-1">
                                ({calPct}%)
                              </span>
                            </p>
                          </div>
                          <div>
                            <p className="font-body text-label-sm text-on-surface-variant/80">
                              Last check-in
                            </p>
                            <p className="font-body text-body-md text-charcoal">
                              {lastCheckInLabel}
                              {lastCheckIn?.weight !== undefined &&
                                ` · ${lastCheckIn.weight} lbs`}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="font-body text-label-sm text-on-surface-variant mt-3 italic">
                          Signed up {c.createdAt.toLocaleDateString()}, hasn&apos;t finished onboarding.
                        </p>
                      )}
                    </div>
                    <span className="material-symbols-outlined text-charcoal/40 shrink-0 self-center">
                      chevron_right
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="fixed top-[10%] right-[-10%] w-[35%] h-[35%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
