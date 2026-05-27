import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientWeekNumber } from "@/lib/content-prompts";
import { Sparkline } from "@/components/sparkline";
import { toWeightSeries, toWaistSeries } from "@/lib/progress";
import { startOfCentralDay } from "@/lib/dates";
import { buildCalendarDays } from "@/lib/meal-calendar";
import {
  buildHeatmapByClient,
  take7,
} from "@/lib/coach-heatmap";
import { CoachClientTabs } from "@/components/coach-client-tabs";
import { MealCalendar } from "@/components/meal-calendar";
import { LogHeatmap } from "@/components/log-heatmap";
import { SendMessageForm } from "./send-message-form";
import { EditTargetsForm } from "./edit-targets-form";
import { CalorieScheduleForm } from "./calorie-schedule-form";
import { CompToggle } from "./comp-toggle";
import { parseSchedule } from "@/lib/calorie-schedule";
import { getMyMoodHistory } from "@/lib/daily-mood";
import { MoodHistory } from "@/components/mood-history";

const PHASE_LABEL: Record<string, string> = {
  PHASE_1: "Phase 1",
  PHASE_2: "Phase 2",
  PHASE_3: "Phase 3",
  PHASE_4: "Phase 4",
};

const CYCLE_LABEL: Record<string, string> = {
  PRE_PERIOD: "Pre-period",
  ON_PERIOD: "On period",
  MID_CYCLE: "Mid-cycle",
  POST_PERIOD: "Post-period",
  NA: "N/A",
};

const ADHERENCE_LABEL: Record<string, string> = {
  YES: "Yes",
  MOSTLY: "Mostly",
  NOT_REALLY: "Not really",
};

