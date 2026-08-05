import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkoutBoard } from "@/lib/workout";
import { WorkoutBoard } from "@/components/workout-board";

// The numbers change as you tap through a session — never serve a cached board.
export const dynamic = "force-dynamic";

/**
 * The training board — push/pull/legs, three days a week. Same board the coach
 * sees at /coach/train; rows are keyed per user, so everyone keeps their own
 * sets / reps / weight.
 */
export default async function TrainPage() {
  const { userId: clerkId } = auth();

  const user = clerkId
    ? await prisma.user.findUnique({ where: { clerkId }, select: { id: true } })
    : null;

  if (!user) {
    return (
      <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto pt-12">
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          Train
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-3">
          Sign in to load your board.
        </p>
      </main>
    );
  }

  const board = await getWorkoutBoard(user.id);

  return (
    <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto pt-10 pb-8">
      <header className="mb-8">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Your training
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal mt-1">
          Push · Pull · Legs
        </h1>
        <p className="font-body text-body-md text-on-surface-variant mt-2">
          Three days a week. Swipe or tap the arrows to move between them.
        </p>
      </header>

      <WorkoutBoard board={board} />
    </main>
  );
}
