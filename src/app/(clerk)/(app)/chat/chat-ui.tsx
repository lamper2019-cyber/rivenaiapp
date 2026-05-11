"use client";

import { useEffect, useRef, useState } from "react";
import { SUGGESTED_PROMPTS } from "@/lib/chat-prompt";

const MAX_IMAGES_PER_MESSAGE = 4;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  kind: "AI" | "COACH";
  content: string;
  imageUrls?: string[];
  senderName?: string;
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
}: {
  initialMessages: ChatMessage[];
  onboarded: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function send(text: string) {
    const trimmed = text.trim();
    const uploadedImages = attachments
      .filter((a) => a.status === "uploaded" && a.publicUrl)
      .map((a) => a.publicUrl!);

    if (!trimmed && uploadedImages.length === 0) return;
    if (streaming) return;

    // First message in this thread — animate the suggested prompts out
    // before the user's message lands. Keeps EmptyState mounted through
    // the animation by reading `emptyExiting`, see render below.
    if (messages.length === 0 && !emptyExiting) {
      setEmptyExiting(true);
      await new Promise((r) => setTimeout(r, EMPTY_EXIT_MS));
    }

    setError(null);
    setInput("");

    const userMsg: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      kind: "AI",
      content: trimmed,
      imageUrls: uploadedImages,
    };
    const placeholder: ChatMessage = {
      id: `local-assistant-${Date.now()}`,
      role: "assistant",
      kind: "AI",
      content: "",
    };
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setAttachments([]);
    setStreaming(true);
    // Cards have already finished their exit animation by this point —
    // unmount EmptyState so the messages list takes over.
    setEmptyExiting(false);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed || "(image)",
          imageUrls: uploadedImages,
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...placeholder, content: assistantText };
          return next;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
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
    !streaming &&
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
              Complete onboarding before chatting with RIVEN. Head back to{" "}
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
            disabled={streaming}
            exiting={emptyExiting}
          />
        ) : (
          <ul className="space-y-6 py-4">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                streaming={
                  streaming &&
                  m.id === messages[messages.length - 1]?.id &&
                  m.role === "assistant"
                }
              />
            ))}
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
                streaming ||
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
              disabled={streaming || !onboarded || transcribing}
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
              disabled={streaming || !onboarded}
              rows={1}
              placeholder={
                onboarded
                  ? hasAnyAttachment
                    ? "Add a question about the photo…"
                    : "Message RIVEN…"
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
                {streaming || anyUploadInFlight ? "more_horiz" : "arrow_upward"}
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
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  const isUser = message.role === "user";
  const isCoach = message.kind === "COACH" && !isUser;

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

  // Assistant (AI or COACH)
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
        </div>
        <p className="font-body text-body-md whitespace-pre-wrap leading-relaxed">
          {message.content}
          {streaming && message.content.length === 0 && (
            <span className="inline-flex gap-1">
              <Dot delay="0ms" />
              <Dot delay="150ms" />
              <Dot delay="300ms" />
            </span>
          )}
          {streaming && message.content.length > 0 && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-charcoal/60 align-middle animate-pulse" />
          )}
        </p>
      </div>
    </li>
  );
}

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
  onPrompt,
  disabled,
  exiting,
}: {
  onPrompt: (prompt: string) => void;
  disabled: boolean;
  exiting: boolean;
}) {
  // Single clean exit per element: opacity + small downward drift, staggered
  // across the cards so they leave one after another like a falling pulldown.
  // Each item runs ~250ms; stagger = 60ms; transitions never overlap with
  // remount because the parent keeps EmptyState alive for the full duration.
  const introOpacity = exiting ? "opacity-0" : "opacity-100";
  const introTransform = exiting ? "translate-y-3" : "translate-y-0";
  return (
    <div
      className={`flex-1 flex flex-col justify-center py-6 space-y-5 ${
        exiting ? "pointer-events-none" : ""
      }`}
      aria-hidden={exiting}
    >
      <p
        className={`font-body text-body-md text-on-surface-variant text-center max-w-md mx-auto transition-[opacity,transform] duration-[250ms] ease-out ${introOpacity} ${introTransform}`}
      >
        Ask anything about your wellness journey, meal plans, or progress
        tracking. Tap the photo icon to send a meal pic.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {SUGGESTED_PROMPTS.map((prompt, idx) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled || exiting}
            onClick={() => onPrompt(prompt)}
            style={{
              transitionDelay: exiting ? `${60 + idx * 60}ms` : "0ms",
            }}
            className={`text-left rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-3 font-body text-body-md text-charcoal hover:border-gold hover:bg-cream disabled:opacity-60 shadow-elevation-1 transition-[opacity,transform,colors] duration-[250ms] ease-out ${introOpacity} ${introTransform}`}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