const CALENDAR_DAYS = 28;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default async function CoachClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const today = startOfCentralDay();
  const calendarStart = new Date(today);
  calendarStart.setDate(calendarStart.getDate() - (CALENDAR_DAYS - 1));

  const client = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      subscriptionStatus: true,
      profile: true,
      weeklyCheckIns: {
        orderBy: { weekStart: "desc" },
        take: 12,
        select: {
          id: true,
          userId: true,
          weekStart: true,
          weight: true,
          waist: true,
          photoFrontUrl: true,
          photoSideUrl: true,
          menuAdherence: true,
          sleepAvg: true,
          cycleStatus: true,
          stress: true,
          winsAndStruggles: true,
          createdAt: true,
        },
      },
      mealLogs: {
        where: { createdAt: { gte: calendarStart } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          description: true,
          shortName: true,
          calories: true,
          protein: true,
          fat: true,
          carbs: true,
          createdAt: true,
        },
      },
      dailyTotals: {
        where: { date: today },
        take: 1,
        select: { totalCalories: true, totalProtein: true },
      },
      // Sender join dropped — UI hardcodes "Sean" for COACH messages now,
      // so we don't need to fetch the related User row.
      chatMessages: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          role: true,
          kind: true,
          content: true,
          createdAt: true,
        },
      },
      contentSubmissions: {
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          week: true,
          promptText: true,
          videoUrl: true,
          photoUrl: true,
          createdAt: true,
        },
      },
    },
  });

  if (!client || client.role !== "CLIENT") notFound();

  const profile = client.profile;
  // weeklyCheckIns is DESC newest-first. Sparkline + "latest" need ASC.
  const checkIns = [...client.weeklyCheckIns].reverse();
  const latestCheckIn = checkIns[checkIns.length - 1];
  const chatMessagesAsc = [...client.chatMessages].reverse();

  const week = profile ? getClientWeekNumber(profile.onboardedAt) : null;

  // Derived: today's calories, days since last check-in, 7-day log heatmap.
  const todayCalories = client.dailyTotals[0]?.totalCalories ?? 0;
  const daysSinceCheckIn =
    latestCheckIn !== undefined
      ? Math.floor(
          (today.getTime() -
            startOfCentralDay(latestCheckIn.createdAt).getTime()) /
            MS_PER_DAY,
        )
      : null;

  // 28-day calendar data — also feeds the 7-day Overview heatmap so we don't
  // re-query MealLog. Single source of truth.
  const calendarDays = buildCalendarDays({
    meals: client.mealLogs,
    daysBack: CALENDAR_DAYS,
    cutCalorieTarget: profile?.cutCalories ?? 0,
  });
  const heatmap28 =
    buildHeatmapByClient(
      client.mealLogs.map((m) => ({ userId: client.id, createdAt: m.createdAt })),
      CALENDAR_DAYS,
    ).get(client.id) ?? new Array(CALENDAR_DAYS).fill(false);
  const heatmap7 = take7(heatmap28);

  // 30-day mood history — feeds the Overview "Mood patterns" card so
  // Sean can spot what's driving her tired/meh days month over month.
  // Best-effort; if it fails, the panel just hides.
  const moodHistory = await getMyMoodHistory(client.id, 30).catch(() => []);

  // ---------------- Tab contents ----------------

  const overviewContent = (
    <div className="space-y-section-gap">
      {profile && (
        <section className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1 space-y-4">
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            At a glance
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            <div>
              <p className="font-body text-label-sm text-on-surface-variant/80">
                Today
              </p>
              <p className="font-body text-body-md text-charcoal">
                {todayCalories.toLocaleString()}
                <span className="text-on-surface-variant/70">
                  {" "}
                  / {profile.cutCalories.toLocaleString()} cal
                </span>
              </p>
            </div>
            <div>
              <p className="font-body text-label-sm text-on-surface-variant/80">
                Last check-in
              </p>
              <p className="font-body text-body-md text-charcoal">
                {daysSinceCheckIn === null
                  ? "none yet"
                  : daysSinceCheckIn === 0
                  ? "today"
                  : daysSinceCheckIn === 1
                  ? "yesterday"
                  : `${daysSinceCheckIn} days ago`}
              </p>
            </div>
            <div>
              <p className="font-body text-label-sm text-on-surface-variant/80">
                7-day log
              </p>
              <div className="mt-1.5">
                <LogHeatmap days={heatmap7} />
              </div>
            </div>
          </div>
        </section>
      )}

      {profile && (
        <section className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-3">
            Profile
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Current weight" value={`${profile.currentWeight} lbs`} />
            <Field label="Goal weight" value={`${profile.goalWeight} lbs`} />
            <Field label="Start weight" value={`${profile.startWeight} lbs`} />
            <Field
              label="Cut calories"
              value={`${profile.cutCalories.toLocaleString()}`}
            />
            <Field label="Protein floor" value={`${profile.proteinFloor}g`} />
            <Field
              label="Maintenance"
              value={`${profile.maintenanceCalories.toLocaleString()}`}
            />
            <Field
              label="Activity"
              value={profile.activityLevel.replace("_", " ").toLowerCase()}
            />
            <Field label="Cycle status" value={profile.cycleStatus.toLowerCase()} />
            <Field label="Age" value={`${profile.age}`} />
          </div>
          <EditTargetsForm
            clientUserId={client.id}
            initialCutCalories={profile.cutCalories}
            initialProteinFloor={profile.proteinFloor}
          />
          <CalorieScheduleForm
            clientUserId={client.id}
            defaultCalories={profile.cutCalories}
            initialSchedule={parseSchedule(profile.dailyCalorieSchedule)}
          />
          <CompToggle
            clientUserId={client.id}
            initialStatus={client.subscriptionStatus}
          />
        </section>
      )}

      {/* Mood patterns — last 30 days of one-tap mood + optional cause
          (sleep / food / stress). Lets Sean spot the lever to pull at
          the monthly check-in: "her meh days have been mostly sleep-
          driven this month." Same component clients see on /profile. */}
      <MoodHistory entries={moodHistory} />
    </div>
  );

  const mealsContent = (
    <section className="space-y-3">
      <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        Last 28 days
      </h2>
      <MealCalendar days={calendarDays} target={profile?.cutCalories ?? 0} />
    </section>
  );

  const trendsContent =
    checkIns.length > 0 ? (
      <section className="space-y-3">
        <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Trends
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1">
            <p className="font-body text-label-sm text-on-surface-variant mb-2">
              Weight
            </p>
            <Sparkline
              data={toWeightSeries(checkIns)}
              unit="lbs"
              target={profile?.goalWeight}
              stroke="#1F1A14"
            />
          </div>
          <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1">
            <p className="font-body text-label-sm text-on-surface-variant mb-2">
              Waist
            </p>
            <Sparkline
              data={toWaistSeries(checkIns)}
              unit="″"
              stroke="#1F1A14"
            />
          </div>
        </div>
      </section>
    ) : (
      <EmptyState message="No check-ins yet — once she submits one, trends show up here." />
    );

  const chatContent = (
    <section className="space-y-3">
      <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        Conversation preview
      </h2>

      {chatMessagesAsc.length === 0 ? (
        <div className="rounded-md bg-surface-container/40 border border-outline-variant/40 px-gutter py-6 text-center">
          <p className="font-body text-body-md text-on-surface-variant">
            No chat history yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {chatMessagesAsc.map((m) => {
            const isUser = m.role === "USER";
            const isCoachMessage = m.kind === "COACH" && !isUser;
            // All COACH messages render as "Sean" — single-coach brand, never
            // a stale Profile.name leaking into the UI.
            const senderName = "Sean";

            if (isUser) {
              return (
                <li key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl px-gutter py-2.5 bg-charcoal text-cream">
                    <p className="font-body text-body-md whitespace-pre-wrap leading-relaxed">
                      {m.content}
                    </p>
                  </div>
                </li>
              );
            }
            return (
              <li key={m.id} className="flex justify-start">
                <div
                  className={`max-w-[85%] rounded-xl px-gutter py-2.5 ${
                    isCoachMessage
                      ? "bg-secondary-container/60 border border-gold/50 text-charcoal"
                      : "bg-surface-container-lowest border border-outline-variant/60 text-charcoal"
                  }`}
                >
                  <p className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant mb-1">
                    {isCoachMessage ? senderName : "Riven"}
                  </p>
                  <p className="font-body text-body-md whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-md bg-secondary-container/20 border border-gold/30 p-gutter shadow-elevation-1 mt-4">
        <p className="font-body text-label-md tracking-widest uppercase text-on-secondary-container mb-3">
          Send a coach message
        </p>
        <SendMessageForm clientUserId={client.id} />
      </div>
    </section>
  );

  const weeklyContent = (
    <div className="space-y-section-gap">
      {latestCheckIn ? (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Latest check-in · week of{" "}
            {latestCheckIn.weekStart.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: "America/Chicago",
            })}
          </h2>
          <div className="rounded-md bg-tertiary-container/30 border border-sage/40 p-gutter shadow-elevation-1 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Weight" value={`${latestCheckIn.weight} lbs`} />
              <Field label="Waist" value={`${latestCheckIn.waist}″`} />
              <Field label="Sleep avg" value={`${latestCheckIn.sleepAvg} hrs`} />
              <Field label="Stress" value={`${latestCheckIn.stress} / 5`} />
              <Field
                label="Cycle"
                value={
                  CYCLE_LABEL[latestCheckIn.cycleStatus] ??
                  latestCheckIn.cycleStatus
                }
              />
              <Field
                label="Stuck to menu"
                value={
                  ADHERENCE_LABEL[latestCheckIn.menuAdherence] ??
                  latestCheckIn.menuAdherence
                }
              />
            </div>

            {(latestCheckIn.photoFrontUrl || latestCheckIn.photoSideUrl) && (
              <div className="flex gap-3">
                {latestCheckIn.photoFrontUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={latestCheckIn.photoFrontUrl}
                    alt="Front check-in photo"
                    width={160}
                    height={160}
                    loading="lazy"
                    decoding="async"
                    className="w-32 h-32 sm:w-40 sm:h-40 rounded-md object-cover bg-charcoal/10"
                  />
                )}
                {latestCheckIn.photoSideUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={latestCheckIn.photoSideUrl}
                    alt="Side check-in photo"
                    width={160}
                    height={160}
                    loading="lazy"
                    decoding="async"
                    className="w-32 h-32 sm:w-40 sm:h-40 rounded-md object-cover bg-charcoal/10"
                  />
                )}
              </div>
            )}

            {latestCheckIn.winsAndStruggles && (
              <div>
                <p className="font-body text-label-sm text-on-surface-variant mb-1">
                  Wins & struggles
                </p>
                <p className="font-body text-body-md text-charcoal whitespace-pre-wrap leading-relaxed">
                  {latestCheckIn.winsAndStruggles}
                </p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <EmptyState message="No check-ins submitted yet." />
      )}

      {/* Earlier check-ins, compact */}
      {checkIns.length > 1 && (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Earlier check-ins
          </h2>
          <ul className="space-y-2">
            {checkIns
              .slice(0, -1)
              .reverse()
              .map((c) => (
                <li
                  key={c.id}
                  className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-3 shadow-elevation-1"
                >
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <p className="font-body text-body-md text-charcoal">
                      Week of{" "}
                      {c.weekStart.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "America/Chicago",
                      })}
                    </p>
                    <p className="font-body text-label-sm text-on-surface-variant whitespace-nowrap">
                      {c.weight} lbs · {c.waist}″
                    </p>
                  </div>
                  {c.winsAndStruggles && (
                    <p className="font-body text-label-sm text-on-surface-variant mt-1 line-clamp-2">
                      {c.winsAndStruggles}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}

      {client.contentSubmissions.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Content submissions
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {client.contentSubmissions.map((s) => {
              const isVideo = !!s.videoUrl;
              const isPhoto = !s.videoUrl && !!s.photoUrl;
              const downloadHref = isVideo
                ? `/api/coach/download?id=${s.id}&kind=video`
                : isPhoto
                ? `/api/coach/download?id=${s.id}&kind=photo`
                : null;
              return (
                <li
                  key={s.id}
                  className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-3 shadow-elevation-1"
                >
                  <p className="font-body text-label-sm text-on-surface-variant mb-2">
                    {s.week.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "America/Chicago",
                    })}
                  </p>
                  <div className="relative">
                    {isVideo ? (
                      <a
                        href={s.videoUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block aspect-square rounded-md bg-charcoal/90 hover:bg-charcoal transition-colors flex items-center justify-center text-cream"
                      >
                        <span className="material-symbols-outlined text-[36px]">
                          play_arrow
                        </span>
                      </a>
                    ) : isPhoto ? (
                      <a
                        href={s.photoUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block aspect-square rounded-md overflow-hidden bg-charcoal/10"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.photoUrl!}
                          alt={`Content submission from ${s.week.toLocaleDateString()}`}
                          width={200}
                          height={200}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ) : null}
                    {downloadHref && (
                      <a
                        href={downloadHref}
                        aria-label="Download submission"
                        className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-8 h-8 rounded-full bg-cream/95 backdrop-blur-md border border-outline-variant/60 text-charcoal shadow-elevation-1 hover:bg-cream transition-colors active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          download
                        </span>
                      </a>
                    )}
                  </div>
                  <p className="font-body text-label-sm text-charcoal mt-2 line-clamp-2">
                    {s.promptText}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-3xl mx-auto py-8 space-y-section-gap">
      <Link
        href="/coach/clients"
        className="inline-flex items-center gap-1 font-body text-label-md tracking-widest uppercase text-on-surface-variant hover:text-charcoal transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        All clients
      </Link>

      {/* Header */}
      <header className="space-y-2">
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          {profile?.name ?? client.email.split("@")[0]}
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          {client.email}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {week !== null && (
            <span className="font-body text-label-md text-charcoal">
              Week {week}
            </span>
          )}
          {profile && (
            <span className="font-body text-label-md text-charcoal">
              {PHASE_LABEL[profile.phase] ?? profile.phase}
            </span>
          )}
          <span className="font-body text-label-md text-on-surface-variant">
            Signed up{" "}
            {client.createdAt.toLocaleDateString("en-US", {
              timeZone: "America/Chicago",
            })}
          </span>
        </div>
      </header>

      <CoachClientTabs
        overview={overviewContent}
        meals={mealsContent}
        trends={trendsContent}
        chat={chatContent}
        weekly={weeklyContent}
      />

      <div className="fixed top-[10%] right-[-10%] w-[35%] h-[35%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-body text-label-sm text-on-surface-variant/80">{label}</p>
      <p className="font-body text-body-md text-charcoal capitalize">{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md bg-surface-container/40 border border-outline-variant/40 px-gutter py-8 text-center">
      <p className="font-body text-body-md text-on-surface-variant">{message}</p>
    </div>
  );
}
