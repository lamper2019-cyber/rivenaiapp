import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfIsoWeek, formatWeekRange } from "@/lib/week";
import { CheckInForm } from "./check-in-form";

export default async function CheckInPage() {
  const { userId } = auth();

  let onboarded = true;
  let existing: {
    id: string;
    weight: number;
    waist: number;
    photoFrontUrl: string | null;
    photoSideUrl: string | null;
    sleepAvg: number;
    stress: number;
    winsAndStruggles: string;
  } | null = null;
  const weekStart = startOfIsoWeek(new Date());

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: { profile: { select: { id: true } } },
      });
      onboarded = !!user?.profile;

      if (user) {
        existing = await prisma.weeklyCheckIn.findUnique({
          where: { userId_weekStart: { userId: user.id, weekStart } },
          select: {
            id: true,
            weight: true,
            waist: true,
            photoFrontUrl: true,
            photoSideUrl: true,
            sleepAvg: true,
            stress: true,
            winsAndStruggles: true,
          },
        });
      }
    } catch {
      /* DB not available — render form anyway */
    }
  }

  return (
    <main className="relative min-h-screen px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-12">
      <header className="mb-section-gap space-y-3">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Sunday check-in · {formatWeekRange(weekStart)}
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance">
          The week, on the record.
        </h1>
        <p className="font-body text-body-lg text-on-surface-variant max-w-md">
          Eight questions. Two photos. This is how Sean sees the trend, not just
          the day.
        </p>
      </header>

      {!onboarded && (
        <div className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-3 mb-6">
          <p className="font-body text-body-md text-charcoal">
            Complete onboarding before checking in.{" "}
            <Link href="/onboarding" className="underline underline-offset-4">
              Go to onboarding →
            </Link>
          </p>
        </div>
      )}

      {existing && (
        <div className="rounded-md bg-tertiary-container/40 border border-sage/40 px-gutter py-4 mb-6">
          <p className="font-body text-label-md tracking-widest uppercase text-sage">
            Already checked in this week
          </p>
          <p className="font-body text-body-md text-charcoal mt-2">
            Weight {existing.weight} lbs · Waist {existing.waist}″ · Sleep{" "}
            {existing.sleepAvg}h · Stress {existing.stress}/10
          </p>
          <p className="font-body text-label-sm text-on-surface-variant mt-2">
            Submit again to update this week&apos;s entry.
          </p>
        </div>
      )}

      <CheckInForm onboarded={onboarded} initial={existing} />

      <div className="fixed top-[-10%] right-[-10%] w-[40%] h-[30%] bg-sage/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
