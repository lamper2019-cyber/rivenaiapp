"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FeedPost } from "@/lib/community";
import type { DailyQuestionSnapshot } from "@/lib/daily-question";
import { DailyQuestionCard } from "@/components/daily-question-card";
import {
  createCirclePost,
  toggleCircleHeart,
  addCircleReply,
  reportCirclePost,
  blockCircleAuthor,
  deleteCirclePost,
  deleteCircleReply,
} from "@/app/(clerk)/(app)/circle/actions";

/**
 * The Circle — a plain conversation room. No category buttons, no canned
 * cheers (they go stale). Just: RIVEN's daily question at the top, a box to
 * say your own thing, and everyone's posts newest-first. Hearts + free-text
 * replies; you can delete your own post or reply; report/block others.
 */

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function CircleFeed({
  initialFeed,
  dailyQuestion,
}: {
  initialFeed: FeedPost[];
  dailyQuestion: DailyQuestionSnapshot | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [composeOpen, setComposeOpen] = useState(false);
  const refresh = () => startTransition(() => router.refresh());

  function post(text: string, imageUrl?: string) {
    startTransition(async () => {
      await createCirclePost({ kind: "note", text, imageUrl });
      setComposeOpen(false);
      router.refresh();
    });
  }

  return (
    <main className="relative px-container-mobile max-w-2xl mx-auto py-8 pb-24">
      <header className="mb-6">
        <h1 className="font-display text-headline-lg text-charcoal">The Circle</h1>
        <p className="font-body text-label-md text-on-surface-variant">
          Everyone, steady together
        </p>
      </header>

      {/* RIVEN's daily question — poses it, leads into the room. */}
      {dailyQuestion && (
        <div className="mb-5">
          <DailyQuestionCard snapshot={dailyQuestion} variant="circle" />
        </div>
      )}

      {/* Compose — always at the top, since the freshest posts are up here. */}
      <div className="mb-5">
        {composeOpen ? (
          <Composer
            placeholder="Say what's on your mind, or show your plate…"
            disabled={pending}
            allowPhoto
            onCancel={() => setComposeOpen(false)}
            onSend={post}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="w-full flex items-center gap-2 rounded-2xl border border-outline-variant/60 bg-white/55 px-4 py-3 text-left font-body text-body-md text-on-surface-variant active:scale-[0.99] transition-transform"
          >
            <span className="material-symbols-outlined text-[20px] text-gold">photo_camera</span>
            Share a plate or a thought…
          </button>
        )}
      </div>

      {/* Feed — newest first. */}
      <div className="space-y-4">
        {initialFeed.length === 0 ? (
          <p className="font-body text-body-md text-on-surface-variant text-center py-10">
            The room&apos;s open. Be the first — share a plate or what&apos;s on your mind.
          </p>
        ) : (
          initialFeed.map((p) => (
            <PostCard key={p.id} post={p} pending={pending} onChange={refresh} />
          ))
        )}
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

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
      onChange();
    });

  return (
    <div className="riven-rise-in rounded-2xl border border-outline-variant/50 bg-white/55 px-gutter py-4">
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
              {post.isYou ? (
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); act(() => deleteCirclePost(post.id)); }}
                  className="block w-full text-left px-3 py-2 font-body text-label-md text-soft-red hover:bg-charcoal/5"
                >
                  Delete
                </button>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {post.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt={`Shared by ${post.authorName}`}
          loading="lazy"
          className="mt-3 w-full rounded-xl border border-outline-variant/40 object-cover max-h-96"
        />
      )}

      {post.text && (
        <p className="font-body text-body-md text-charcoal mt-2.5 leading-relaxed whitespace-pre-wrap">{post.text}</p>
      )}

      <div className="flex items-center gap-4 mt-3">
        {/* The Circle's cheer is a rose — RIVEN's "I've got you" language. */}
        <button
          type="button"
          disabled={post.isYou || pending}
          onClick={() => act(() => toggleCircleHeart(post.id))}
          aria-label={post.youHearted ? "Take back your rose" : "Send a rose"}
          className="flex items-center gap-1 active:scale-90 transition-transform disabled:opacity-60"
        >
          <span className={`material-symbols-outlined text-[18px] ${post.youHearted ? "text-gold filled" : "text-on-surface-variant/60"}`}>
            local_florist
          </span>
          <span className="font-body text-label-sm text-on-surface-variant">{post.hearts}</span>
        </button>
        {!post.isYou && (
          <button
            type="button"
            onClick={() => setReplyOpen((o) => !o)}
            className="flex items-center gap-1 font-body text-label-sm text-on-surface-variant active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant/60">chat_bubble</span>
            Reply
          </button>
        )}
      </div>

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
          {post.replies.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-2">
              <p className="font-body text-label-md">
                <span className={`font-semibold ${r.you ? "text-gold" : "text-charcoal"}`}>{r.authorName} </span>
                <span className="text-on-surface-variant">{r.text}</span>
              </p>
              {r.you && (
                <button
                  type="button"
                  aria-label="Delete your reply"
                  onClick={() => act(() => deleteCircleReply(r.id))}
                  className="shrink-0 material-symbols-outlined text-[16px] text-on-surface-variant/50 active:scale-90 transition-transform"
                >
                  close
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Composer({
  placeholder, onSend, onCancel, disabled, allowPhoto,
}: {
  placeholder: string;
  onSend: (t: string, imageUrl?: string) => void;
  onCancel: () => void;
  disabled?: boolean;
  allowPhoto?: boolean;
}) {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Presigned PUT to R2 — same flow as the check-in photo upload.
  function handleFile(file: File) {
    setUploadError(null);
    startUpload(async () => {
      try {
        const contentType = file.type || "image/jpeg";
        const signResp = await fetch("/api/r2/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType,
            contentLength: file.size,
            scope: "circle",
          }),
        });
        if (!signResp.ok) {
          const d = await signResp.json().catch(() => ({}));
          throw new Error(d.error ?? "Couldn't add that photo. Try a smaller one.");
        }
        const { uploadUrl, publicUrl } = (await signResp.json()) as {
          uploadUrl: string;
          publicUrl: string;
        };
        const put = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": contentType },
        });
        if (!put.ok) throw new Error("Upload failed. Check your connection and try again.");
        setImageUrl(publicUrl);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  const canSend = (text.trim().length > 0 || !!imageUrl) && !disabled && !uploading;

  return (
    <div>
      <textarea
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none rounded-2xl border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none"
      />

      {imageUrl && (
        <div className="relative mt-2 w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Your photo" className="w-full rounded-xl border border-outline-variant/40 object-cover max-h-72" />
          <button
            type="button"
            onClick={() => setImageUrl(null)}
            aria-label="Remove photo"
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-charcoal/80 text-cream material-symbols-outlined text-[18px]"
          >
            close
          </button>
        </div>
      )}

      {uploadError && (
        <p className="mt-2 font-body text-label-sm text-soft-red">{uploadError}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel} className="font-body text-label-sm text-on-surface-variant">
            Cancel
          </button>
          {allowPhoto && !imageUrl && (
            <label className="flex items-center gap-1 font-body text-label-sm text-charcoal cursor-pointer active:opacity-70">
              <span className="material-symbols-outlined text-[18px] text-gold">photo_camera</span>
              {uploading ? "Adding…" : "Photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => canSend && onSend(text.trim(), imageUrl ?? undefined)}
          className="rounded-full bg-charcoal text-cream px-6 py-2.5 font-body text-label-sm tracking-widest uppercase disabled:opacity-40 active:scale-95 transition-transform"
        >
          Share
        </button>
      </div>
    </div>
  );
}
