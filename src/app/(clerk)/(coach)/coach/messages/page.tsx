import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getThreadDetail,
  listClientThreads,
  listQueuedVoiceMoments,
  type ActiveThreadDetail,
} from "@/lib/coach-messages";
import { MessagesBoard } from "./messages-board";

/**
 * Coach messaging dashboard — three-column layout, every active client
 * thread in one place. Sean reads from here, replies from here, and
 * sees which threads have pending AI auto-replies he might want to
 * intercept.
 *
 * Layout (per Messaging Dashboard UI mockup, RIVEN brand tokens):
 *   - LEFT: client list with search + filter chips + last-message
 *     preview + "needs you" indicator
 *   - CENTER: active thread + reply input
 *   - RIGHT: client context panel (current weight, targets, last
 *     check-in trend)
 *
 * Active client selected via ?clientId= — falls back to first
 * "waiting on Sean" client on initial load.
 */
export default async function CoachMessagesPage({
  searchParams,
}: {
  searchParams?: { clientId?: string };
}) {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  const [threads, voiceQueue] = await Promise.all([
    listClientThreads().catch(() => []),
    listQueuedVoiceMoments().catch(() => []),
  ]);

  // Pick active thread: explicit ?clientId= wins, else first row
  // (which is already sorted "waiting on Sean" first, then by recency).
  const selectedId =
    (searchParams?.clientId &&
      threads.find((t) => t.userId === searchParams.clientId)?.userId) ||
    threads[0]?.userId ||
    null;

  let active: ActiveThreadDetail | null = null;
  if (selectedId) {
    active = await getThreadDetail(selectedId).catch(() => null);
  }

  return (
    <MessagesBoard threads={threads} active={active} voiceQueue={voiceQueue} />
  );
}
