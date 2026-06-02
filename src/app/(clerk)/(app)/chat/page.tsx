import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChatUI, type ChatMessage } from "./chat-ui";

const HISTORY_LIMIT = 30;

/**
 * The RIVEN thread.
 *
 * Reached two ways: (1) tap the Message-from-RIVEN bubble at the top
 * of /dashboard, (2) deep-link from a push notification. There is no
 * bottom-nav tab for this — RIVEN's coaching is always surfaced via
 * the dashboard bubble first.
 *
 * Renders every COACH-kind message for the viewer (her side as
 * role=USER, RIVEN's side as role=ASSISTANT). She can type a free-text
 * reply at the bottom; her message persists and shows up in RIVEN's
 * /coach/messages inbox where he answers manually.
 *
 * The AI auto-reply pipeline is OFF. When she sends a message, it
 * sits and waits for real RIVEN. No bot pretends to be him.
 */
export const dynamic = "force-dynamic";

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
            audioUrl: true,
            audioDurationSec: true,
            chipOptions: true,
            chipsRepliedAt: true,
          },
        });
        initialMessages = messagesDesc.reverse().map((m) => ({
          id: m.id,
          role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
          kind: m.kind,
          content: m.content,
          imageUrls: m.imageUrls,
          senderName: undefined,
          audioUrl: m.audioUrl,
          audioDurationSec: m.audioDurationSec,
          chipOptions: parseChipOptions(m.chipOptions),
          chipsRepliedAt: m.chipsRepliedAt
            ? m.chipsRepliedAt.toISOString()
            : null,
        }));
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
              RIVEN
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
        initialHasPendingReply={false}
      />

      <div className="fixed top-[20%] right-[-15%] w-[40%] h-[30%] bg-sage/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

/** Parse the JSON chipOptions column into a typed array. */
function parseChipOptions(
  raw: unknown,
): Array<{ label: string; value: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ label: string; value: string }> = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).label === "string" &&
      typeof (item as Record<string, unknown>).value === "string"
    ) {
      out.push({
        label: (item as { label: string }).label,
        value: (item as { value: string }).value,
      });
    }
  }
  return out;
}
