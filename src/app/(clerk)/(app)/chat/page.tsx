import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChatUI, type ChatMessage } from "./chat-ui";

const HISTORY_LIMIT = 30;

export default async function ChatPage() {
  const { userId } = auth();

  let initialMessages: ChatMessage[] = [];
  let onboarded = true;

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: { profile: { select: { id: true } } },
      });
      onboarded = !!user?.profile;

      if (user) {
        const messagesDesc = await prisma.chatMessage.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: HISTORY_LIMIT,
          select: {
            id: true,
            role: true,
            kind: true,
            content: true,
            imageUrls: true,
            sender: {
              select: {
                profile: { select: { name: true } },
                email: true,
              },
            },
          },
        });
        initialMessages = messagesDesc.reverse().map((m) => ({
          id: m.id,
          role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
          kind: m.kind,
          content: m.content,
          imageUrls: m.imageUrls,
          // All COACH messages display as "Sean" — single-coach brand, and
          // never leak Profile.name (which may be stale from when Sean tested
          // his own client account before role gating existed). senderName
          // stays undefined; the UI hardcodes "Sean" for coach messages.
          senderName: undefined,
        }));
      }
    } catch {
      /* DB unavailable — render empty state */
    }
  }

  return (
    <main className="relative flex flex-col min-h-screen pb-32">
      <header className="px-container-mobile md:px-container-desktop max-w-3xl mx-auto w-full pt-8 pb-4">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Riven
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal mt-1">
          Ask me anything.
        </h1>
      </header>

      <ChatUI initialMessages={initialMessages} onboarded={onboarded} />

      <div className="fixed top-[20%] right-[-15%] w-[40%] h-[30%] bg-sage/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
