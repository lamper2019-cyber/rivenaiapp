import { prisma } from "@/lib/prisma";

/**
 * Server-side data for the /coach/messages dashboard.
 *
 * Returns every active client with:
 *   - their last message (any kind) so the left-rail can show a preview
 *   - whether she's waiting on a reply (her last message is the latest;
 *     RIVEN hasn't answered yet) — drives the "needs you" indicator
 *   - basic context for the right-rail when this client is selected
 *
 * For the active thread (selected via ?clientId=), we also pull the
 * recent message history so the center column can render it.
 */

export type ClientThreadSummary = {
  userId: string;
  firstName: string;
  email: string;
  lastMessage: {
    content: string;
    role: "USER" | "ASSISTANT";
    aiGenerated: boolean;
    createdAt: Date;
  } | null;
  /** She's waiting on RIVEN = her latest message has no RIVEN (or AI)
   *  reply after it. Drives the dot + sort order. */
  waitingOnSean: boolean;
  /** Any pending AI auto-reply queued. RIVEN uses this to decide
   *  whether to chime in (and cancel the AI) vs let AI handle it. */
  pendingAiReplyId: string | null;
};

export type ActiveThreadDetail = {
  userId: string;
  firstName: string;
  email: string;
  profile: {
    name: string;
    age: number;
    phase: string;
    cycleStatus: string;
    currentWeight: number;
    goalWeight: number;
    startWeight: number;
    cutCalories: number;
    proteinFloor: number;
  } | null;
  messages: Array<{
    id: string;
    role: "USER" | "ASSISTANT";
    kind: "AI" | "COACH";
    content: string;
    imageUrls: string[];
    aiGenerated: boolean;
    createdAt: Date;
  }>;
  pendingAiReplyId: string | null;
  pendingAiReplyScheduledFor: Date | null;
};

const ACTIVE_STATUSES = ["trialing", "active", "comped"];

/** All active client threads, newest activity first. The left-rail
 *  list reads this. */
export async function listClientThreads(): Promise<ClientThreadSummary[]> {
  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      subscriptionStatus: { in: ACTIVE_STATUSES },
      profile: { isNot: null },
    },
    select: {
      id: true,
      email: true,
      profile: { select: { name: true } },
      // Most-recent COACH-thread message for each client.
      chatMessages: {
        where: { kind: "COACH" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          content: true,
          role: true,
          aiGenerated: true,
          createdAt: true,
        },
      },
      // Pending auto-reply queue head, if any.
      pendingAiReplies: {
        where: { status: "pending" },
        orderBy: { scheduledFor: "asc" },
        take: 1,
        select: { id: true },
      },
    },
  });

  const rows: ClientThreadSummary[] = clients.map((c) => {
    const last = c.chatMessages[0] ?? null;
    const firstName =
      (c.profile?.name ?? "").trim().split(/\s+/)[0] || "Client";
    return {
      userId: c.id,
      firstName,
      email: c.email,
      lastMessage: last
        ? {
            content: last.content,
            role: last.role as "USER" | "ASSISTANT",
            aiGenerated: last.aiGenerated,
            createdAt: last.createdAt,
          }
        : null,
      waitingOnSean: last?.role === "USER",
      pendingAiReplyId: c.pendingAiReplies[0]?.id ?? null,
    };
  });

  // Sort: "waiting on RIVEN" first, then by last-message recency.
  rows.sort((a, b) => {
    if (a.waitingOnSean !== b.waitingOnSean) {
      return a.waitingOnSean ? -1 : 1;
    }
    const aT = a.lastMessage?.createdAt.getTime() ?? 0;
    const bT = b.lastMessage?.createdAt.getTime() ?? 0;
    return bT - aT;
  });
  return rows;
}

/**
 * Queued voice moments waiting for RIVEN to record. Each row maps to
 * one client + one trigger event (a monthly check-in submission so
 * far). Sorted oldest-first so the queue drains FIFO.
 */
export type QueuedVoiceMoment = {
  id: string;
  recipientUserId: string;
  firstName: string;
  triggerKind: string;
  triggerLabel: string;
  /** Human-readable timing info for the trigger event ("submitted 2
   *  hours ago" / "yesterday"). */
  triggerWhen: Date;
};

export async function listQueuedVoiceMoments(): Promise<QueuedVoiceMoment[]> {
  const rows = await prisma.voiceMoment.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      recipientUserId: true,
      triggerKind: true,
      createdAt: true,
      recipient: {
        select: { profile: { select: { name: true } } },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    recipientUserId: r.recipientUserId,
    firstName:
      (r.recipient.profile?.name ?? "").trim().split(/\s+/)[0] || "Client",
    triggerKind: r.triggerKind,
    triggerLabel: labelForTrigger(r.triggerKind),
    triggerWhen: r.createdAt,
  }));
}

function labelForTrigger(kind: string): string {
  switch (kind) {
    case "monthly_check_in":
      return "Monthly check-in";
    default:
      return kind.replace(/_/g, " ");
  }
}

/** Full thread + context for the actively-selected client. */
export async function getThreadDetail(
  clientUserId: string,
): Promise<ActiveThreadDetail | null> {
  const client = await prisma.user.findUnique({
    where: { id: clientUserId },
    select: {
      id: true,
      email: true,
      role: true,
      profile: {
        select: {
          name: true,
          age: true,
          phase: true,
          cycleStatus: true,
          currentWeight: true,
          goalWeight: true,
          startWeight: true,
          cutCalories: true,
          proteinFloor: true,
        },
      },
      chatMessages: {
        where: { kind: "COACH" },
        orderBy: { createdAt: "asc" },
        // Generous so the full conversation reads — coach side has
        // desktop real estate.
        take: 100,
        select: {
          id: true,
          role: true,
          kind: true,
          content: true,
          imageUrls: true,
          aiGenerated: true,
          createdAt: true,
        },
      },
      pendingAiReplies: {
        where: { status: "pending" },
        orderBy: { scheduledFor: "asc" },
        take: 1,
        select: { id: true, scheduledFor: true },
      },
    },
  });
  if (!client || client.role !== "CLIENT") return null;

  const firstName =
    (client.profile?.name ?? "").trim().split(/\s+/)[0] || "Client";

  return {
    userId: client.id,
    firstName,
    email: client.email,
    profile: client.profile
      ? {
          name: client.profile.name,
          age: client.profile.age,
          phase: client.profile.phase,
          cycleStatus: client.profile.cycleStatus,
          currentWeight: client.profile.currentWeight,
          goalWeight: client.profile.goalWeight,
          startWeight: client.profile.startWeight,
          cutCalories: client.profile.cutCalories,
          proteinFloor: client.profile.proteinFloor,
        }
      : null,
    messages: client.chatMessages.map((m) => ({
      id: m.id,
      role: m.role as "USER" | "ASSISTANT",
      kind: m.kind as "AI" | "COACH",
      content: m.content,
      imageUrls: m.imageUrls,
      aiGenerated: m.aiGenerated,
      createdAt: m.createdAt,
    })),
    pendingAiReplyId: client.pendingAiReplies[0]?.id ?? null,
    pendingAiReplyScheduledFor:
      client.pendingAiReplies[0]?.scheduledFor ?? null,
  };
}
