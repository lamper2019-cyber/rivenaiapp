"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendToSean } from "./sean-actions";

const MAX_IMAGES_PER_MESSAGE = 4;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  kind: "AI" | "COACH";
  content: string;
  imageUrls?: string[];
  senderName?: string;
  /** Voice memo from Sean. When present, the bubble renders an audio
   *  player instead of the plain-text bubble (content is empty in
   *  this case). Only set on assistant/COACH messages. */
  audioUrl?: string | null;
  audioDurationSec?: number | null;
  /** Tap-reply chips for Sean's proactive daily prompts. When set +
   *  chipsRepliedAt is null, the bubble renders chip buttons below
   *  the text. Tapping a chip fires sendToSean and stamps
   *  chipsRepliedAt so the chips disappear on next render. */
  chipOptions?: Array<{ label: string; value: string }>;
  chipsRepliedAt?: string | null;
};

type PendingAttachment = {
  localId: string;
  status: "uploading" | "uploaded" | "error";
  publicUrl?: string;
  previewUrl: string;
  error?: string;
};

export function ChatUI({
  initialMessages,
  onboarded,
  initialHasPendingReply = false,
}: {
  initialMessages: ChatMessage[];
  onboarded: boolean;
  /** Server-side hint: does this user have a PendingAiReply queued?
   *  Drives the "Sean's reading..." indicator on first paint so it's
   *  visible immediately rather than after the first polling tick. */
  initialHasPendingReply?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  // "sending" = her send() in flight (saving the user message + scheduling
  // a reply). "hasPendingReply" = there's a PendingAiReply queued for her;
  // "showReadingIndicator" = the ~60s grace period has elapsed and we
  // should render the "Sean's reading..." bubble. The grace period
  // hides the indicator from popping up the second she taps send —
  // that would read as a bot. We let her message sit alone for a beat
  // first, then the indicator appears.
  const [sending, setSending] = useState(false);
  const [hasPendingReply, setHasPendingReply] = useState(initialHasPendingReply);
  const [showReadingIndicator, setShowReadingIndicator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Drives the staggered exit animation on the empty-state cards. Stays
  // true through the animation window so EmptyState keeps mounting; the
  // wrapper around send() flips it on, waits, then calls actual send.
  const [emptyExiting, setEmptyExiting] = useState(false);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number>(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  // Poll for new messages while a reply is pending. Sean's auto-reply
  // lands within ~2 minutes — refreshing every 15 seconds catches it
  // quickly after the cron fires. router.refresh() re-runs the server
  // page component, which re-fetches the thread + pending-reply state.
  useEffect(() => {
    if (!hasPendingReply) return;
    const interval = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [hasPendingReply, router]);

  // The "Sean's reading..." indicator does NOT show immediately. We
  // wait ~60 seconds after the pending state begins, then show it.
  // Reads as Sean opened the message and is composing a reply —
  // matches the ~2 min total wait. If the reply lands inside the
  // grace window (rare with our distribution but possible), the
  // indicator never appears and her reply just shows up.
  const READING_INDICATOR_DELAY_MS = 60_000;
  useEffect(() => {
    if (!hasPendingReply) {
      setShowReadingIndicator(false);
      return;
    }
    const t = window.setTimeout(
      () => setShowReadingIndicator(true),
      READING_INDICATOR_DELAY_MS,
    );
    return () => window.clearTimeout(t);
  }, [hasPendingReply]);

  // Sync local state when initialMessages / initialHasPendingReply
  // change (router.refresh() updates props). New assistant messages
  // mean the reply landed — clear the pending flag.
  useEffect(() => {
    setMessages(initialMessages);
    setHasPendingReply(initialHasPendingReply);
  }, [initialMessages, initialHasPendingReply]);

  // Revoke any object URLs and stop the recorder if the component unmounts.
  useEffect(() => {
    return () => {
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      const recorder = recorderRef.current;
      if (recorder && recorder.state === "recording") recorder.stop();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePickFiles() {
    fileInputRef.current?.click();
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const slotsLeft = MAX_IMAGES_PER_MESSAGE - attachments.length;
    const accepted = Array.from(files).slice(0, slotsLeft);

    for (const file of accepted) {
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const previewUrl = URL.createObjectURL(file);
      setAttachments((prev) => [
        ...prev,
        { localId, status: "uploading", previewUrl },
      ]);

      try {
        const sign = await fetch("/api/r2/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || "image/jpeg",
            contentLength: file.size,
            scope: "chat",
          }),
        });
        if (!sign.ok) {
          const data = await sign.json().catch(() => ({}));
          throw new Error(data.error ?? `Sign failed: ${sign.status}`);
        }
        const { uploadUrl, publicUrl } = (await sign.json()) as {
          uploadUrl: string;
          publicUrl: string;
        };

        const put = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "image/jpeg" },
        });
        if (!put.ok) throw new Error(`Upload failed: ${put.status}`);

        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId
              ? { ...a, status: "uploaded", publicUrl }
              : a
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId ? { ...a, status: "error", error: msg } : a
          )
        );
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(localId: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.localId !== localId);
    });
  }

  // Length of the exit-animation window before send() actually fires when
  // the chat is empty. Lines up with EmptyState's 250ms per-card + 60ms
  // stagger across 4 cards + intro paragraph delay. Past this point all
  // empty-state elements have visually finished leaving.
  const EMPTY_EXIT_MS = 380;

  /** Single send pipeline. opts.chipMessageId is set when the source
   *  is a chip tap on a Sean message — server stamps that row's
   *  chipsRepliedAt so the chips collapse. */
  async function send(
    text: string,
    opts?: { chipMessageId?: string },
  ) {
    const trimmed = text.trim();
    const uploadedImages = attachments
      .filter((a) => a.status === "uploaded" && a.publicUrl)
      .map((a) => a.publicUrl!);

    if (!trimmed && uploadedImages.length === 0) return;
    if (sending) return;

    // First message in this thread — animate the empty state out
    // before the user's message lands.
    if (messages.length === 0 && !emptyExiting) {
      setEmptyExiting(true);
      await new Promise((r) => setTimeout(r, EMPTY_EXIT_MS));
    }

    setError(null);
    setInput("");

    // Optimistic: drop her message into the thread immediately so the
    // UI feels instant. No assistant placeholder — Sean's reply lands
    // 1.5-15 min later via the cron, and the polling effect picks it
    // up. While waiting, the "Sean's reading..." indicator shows.
    const userMsg: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      kind: "COACH",
      content: trimmed,
      imageUrls: uploadedImages,
    };
    // Optimistic: if this is a chip tap, also stamp chipsRepliedAt
    // locally so the chips collapse immediately. The server confirms
    // on the next router.refresh.
    setMessages((prev) => {
      const next = [...prev, userMsg];
      if (opts?.chipMessageId) {
        const nowIso = new Date().toISOString();
        for (let i = 0; i < next.length; i++) {
          if (next[i].id === opts.chipMessageId && !next[i].chipsRepliedAt) {
            next[i] = { ...next[i], chipsRepliedAt: nowIso };
          }
        }
      }
      return next;
    });
    setAttachments([]);
    setSending(true);
    setEmptyExiting(false);

    try {
      const r = await sendToSean({
        message: trimmed || "(image)",
        imageUrls: uploadedImages,
        chipMessageId: opts?.chipMessageId,
      });
      if (!r.ok) throw new Error(r.error);
      setHasPendingReply(true);
      // Refresh once to pick up the server-rendered version of the
      // message (canonical id, server timestamp). The polling effect
      // takes over from here.
      startTransition(() => router.refresh());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      // Rollback the optimistic user message so she doesn't see a
      // dead bubble.
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  async function startRecording() {
    setError(null);
    if (recording || transcribing) return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice memos need microphone access. This browser doesn't support it.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission denied. Allow access in your browser settings.");
      return;
    }

    // Pick the best mime the browser supports (Chrome → webm/opus, Safari → mp4/m4a).
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
    const supported = candidates.find((m) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
    );
    const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);

    recordedChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];
      if (chunks.length === 0) {
        setRecording(false);
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      setRecording(false);
      setTranscribing(true);

      try {
        const fd = new FormData();
        fd.append("audio", blob, "voice-memo");
        const resp = await fetch("/api/chat/transcribe", {
          method: "POST",
          body: fd,
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data.error ?? `Transcribe failed: ${resp.status}`);
        }
        const data = (await resp.json()) as { text: string };
        // Append to whatever the user already had typed so they don't lose it.
        setInput((prev) => (prev ? `${prev} ${data.text}` : data.text));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Transcription failed";
        setError(msg);
      } finally {
        setTranscribing(false);
      }
    };

    recorder.start();
    recorderRef.current = recorder;
    recordingStartRef.current = Date.now();
    setRecordingMs(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingMs(Date.now() - recordingStartRef.current);
    }, 200);
    setRecording(true);
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else void startRecording();
  }

  const isEmpty = messages.length === 0;
  const anyUploadInFlight = attachments.some((a) => a.status === "uploading");
  const hasAnyAttachment = attachments.length > 0;
  const canSend =
    !sending &&
    !anyUploadInFlight &&
    !recording &&
    !transcribing &&
    onboarded &&
    (input.trim().length > 0 || hasAnyAttachment);

  return (
    <>
      <div className="flex-1 flex flex-col px-container-mobile md:px-container-desktop max-w-3xl mx-auto w-full">
        {!onboarded && (
          <div className="rounded-md bg-secondary-container/40 border border-gold/40 px-gutter py-3 mb-6">
            <p className="font-body text-body-md text-charcoal">
              Complete onboarding before messaging Sean. Head back to{" "}
              <a href="/onboarding" className="underline underline-offset-4">
                /onboarding
              </a>
              .
            </p>
          </div>
        )}

        {(isEmpty || emptyExiting) && onboarded ? (
          <EmptyState
            onPrompt={(p) => send(p)}
            disabled={sending}
            exiting={emptyExiting}
          />
        ) : (
          <ul className="space-y-6 py-4">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onChipTap={(value, chipMessageId) =>
                  void send(value, { chipMessageId })
                }
              />
            ))}
            {/* "Sean's reading..." indicator. Doesn't appear until
                ~60s after she sends (see showReadingIndicator effect
                above) so it doesn't pop up the second her message
                lands — that would read as a bot. Sits below the last
                user message as a normal assistant-style bubble with
                three pulsing dots. */}
            {showReadingIndicator && (
              <li className="flex justify-start">
                <div className="rounded-xl px-gutter py-3 bg-surface-container-lowest border border-outline-variant/60 shadow-elevation-1 inline-flex items-center gap-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-sage"
                    aria-hidden
                  />
                  <span className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
                    Sean&apos;s reading
                  </span>
                  <span className="inline-flex gap-1">
                    <Dot delay="0ms" />
                    <Dot delay="150ms" />
                    <Dot delay="300ms" />
                  </span>
                </div>
              </li>
            )}
          </ul>
        )}

        {error && (
          <div className="rounded-md border border-soft-red/40 bg-soft-red/10 px-gutter py-3 my-4">
            <p className="font-body text-body-md text-soft-red">{error}</p>
          </div>
        )}

        <div ref={scrollAnchorRef} aria-hidden className="h-4" />
      </div>

      {/* Input — fixed above the bottom nav */}
      <form
        onSubmit={handleSubmit}
        className="fixed bottom-24 left-0 right-0 z-40 px-container-mobile md:px-container-desktop"
      >
        <div className="max-w-3xl mx-auto">
          {/* Recording indicator */}
          {(recording || transcribing) && (
            <div className="mb-2 rounded-md bg-charcoal text-cream px-gutter py-2 flex items-center gap-2">
              <span
                className={`material-symbols-outlined text-[18px] ${
                  recording ? "animate-pulse text-soft-red" : ""
                }`}
              >
                {recording ? "fiber_manual_record" : "hourglass_top"}
              </span>
              <span className="font-body text-label-md tracking-wide">
                {recording
                  ? `Recording · ${formatDuration(recordingMs)} · tap stop when done`
                  : "Transcribing…"}
              </span>
            </div>
          )}

          {/* Attachment thumbnails */}
          {attachments.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
              {attachments.map((a) => (
                <div key={a.localId} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.previewUrl}
                    alt="Attachment preview"
                    className={`w-16 h-16 rounded-md object-cover bg-surface-container border border-outline-variant/60 ${
                      a.status === "uploading" ? "opacity-60" : ""
                    } ${a.status === "error" ? "ring-2 ring-soft-red" : ""}`}
                  />
                  {a.status === "uploading" && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="material-symbols-outlined text-cream text-[20px] animate-pulse">
                        hourglass_empty
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.localId)}
                    aria-label="Remove attachment"
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-charcoal text-cream flex items-center justify-center text-xs hover:bg-charcoal/80"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-xl bg-surface-container-lowest border border-outline-variant shadow-elevation-2 px-3 py-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={handlePickFiles}
              disabled={
                sending ||
                !onboarded ||
                recording ||
                transcribing ||
                attachments.length >= MAX_IMAGES_PER_MESSAGE
              }
              aria-label="Attach photo"
              className="shrink-0 w-9 h-9 rounded-full text-on-surface-variant hover:text-charcoal hover:bg-surface-container flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px]">image</span>
            </button>

            <button
              type="button"
              onClick={toggleRecording}
              disabled={sending || !onboarded || transcribing}
              aria-label={recording ? "Stop recording" : "Record voice memo"}
              className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                recording
                  ? "bg-soft-red text-cream animate-pulse"
                  : "text-on-surface-variant hover:text-charcoal hover:bg-surface-container"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {recording ? "stop" : "mic"}
              </span>
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending || !onboarded}
              rows={1}
              placeholder={
                onboarded
                  ? hasAnyAttachment
                    ? "Add a question about the photo…"
                    : "Message Sean…"
                  : "Onboarding required"
              }
              maxLength={2000}
              className="flex-1 bg-transparent border-0 focus:ring-0 outline-none py-2 px-2 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/50 resize-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label={anyUploadInFlight ? "Uploading…" : "Send message"}
              className="shrink-0 w-10 h-10 rounded-full bg-charcoal text-cream flex items-center justify-center transition-all active:scale-95 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px]">
                {sending || anyUploadInFlight ? "more_horiz" : "arrow_upward"}
              </span>
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

function MessageBubble({
  message,
  onChipTap,
}: {
  message: ChatMessage;
  /** Tap handler for the chip-reply buttons. Provided by parent so
   *  the bubble doesn't have to know about the action wiring. */
  onChipTap?: (chipValue: string, chipMessageId: string) => void;
}) {
  const isUser = message.role === "user";
  const isCoach = message.kind === "COACH" && !isUser;

  // Copy buttons removed per Sean — texting Sean doesn't ask for a
  // "copy text" affordance; it dilutes the conversation. The
  // CopyButton component itself stays in the file below for now in
  // case we want it on a different surface later.

  if (isUser) {
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] rounded-xl px-gutter py-3 bg-charcoal text-cream space-y-2">
          {message.imageUrls && message.imageUrls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {message.imageUrls.map((url, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={i}
                  src={url}
                  alt="Sent attachment"
                  width={160}
                  height={160}
                  loading="lazy"
                  decoding="async"
                  className="max-w-[160px] max-h-[160px] rounded-md object-cover bg-charcoal/40"
                />
              ))}
            </div>
          )}
          {message.content && message.content !== "(image)" && (
            <p className="font-body text-body-md whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          )}
        </div>
      </li>
    );
  }

  // Assistant — Sean (real or auto-reply, indistinguishable here).
  const isVoice = !!message.audioUrl;
  return (
    <li className="flex justify-start">
      <div
        className={`max-w-[85%] rounded-xl px-gutter py-3 shadow-elevation-1 ${
          isCoach
            ? "bg-secondary-container/60 border border-gold/50 text-charcoal"
            : "bg-surface-container-lowest border border-outline-variant/60 text-charcoal"
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isCoach ? "bg-gold" : "bg-sage"
            }`}
            aria-hidden
          />
          <span className="font-body text-label-sm tracking-widest uppercase text-on-surface-variant">
            {isCoach ? "Sean" : "Riven"}
          </span>
          {isVoice && (
            <span className="inline-flex items-center gap-1 font-body text-label-sm text-on-surface-variant/80">
              <span aria-hidden>·</span>
              voice memo
            </span>
          )}
        </div>
        {isVoice ? (
          <VoicePlayer
            url={message.audioUrl as string}
            durationSec={message.audioDurationSec ?? 0}
          />
        ) : (
          <p className="font-body text-body-md whitespace-pre-wrap leading-relaxed">
            {message.content}
          </p>
        )}
        {/* Chip-reply buttons. Render only when chipOptions is set
            AND she hasn't tapped yet (chipsRepliedAt null). Once
            tapped, the bubble keeps the text but the chips collapse. */}
        {message.chipOptions &&
          message.chipOptions.length > 0 &&
          !message.chipsRepliedAt &&
          onChipTap && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gold/20">
              {message.chipOptions.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => onChipTap(chip.value, message.id)}
                  className="inline-flex items-center px-4 py-1.5 rounded-full bg-cream border border-charcoal/40 font-body text-label-sm text-charcoal hover:border-charcoal hover:bg-surface-container active:scale-95 transition-all"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
      </div>
    </li>
  );
}

/**
 * Inline audio player for voice memos from Sean. Custom controls so
 * the bubble matches the brand instead of the chrome of native
 * <audio controls>. Tap play → audio plays through to the end. Tap
 * again to pause. Progress bar reflects playback position.
 */
function VoicePlayer({
  url,
  durationSec,
}: {
  url: string;
  durationSec: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  // Use the actual audio element's duration once it loads; fall back
  // to the server-recorded durationSec until then so the UI doesn't
  // show 0:00 on first paint.
  const [actualDuration, setActualDuration] = useState<number>(
    durationSec || 0,
  );

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setPosition(a.currentTime);
    const onMeta = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) {
        setActualDuration(a.duration);
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setPosition(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  async function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      try {
        await a.play();
        setPlaying(true);
      } catch {
        /* user-gesture issue or unsupported codec — fall back to native */
      }
    }
  }

  const pct = actualDuration > 0 ? (position / actualDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 min-w-[14rem]">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice memo" : "Play voice memo"}
        className="shrink-0 w-10 h-10 rounded-full bg-charcoal text-cream flex items-center justify-center active:scale-95 hover:opacity-90 transition-all"
      >
        <span className="material-symbols-outlined text-[20px] filled" aria-hidden>
          {playing ? "pause" : "play_arrow"}
        </span>
      </button>
      <div className="flex-1 min-w-0">
        <div
          className="h-1.5 rounded-full bg-charcoal/15 overflow-hidden"
          aria-hidden
        >
          <div
            className="h-full bg-charcoal transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="font-body text-label-sm text-on-surface-variant/80 tabular-nums mt-1.5">
          {formatDuration(Math.round((playing ? position : actualDuration) * 1000))}
        </p>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        className="hidden"
      />
    </div>
  );
}

