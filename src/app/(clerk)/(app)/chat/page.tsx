import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChatUI, type ChatMessage } from "./chat-ui";

const HISTORY_LIMIT = 30;

/**
 * The "Sean" tab — unified message thread.
 *
 * Renders every COACH-kind message for the viewer (her side as role=USER,
 * Sean's side as role=ASSISTANT — whether real Sean wrote it or the
 * auto-reply scheduler did). aiGenerated is loaded but NOT shown in the
 * UI; clients see all assistant messages as "from Sean."
 *
 * Replaces the previous /chat page (RIVEN AI bot, kind=AI). Old AI
 * messages stay in the DB but don't render here — different surface,
 * different mental model. RIVEN AI as a destination is retired.
 */
export default async function ChatPage() {
  const { userId } = auth();

  let initialMessages: ChatMessage[] = [];
  let onboarded = true;
  let pendingReplyId: string | null = null;

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: { profile: { select: { id: true } } },
      });
      onboarded = !!user?.profile;

      if (user) {
        const [messagesDesc, pending] = await Promise.all([
          prisma.chatMessage.findMany({
            where: { userId: user.id, kind: "COACH" },
            orderBy: { createdAt: "desc" },
            take: HISTORY_LIMIT,
            select: {
              id: true,
              role: true,
              kind: true,
              content: true,
              imageUrls: true,
              aiGenerated: true,
            },
          }),
          // Is there a pending AI reply queued for her? Drives the
          // "Sean's reading..." indicator in the UI so she knows a
          // response is coming.
          prisma.pendingAiReply.findFirst({
            where: { userId: user.id, status: "pending" },
            orderBy: { scheduledFor: "asc" },
            select: { id: true },
          }),
        ]);
        initialMessages = messagesDesc.reverse().map((m) => ({
          id: m.id,
          role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
          kind: m.kind,
          content: m.content,
          imageUrls: m.imageUrls,
          senderName: undefined,
        }));
        pendingReplyId = pending?.id ?? null;
      }
    } catch {
      /* DB unavailable — render empty state */
    }
  }

  return (
    <main className="relative flex flex-col min-h-screen pb-32">
      <header className="px-container-mobile md:px-container-desktop max-w-3xl mx-auto w-full pt-8 pb-4">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gold/15 border border-gold/40"
            aria-hidden
          >
            <span className="font-display text-headline-md text-charcoal leading-none">
              S
            </span>
          </span>
          <div>
            <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
              Sean
            </p>
            <p className="font-body text-label-sm text-on-surface-variant/80">
              Your coach
            </p>
          </div>
        </div>
      </header>

      <ChatUI
        initialMessages={initialMessages}
        onboarded={onboarded}
        initialHasPendingReply={pendingReplyId !== null}
      />

      <div className="fixed top-[20%] right-[-15%] w-[40%] h-[30%] bg-sage/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
