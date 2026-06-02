import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MessagesInbox, type CoachMessage } from "./messages-inbox";

/**
 * Client-facing inbox for coach (RIVEN) messages. Kept entirely separate from
 * RIVEN Ai (/chat) — that thread is user ↔ AI only. The "Message from RIVEN"
 * pulsing badge on the dashboard links here; visiting clears the unread glow
 * by writing the latest coach message id to localStorage.
 */
export default async function MessagesPage() {
  const { userId } = auth();

  let messages: CoachMessage[] = [];
  let dbReachable = true;

  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { id: true },
      });

      if (user) {
        // 30-day window matches the dashboard badge — older messages are
        // hidden from the inbox (not deleted, just not surfaced).
        const since = new Date();
        since.setDate(since.getDate() - 30);

        const rows = await prisma.chatMessage.findMany({
          where: {
            userId: user.id,
            kind: "COACH",
            createdAt: { gte: since },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            content: true,
            createdAt: true,
          },
        });
        messages = rows.map((m) => ({
          id: m.id,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        }));
      }
    } catch {
      dbReachable = false;
    }
  }

  return (
    <main className="relative min-h-screen pb-24 px-container-mobile md:px-container-desktop max-w-3xl mx-auto pt-8">
      <header className="space-y-2 mb-6">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Inbox
        </p>
        <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
          Messages from RIVEN
        </h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Personal notes from your coach. The last 30 days live here.
        </p>
      </header>

      {!isClerkConfigured ? (
        <Placeholder>Add real Clerk keys to .env.local to view your messages.</Placeholder>
      ) : !dbReachable ? (
        <Placeholder>Database unavailable — try again in a moment.</Placeholder>
      ) : messages.length === 0 ? (
        <div className="rounded-md bg-surface-container/40 border border-outline-variant/40 px-gutter py-8 text-center">
          <p className="font-body text-body-md text-on-surface-variant">
            No messages from RIVEN yet. When he sends one, it lands here and
            your dashboard chip will glow.
          </p>
        </div>
      ) : (
        <MessagesInbox messages={messages} />
      )}

      <div className="fixed top-[15%] right-[-15%] w-[40%] h-[30%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-4 font-body text-body-md text-on-surface-variant">
      {children}
    </div>
  );
}
