"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { sendCoachReply } from "./actions";
import { VoiceQueueChip } from "./voice-queue";
import type {
  ActiveThreadDetail,
  ClientThreadSummary,
  QueuedVoiceMoment,
} from "@/lib/coach-messages";

/**
 * Three-column messaging dashboard for /coach/messages.
 *
 * Layout (matches Messaging Dashboard UI mockup, RIVEN brand tokens):
 *
 *   ┌────────────┬───────────────────────────┬──────────────┐
 *   │ CLIENTS    │   ACTIVE THREAD           │  CONTEXT     │
 *   │ (search +  │   (header · messages ·    │  (current    │
 *   │  filters · │    reply input)           │   stats)     │
 *   │  rows)     │                           │              │
 *   └────────────┴───────────────────────────┴──────────────┘
 *
 * On mobile the left rail collapses into a "back to list" header; the
 * right rail hides entirely (RIVEN uses the dashboard mostly on desktop
 * anyway). Filter chips control which threads show in the list; client
 * selection via ?clientId= so refresh / link-share works.
 *
 * RIVEN's reply: types into the input, hits send, sendCoachReply fires.
 * That action also cancels any queued AI auto-reply so the client
 * doesn't get a duplicate response.
 */
export function MessagesBoard({
  threads,
  active,
  voiceQueue,
}: {
  threads: ClientThreadSummary[];
  active: ActiveThreadDetail | null;
  voiceQueue: QueuedVoiceMoment[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "needs_you" | "recent">("all");

  // Refresh every 30s so new client messages land without a manual
  // page reload. Cheap given the server query is one big findMany.
  useEffect(() => {
    const interval = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [router]);

  function selectClient(userId: string) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("clientId", userId);
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  }

  const visibleThreads = useMemo(() => {
    let rows = threads;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (t) =>
          t.firstName.toLowerCase().includes(q) ||
          t.email.toLowerCase().includes(q),
      );
    }
    if (filter === "needs_you") {
      rows = rows.filter((t) => t.waitingOnSean);
    } else if (filter === "recent") {
      const oneDayAgo = Date.now() - 86_400_000;
      rows = rows.filter(
        (t) =>
          t.lastMessage && t.lastMessage.createdAt.getTime() >= oneDayAgo,
      );
    }
    return rows;
  }, [threads, search, filter]);

  const needsYouCount = threads.filter((t) => t.waitingOnSean).length;

  return (
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 flex bg-cream pt-0">
      {/* LEFT — client list */}
      <aside className="w-80 md:w-96 shrink-0 border-r border-outline-variant/40 bg-cream flex flex-col">
        <div className="p-gutter space-y-3 border-b border-outline-variant/40">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h1 className="font-display text-headline-md text-charcoal">
              Messages
            </h1>
            {needsYouCount > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gold text-charcoal font-body text-label-sm">
                {needsYouCount} need you
              </span>
            )}
          </div>
          {/* Voice moments queue chip — only renders when there are
              queued milestones to record. Tap opens the recorder modal. */}
          <VoiceQueueChip queue={voiceQueue} />
          {/* Search */}
          <div className="relative">
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 text-[18px]"
              aria-hidden
            >
              search
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="w-full pl-9 pr-3 py-2 rounded-full bg-surface-container border-0 focus:ring-2 focus:ring-charcoal/20 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/60 outline-none"
            />
          </div>
          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <FilterChip
              label="All"
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterChip
              label="Needs you"
              active={filter === "needs_you"}
              onClick={() => setFilter("needs_you")}
            />
            <FilterChip
              label="Last 24h"
              active={filter === "recent"}
              onClick={() => setFilter("recent")}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {visibleThreads.length === 0 ? (
            <p className="font-body text-body-md text-on-surface-variant/80 p-gutter">
              No threads match.
            </p>
          ) : (
            <ul>
              {visibleThreads.map((t) => {
                const isActive = active?.userId === t.userId;
                return (
                  <li key={t.userId}>
                    <button
                      type="button"
                      onClick={() => selectClient(t.userId)}
                      className={`w-full text-left px-gutter py-3 border-l-4 flex gap-3 transition-colors ${
                        isActive
                          ? "border-charcoal bg-secondary-container/30"
                          : "border-transparent hover:bg-surface-container/40"
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-secondary-container/60 border border-gold/30 flex items-center justify-center">
                          <span className="font-display text-headline-md text-charcoal leading-none">
                            {t.firstName[0]?.toUpperCase() ?? "?"}
                          </span>
                        </div>
                        {t.waitingOnSean && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-gold border-2 border-cream"
                            aria-hidden
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-body text-body-md text-charcoal truncate">
                            {t.firstName}
                          </p>
                          {t.lastMessage && (
                            <span className="font-body text-label-sm text-on-surface-variant/70 shrink-0">
                              {relativeTime(t.lastMessage.createdAt)}
                            </span>
                          )}
                        </div>
                        <p className="font-body text-label-sm text-on-surface-variant truncate mt-0.5">
                          {t.lastMessage
                            ? formatPreview(t.lastMessage)
                            : "No messages yet"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* CENTER — active thread */}
      <section className="flex-1 flex flex-col bg-surface-container-lowest">
        {active ? (
          <ActivePane active={active} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-gutter">
            <p className="font-body text-body-md text-on-surface-variant text-center max-w-sm">
              Pick a thread from the left to read it.
            </p>
          </div>
        )}
      </section>

      {/* RIGHT — context */}
      {active?.profile && (
        <aside className="w-80 shrink-0 border-l border-outline-variant/40 bg-cream hidden lg:flex flex-col overflow-y-auto">
          <ContextPane active={active} />
        </aside>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-4 py-1.5 rounded-full font-body text-label-sm tracking-wide transition-colors ${
        active
          ? "bg-charcoal text-cream"
          : "bg-surface-container text-on-surface-variant hover:text-charcoal"
      }`}
    >
      {label}
    </button>
  );
}

/* ───────────────────────────────────────────────────────────── */
/* Active thread pane                                            */
/* ───────────────────────────────────────────────────────────── */

function ActivePane({ active }: { active: ActiveThreadDetail }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active.messages.length, active.userId]);

  function send() {
    const trimmed = draft.trim();
    if (!trimmed || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await sendCoachReply({
        clientUserId: active.userId,
        message: trimmed,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft("");
      router.refresh();
    });
  }

  return (
    <>
      {/* Header */}
      <header className="h-16 border-b border-outline-variant/40 px-gutter flex items-center justify-between bg-cream/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary-container/60 border border-gold/30 flex items-center justify-center">
            <span className="font-display text-headline-md text-charcoal leading-none">
              {active.firstName[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
          <div>
            <h2 className="font-display text-headline-md text-charcoal leading-none">
              {active.firstName}
            </h2>
            <p className="font-body text-label-sm text-on-surface-variant/80 mt-1">
              {active.email}
            </p>
          </div>
        </div>
        {active.pendingAiReplyId && (
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary-container/30 border border-gold/40"
            title={
              active.pendingAiReplyScheduledFor
                ? `Auto-reply queued for ${active.pendingAiReplyScheduledFor.toLocaleTimeString()}`
                : undefined
            }
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" aria-hidden />
            <span className="font-body text-label-sm text-charcoal">
              Auto-reply queued
            </span>
          </div>
        )}
      </header>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-gutter space-y-4">
        {active.messages.length === 0 ? (
          <p className="font-body text-body-md text-on-surface-variant/70 text-center">
            No messages yet. Write something below to start the thread.
          </p>
        ) : (
          active.messages.map((m) => <ThreadBubble key={m.id} message={m} />)
        )}
        <div ref={scrollAnchorRef} aria-hidden className="h-2" />
      </div>

      {/* Input */}
      <footer className="border-t border-outline-variant/40 p-gutter bg-cream/60">
        <div className="flex items-end gap-2 bg-surface-container-lowest border border-outline-variant rounded-2xl px-3 py-2 shadow-elevation-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={`Write to ${active.firstName}…`}
            className="flex-1 bg-transparent border-0 focus:ring-0 outline-none py-2 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/60 resize-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || draft.trim().length === 0}
            aria-label="Send"
            className="shrink-0 w-10 h-10 rounded-full bg-charcoal text-cream flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">
              {pending ? "more_horiz" : "arrow_upward"}
            </span>
          </button>
        </div>
        {error && (
          <p className="font-body text-label-sm text-soft-red mt-2">{error}</p>
        )}
        {active.pendingAiReplyId && (
          <p className="font-body text-label-sm text-on-surface-variant/80 mt-2">
            Your reply will cancel the queued auto-reply.
          </p>
        )}
      </footer>
    </>
  );
}

function ThreadBubble({
  message,
}: {
  message: ActiveThreadDetail["messages"][number];
}) {
  const isUser = message.role === "USER";
  if (isUser) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-surface-container px-gutter py-3 border border-outline-variant/40">
          {message.imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.imageUrls.map((url, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={i}
                  src={url}
                  alt="From client"
                  className="max-w-[140px] max-h-[140px] rounded-md object-cover"
                />
              ))}
            </div>
          )}
          <p className="font-body text-body-md text-charcoal whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
          <p className="font-body text-label-sm text-on-surface-variant/70 mt-1.5 text-right">
            {message.createdAt.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
    );
  }
  // Assistant — RIVEN or AI auto-reply on RIVEN's behalf.
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-charcoal text-cream px-gutter py-3 shadow-elevation-1">
        <p className="font-body text-body-md whitespace-pre-wrap leading-relaxed">
          {message.content}
        </p>
        <div className="flex items-center justify-between gap-3 mt-1.5">
          {message.aiGenerated ? (
            <span
              className="inline-flex items-center gap-1 font-body text-label-sm text-cream/70"
              title="This was the auto-reply on your behalf — the client sees it as from RIVEN."
            >
              <span aria-hidden>◆</span>
              auto-reply
            </span>
          ) : (
            <span className="font-body text-label-sm text-cream/70">you</span>
          )}
          <span className="font-body text-label-sm text-cream/70">
            {message.createdAt.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── */
/* Right context pane                                            */
/* ───────────────────────────────────────────────────────────── */

function ContextPane({ active }: { active: ActiveThreadDetail }) {
  const p = active.profile;
  if (!p) return null;
  const lost = p.startWeight - p.currentWeight;
  const remaining = p.currentWeight - p.goalWeight;
  return (
    <div className="p-gutter space-y-6">
      <div>
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          Context
        </p>
        <h3 className="font-display text-headline-md text-charcoal mt-1">
          {p.name}
        </h3>
        <p className="font-body text-label-sm text-on-surface-variant mt-1">
          Age {p.age} · {p.phase.replace("_", " ").toLowerCase()} ·{" "}
          {p.cycleStatus.toLowerCase().replace("_", " ")}
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-md bg-surface-container-lowest border border-outline-variant/40 p-gutter">
          <div className="flex items-baseline justify-between">
            <p className="font-body text-label-sm text-on-surface-variant">
              Weight
            </p>
            <p className="font-body text-label-sm text-on-surface-variant">
              goal {p.goalWeight} lbs
            </p>
          </div>
          <p className="font-display text-headline-md text-charcoal mt-1">
            {p.currentWeight} lbs
          </p>
          <p className="font-body text-label-sm text-on-surface-variant/80 mt-1">
            {lost > 0
              ? `Down ${lost.toFixed(1)} lbs from start`
              : lost < 0
                ? `Up ${Math.abs(lost).toFixed(1)} lbs from start`
                : "Even with start"}
            {remaining > 0 && ` · ${remaining.toFixed(1)} to go`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Calorie target" value={`${p.cutCalories}`} />
          <Stat label="Protein floor" value={`${p.proteinFloor}g`} />
        </div>
      </div>

      <a
        href={`/coach/clients/${active.userId}`}
        className="block text-center bg-charcoal text-cream rounded-full py-3 font-body text-label-md tracking-widest uppercase shadow-elevation-1 active:scale-95 hover:opacity-90 transition-all"
      >
        Open full profile
      </a>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/40 p-3">
      <p className="font-body text-label-sm text-on-surface-variant">{label}</p>
      <p className="font-display text-headline-sm text-charcoal mt-1 leading-none">
        {value}
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── */
/* Helpers                                                       */
/* ───────────────────────────────────────────────────────────── */

function formatPreview(
  msg: NonNullable<ClientThreadSummary["lastMessage"]>,
): string {
  const prefix =
    msg.role === "ASSISTANT" ? (msg.aiGenerated ? "◆ " : "You: ") : "";
  return `${prefix}${msg.content.replace(/\s+/g, " ").slice(0, 80)}`;
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
