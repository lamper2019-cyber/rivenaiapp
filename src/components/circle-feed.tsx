"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FeedPost, PostKind } from "@/lib/community";
import type { DailyQuestionSnapshot } from "@/lib/daily-question";
import { DailyQuestionCard } from "@/components/daily-question-card";
import {
  createCirclePost,
  toggleCircleHeart,
  addCircleReply,
  reportCirclePost,
  blockCircleAuthor,
} from "@/app/(clerk)/(app)/circle/actions";

const KIND_ICON: Record<PostKind, string> = {
  walk: "directions_walk",
  meal: "restaurant",
  win: "auto_awesome",
  heavy: "rainy",
  note: "edit",
};
const QUICK = ["I see you.", "That's steady.", "Proud of you."];
const QUICK_HEAVY = ["I'm here.", "Holding this with you.", "Rest. We've got you."];

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function CircleFeed({
  initialFeed,
  movedToday,
  dailyQuestion,
}: {
  initialFeed: FeedPost[];
  movedToday: number;
  dailyQuestion: DailyQuestionSnapshot | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selfOpen, setSelfOpen] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  function quickPost(kind: PostKind, text: string) {
    startTransition(async () => {
      await createCirclePost({ kind, text });
      router.refresh();
    });
  }

  return (
    <main className="relative px-container-mobile max-w-2xl mx-auto py-8 pb-56">
      {/* Header */}
      <header className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-display text-headline-lg text-charcoal">The Circle</h1>
          <p className="font-body text-label-md text-on-surface-variant">
            Everyone, steady together
          </p>
        </div>
        {movedToday > 0 && (
          <span className="rounded-full bg-sage/15 border border-sage/40 px-3 py-1 font-body text-label-sm text-sage">
            {movedToday} moved today
          </span>
        )}
      </header>

      {/* The room's heartbeat — today's question, pinned, with everyone's
          answers. Replaced the static RIVEN morning card: same charcoal
          treatment, but alive. Falls back to the old line if the question
          fails to load. */}
      <div className="mb-5">
        {dailyQuestion ? (
          <DailyQuestionCard snapshot={dailyQuestion} variant="circle" />
        ) : (
          <div className="rounded-2xl bg-charcoal text-cream px-gutter py-4">
            <p className="font-body text-[10px] tracking-widest uppercase text-gold mb-1">
              RIVEN
            </p>
            <p className="font-body text-body-md">
              A tap is enough. But if today needs more words, the room is open. No rush.
            </p>
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="space-y-4">
        {initialFeed.length === 0 ? (
          <p className="font-body text-body-md text-on-surface-variant text-center py-10">
            Quiet so far. Be the first to check in — tap one below.
          </p>
        ) : (
          initialFeed.map((p) => (
            <PostCard key={p.id} post={p} pending={pending} onChange={refresh} />
          ))
        )}
      </div>

      {/* Sticky bottom — quick posts + peel-open composer (sits above bottom nav) */}
      <div
        className="fixed inset-x-0 bottom-16 z-30 bg-cream/95 backdrop-blur-md border-t border-outline-variant/40 px-container-mobile pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
      >
        <div className="max-w-2xl mx-auto">
          {selfOpen ? (
            <Composer
              placeholder="No rush. Say what you need to say."
              disabled={pending}
              onCancel={() => setSelfOpen(false)}
              onSend={(t) => {
                setSelfOpen(false);
                quickPost("note", t);
              }}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSelfOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 font-body text-label-sm text-on-surface-variant py-1.5 active:opacity-70"
              >
                <span className="material-symbols-outlined text-[16px] text-gold">edit</span>
                Something on your mind? Say more…
              </button>
              <div className="grid grid-cols-4 gap-2 mt-1">
                <QuickBtn icon="restaurant" label="Ate well" onClick={() => quickPost("meal", "Ate well today.")} disabled={pending} />
                <QuickBtn icon="directions_walk" label="Walked" onClick={() => quickPost("walk", "Got my walk in.")} disabled={pending} />
                <QuickBtn icon="auto_awesome" label="A win" onClick={() => quickPost("win", "Small win today.")} disabled={pending} />
                <QuickBtn icon="rainy" label="Heavy day" heavy onClick={() => quickPost("heavy", "Heavy day. Just need to be seen.")} disabled={pending} />
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function PostCard({
  post,
  pending,
  onChange,
}: {
  post: FeedPost;
  pending: boolean;
  onChange: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [replyOpen, setReplyOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const heavy = post.kind === "heavy";
  const quick = heavy ? QUICK_HEAVY : QUICK;

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
      onChange();
    });

  return (
    <div
      className={`rounded-2xl border px-gutter py-4 ${
        heavy ? "bg-soft-red/[0.06] border-soft-red/30" : "bg-white/55 border-outline-variant/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex w-9 h-9 rounded-xl items-center justify-center font-display text-cream text-[15px]"
          style={{ background: post.isYou ? "#1A1A1A" : post.authorColor }}
          aria-hidden
        >
          {post.isYou ? "♥" : post.authorName[0]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-body text-body-md font-semibold text-charcoal">{post.authorName}</p>
          <p className="font-body text-[10px] text-on-surface-variant">{timeAgo(post.createdAt)}</p>
        </div>
        <span className={`material-symbols-outlined text-[18px] ${heavy ? "text-soft-red" : "text-sage"}`}>
          {KIND_ICON[post.kind]}
        </span>
        {!post.isYou && (
          <div className="relative">
            <button
              type="button"
              aria-label="Post options"
              onClick={() => setMenuOpen((o) => !o)}
              className="material-symbols-outlined text-[18px] text-on-surface-variant/60"
            >
              more_horiz
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-6 z-10 rounded-xl bg-cream border border-outline-variant/60 shadow-elevation-2 overflow-hidden w-32">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); act(() => reportCirclePost(post.id)); }}
                  className="block w-full text-left px-3 py-2 font-body text-label-md text-charcoal hover:bg-charcoal/5"
                >
                  Report
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); act(() => blockCircleAuthor(post.authorId)); }}
                  className="block w-full text-left px-3 py-2 font-body text-label-md text-soft-red hover:bg-charcoal/5"
                >
                  Block
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="font-body text-body-md text-charcoal mt-2.5 leading-relaxed">{post.text}</p>

      <div className="flex items-center gap-4 mt-3">
        <button
          type="button"
          disabled={post.isYou || pending}
          onClick={() => act(() => toggleCircleHeart(post.id))}
          className="flex items-center gap-1 active:scale-90 transition-transform disabled:opacity-60"
        >
          <span className={`material-symbols-outlined text-[18px] ${post.youHearted ? "text-soft-red filled" : "text-on-surface-variant/60"}`}>
            favorite
          </span>
          <span className="font-body text-label-sm text-on-surface-variant">{post.hearts}</span>
        </button>
      </div>

      {/* Quick cheers + write-your-own (only on others' posts) */}
      {!post.isYou && (
        <div className="flex flex-wrap gap-2 mt-3">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              disabled={pending}
              onClick={() => act(() => addCircleReply({ postId: post.id, text: q }))}
              className="rounded-full bg-cream border border-gold/60 px-3 py-1.5 font-body text-label-sm text-charcoal active:scale-95 transition-transform disabled:opacity-60"
            >
              {q}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setReplyOpen((o) => !o)}
            className="rounded-full border border-dashed border-on-surface-variant/50 px-3 py-1.5 font-body text-label-sm text-on-surface-variant active:scale-95 transition-transform"
          >
            Write your own
          </button>
        </div>
      )}

      {replyOpen && !post.isYou && (
        <div className="mt-3">
          <Composer
            placeholder={`Say something to ${post.authorName}…`}
            disabled={pending}
            onCancel={() => setReplyOpen(false)}
            onSend={(t) => { setReplyOpen(false); act(() => addCircleReply({ postId: post.id, text: t })); }}
          />
        </div>
      )}

      {post.replies.length > 0 && (
        <div className="mt-3 pt-3 border-t border-outline-variant/40 space-y-1.5">
          {post.replies.map((r, i) => (
            <p key={i} className="font-body text-label-md">
              <span className={`font-semibold ${r.you ? "text-gold" : "text-charcoal"}`}>{r.authorName} </span>
              <span className="text-on-surface-variant">{r.text}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickBtn({
  icon, label, onClick, disabled, heavy,
}: {
  icon: string; label: string; onClick: () => void; disabled?: boolean; heavy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl border active:scale-95 transition-transform disabled:opacity-50 ${
        heavy ? "bg-soft-red/[0.06] border-soft-red/30 text-soft-red" : "bg-white/55 border-outline-variant/50 text-charcoal"
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      <span className="font-body text-[10px] font-semibold">{label}</span>
    </button>
  );
}

function Composer({
  placeholder, onSend, onCancel, disabled,
}: {
  placeholder: string; onSend: (t: string) => void; onCancel: () => void; disabled?: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <div>
      <textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-2.5 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none"
      />
      <div className="flex items-center justify-between mt-2">
        <button type="button" onClick={onCancel} className="font-body text-label-sm text-on-surface-variant">
          Cancel
        </button>
        <button
          type="button"
          disabled={!text.trim() || disabled}
          onClick={() => text.trim() && onSend(text.trim())}
          className="rounded-full bg-charcoal text-cream px-5 py-2 font-body text-label-sm tracking-widest uppercase disabled:opacity-40 active:scale-95 transition-transform"
        >
          Share
        </button>
      </div>
    </div>
  );
}
