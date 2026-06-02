import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChatUI, type ChatMessage } from "./chat-ui";

const HISTORY_LIMIT = 30;

/**
 * RIVEN AI — streaming AI chat. Restored as the 4th bottom-nav tab
 * on 2026-05-27 (later that evening, after the "keep it simple" pass
 * left it tabless).
 *
 * Strictly user ↔ AI: filters ChatMessage by kind="AI". RIVEN's COACH
 * thread lives at /chat (separate surface, separate mental model).
 * The streaming endpoint is /api/chat/stream, untouched from when
 * this UI was the original /chat page.
 *
 * She can: voice-log meals (the log_meal tool), ask nutrition Qs,
 * snap a photo of a plate. Same model + same prompt as it always was.
 */
export default async function AiPage() {
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
        // RIVEN AI is strictly the user ↔ AI conversation. COACH messages
        // live on /chat (RIVEN's thread). Filtering by kind here is the
        // single source of truth — no coach content ever leaks into the
        // AI thread.
        const messagesDesc = await prisma.chatMessage.findMany({
          where: { userId: user.id, kind: "AI" },
          orderBy: { createdAt: "desc" },
          take: HISTORY_LIMIT,
          select: {
            id: true,
            role: true,
            kind: true,
            content: true,
            imageUrls: true,
          },
        });
        initialMessages = messagesDesc.reverse().map((m) => ({
          id: m.id,
          role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
          kind: m.kind,
          content: m.content,
          imageUrls: m.imageUrls,
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
          RIVEN AI
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
