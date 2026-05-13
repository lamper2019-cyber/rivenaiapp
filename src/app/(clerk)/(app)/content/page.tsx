import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfIsoWeek, formatWeekRange } from "@/lib/week";
import { getPromptForClientWeek, getClientWeekNumber } from "@/lib/content-prompts";
import { ContentForm } from "./content-form";

export default async function ContentPage() {
  const { userId } = auth();
  const weekStart = startOfIsoWeek(new Date());

  let onboarded = true;
  let clientWeek = 1;
  let existing: {
    id: string;
    videoUrl: string | null;
    photoUrl: string | null;
    createdAt: Date;
  } | null = null;
  let submissionsThisCycle: { id: string; week: Date; videoUrl: string | null; photoUrl: string | null }[] = [];

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: { profile: { select: { id: true, onboardedAt: true } } },
      });
      onboarded = !!user?.profile;
      if (user?.profile) {
        clientWeek = getClientWeekNumber(user.profile.onboardedAt);
      }

      if (user) {
        existing = await prisma.contentSubmission.findFirst({
          where: { userId: user.id, week: weekStart },
          orderBy: { createdAt: "desc" },
          select: { id: true, videoUrl: true, photoUrl: true, createdAt: true },
        });

        // Last 6 weeks for the timeline strip.
        submissionsThisCycle = await prisma.contentSubmission.findMany({
          where: { userId: user.id },
          orderBy: { week: "desc" },
          take: 6,
          select: { id: true, week: true, videoUrl: true, photoUrl: true },
        });
      }
    } catch {
      /* ignore — render the form anyway */
    }
  }

  const prompt = getPromptForClientWeek(clientWeek);

  return (
    <main className="relative min-h-screen px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-12">
      <header className="mb-section-gap space-y-3">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          This week&apos;s prompt · {formatWeekRange(weekStart)}
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
          {prompt.title}
        </h1>
        <p className="font-body text-body-lg text-charcoal max-w-md leading-relaxed">
          {prompt.prompt}
        </p>
        <p className="font-body text-label-sm text-on-surface-variant/80 max-w-md">
          {prompt.hint}
        </p>
      </header>

      {!onboarded && (
        <div className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-3 mb-6">
          <p className="font-body text-body-md text-charcoal">
            Complete onboarding before recording.{" "}
            <Link href="/onboarding" className="underline underline-offset-4">
              Go to onboarding →
            </Link>
          </p>
        </div>
      )}

      {existing && (
        <div className="rounded-md bg-tertiary-container/40 border border-sage/40 px-gutter py-4 mb-8">
          <p className="font-body text-label-md tracking-widest uppercase text-sage">
            Submitted this week
          </p>
          <p className="font-body text-body-md text-charcoal mt-2">
            Recorded {existing.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}.
            Submit again below to replace.
          </p>
        </div>
      )}

      <ContentForm onboarded={onboarded} />

      {submissionsThisCycle.length > 0 && (
        <section className="mt-section-gap space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Recent recordings
          </h2>
          <ul className="space-y-2">
            {submissionsThisCycle.map((s) => (
              <li
                key={s.id}
                className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-3 flex items-center justify-between"
              >
                <span className="font-body text-body-md text-charcoal">
                  Week of{" "}
                  {s.week.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: "America/Chicago",
                  })}
                </span>
                {(s.videoUrl ?? s.photoUrl) && (
                  <a
                    href={s.videoUrl ?? s.photoUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-label-md text-charcoal underline underline-offset-4"
                  >
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="fixed top-[-10%] right-[-10%] w-[40%] h-[30%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