// CopyButton was removed per Sean — texting Sean shouldn't have a
// "copy text" affordance. Component deleted; can be re-introduced
// from git history if we want it on a different surface later.

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-on-surface-variant animate-pulse"
      style={{ animationDelay: delay }}
    />
  );
}

function EmptyState({
  // onPrompt + disabled were used for the old AI suggested-prompts grid.
  // Unified thread doesn't need suggestions — Sean writes proactively
  // via the cron, and her first message is whatever's on her mind. Kept
  // the same props signature so the parent doesn't churn.
  exiting,
}: {
  onPrompt: (prompt: string) => void;
  disabled: boolean;
  exiting: boolean;
}) {
  const introOpacity = exiting ? "opacity-0" : "opacity-100";
  const introTransform = exiting ? "translate-y-3" : "translate-y-0";
  return (
    <div
      className={`flex-1 flex flex-col justify-center py-6 space-y-5 text-center ${
        exiting ? "pointer-events-none" : ""
      }`}
      aria-hidden={exiting}
    >
      <p
        className={`font-display text-headline-md text-charcoal max-w-md mx-auto transition-[opacity,transform] duration-[250ms] ease-out ${introOpacity} ${introTransform}`}
      >
        Say what&apos;s on your mind.
      </p>
      <p
        className={`font-body text-body-md text-on-surface-variant max-w-md mx-auto leading-relaxed transition-[opacity,transform] duration-[250ms] ease-out ${introOpacity} ${introTransform}`}
        style={{ transitionDelay: exiting ? "0ms" : "100ms" }}
      >
        Quick question, meal you&apos;re unsure about, a hard day —
        Sean reads everything. He answers in a few minutes most of
        the time. Tap the photo icon to share a meal pic.
      </p>
    </div>
  );
}
