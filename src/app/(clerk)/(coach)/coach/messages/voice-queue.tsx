"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendVoiceMoment, skipVoiceMoment } from "./voice-actions";
import type { QueuedVoiceMoment } from "@/lib/coach-messages";

/**
 * Voice queue + recorder modal for the coach messaging dashboard.
 *
 * Rendered as a small "Voice moments · N queued" chip in the header
 * that opens an overlay listing every queued trigger. Each row has
 * Record + Skip buttons; Record opens an inline 60-second recorder.
 *
 * Recording flow:
 *   1. Tap record → MediaRecorder fires, 60s countdown shows
 *   2. Tap stop (or auto-stop at 60s) → preview the audio
 *   3. Tap send → upload to R2 → sendVoiceMoment action runs →
 *      ChatMessage created, push fires, modal closes the row
 *   4. Tap re-record to discard + try again
 *
 * Browser support: MediaRecorder is fine in Safari iOS 14.5+, every
 * Chrome, every desktop browser. We pick the best supported mime type.
 */

const MAX_RECORD_MS = 60_000;

export function VoiceQueueChip({
  queue,
}: {
  queue: QueuedVoiceMoment[];
}) {
  const [open, setOpen] = useState(false);
  if (queue.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold/15 border border-gold/50 text-charcoal font-body text-label-sm hover:bg-gold/25 transition-colors"
        title="Record voice moments for your clients"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          mic
        </span>
        Voice moments · {queue.length} queued
      </button>
      {open && (
        <VoiceQueueModal queue={queue} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function VoiceQueueModal({
  queue,
  onClose,
}: {
  queue: QueuedVoiceMoment[];
  onClose: () => void;
}) {
  // The "currently being recorded" row id. Only one row in record
  // mode at a time so the mic doesn't get torn over by two recorders.
  const [recordingFor, setRecordingFor] = useState<string | null>(null);

  return (
    <div
      role="dialog"
      aria-label="Voice moments queue"
      className="fixed inset-0 z-50 bg-charcoal/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !recordingFor) onClose();
      }}
    >
      <div className="bg-cream rounded-2xl shadow-elevation-3 max-w-2xl w-full max-h-[80vh] flex flex-col">
        <header className="px-gutter py-4 border-b border-outline-variant/40 flex items-center justify-between">
          <div>
            <h2 className="font-display text-headline-md text-charcoal">
              Voice moments
            </h2>
            <p className="font-body text-label-sm text-on-surface-variant mt-0.5">
              60 seconds. Speak her name. Read her data. Lock it in.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!recordingFor}
            aria-label="Close"
            className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-on-surface-variant">
              close
            </span>
          </button>
        </header>

        <ul className="flex-1 overflow-y-auto divide-y divide-outline-variant/30">
          {queue.map((row) => (
            <VoiceQueueRow
              key={row.id}
              row={row}
              recording={recordingFor === row.id}
              recordingDisabled={!!recordingFor && recordingFor !== row.id}
              onRecordingStart={() => setRecordingFor(row.id)}
              onRecordingEnd={() => setRecordingFor(null)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function VoiceQueueRow({
  row,
  recording,
  recordingDisabled,
  onRecordingStart,
  onRecordingEnd,
}: {
  row: QueuedVoiceMoment;
  recording: boolean;
  recordingDisabled: boolean;
  onRecordingStart: () => void;
  onRecordingEnd: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [skipPending, setSkipPending] = useState(false);

  function handleSkip() {
    setSkipPending(true);
    startTransition(async () => {
      const r = await skipVoiceMoment({ voiceMomentId: row.id });
      if (!r.ok) setError(r.error);
      else router.refresh();
      setSkipPending(false);
    });
  }

  if (recording) {
    return (
      <li className="px-gutter py-4">
        <RowHeader row={row} />
        <Recorder
          voiceMomentId={row.id}
          recipientFirstName={row.firstName}
          onCancel={onRecordingEnd}
          onSent={() => {
            onRecordingEnd();
            router.refresh();
          }}
        />
      </li>
    );
  }

  return (
    <li className="px-gutter py-4 flex items-center justify-between gap-3">
      <RowHeader row={row} />
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleSkip}
          disabled={recordingDisabled || skipPending}
          className="font-body text-label-md text-on-surface-variant hover:text-charcoal transition-colors disabled:opacity-40 px-3 py-2"
        >
          {skipPending ? "Skipping…" : "Skip"}
        </button>
        <button
          type="button"
          onClick={onRecordingStart}
          disabled={recordingDisabled}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-charcoal text-cream font-body text-label-sm tracking-wide hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[16px]">mic</span>
          Record
        </button>
        {error && (
          <p className="font-body text-label-sm text-soft-red">{error}</p>
        )}
      </div>
    </li>
  );
}

function RowHeader({ row }: { row: QueuedVoiceMoment }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-full bg-secondary-container/60 border border-gold/30 flex items-center justify-center shrink-0">
        <span className="font-display text-headline-md text-charcoal leading-none">
          {row.firstName[0]?.toUpperCase() ?? "?"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-body text-body-md text-charcoal truncate">
          {row.firstName}
        </p>
        <p className="font-body text-label-sm text-on-surface-variant truncate">
          {row.triggerLabel} · {relativeTime(row.triggerWhen)}
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── */
/* Recorder                                                      */
/* ───────────────────────────────────────────────────────────── */

type RecorderPhase = "idle" | "recording" | "preview" | "uploading" | "sending";

function Recorder({
  voiceMomentId,
  recipientFirstName,
  onCancel,
  onSent,
}: {
  voiceMomentId: string;
  recipientFirstName: string;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      if (tickRef.current) clearInterval(tickRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Your browser doesn't support recording.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission denied.");
      return;
    }
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
    ];
    const supported = candidates.find((m) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    );
    const recorder = new MediaRecorder(
      stream,
      supported ? { mimeType: supported } : undefined,
    );
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      setRecordedBlob(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPhase("preview");
    };

    recorder.start();
    recorderRef.current = recorder;
    startRef.current = Date.now();
    setElapsedMs(0);
    setPhase("recording");
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_RECORD_MS) {
        // Auto-stop at the 60s cap.
        stopInternal();
      }
    }, 200);
  }

  function stopInternal() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBlob(null);
    setPhase("idle");
    setElapsedMs(0);
    setError(null);
  }

  async function send() {
    if (!recordedBlob) return;
    setError(null);
    setPhase("uploading");

    try {
      // Pick a sensible extension from the blob's mime type.
      const mime = recordedBlob.type || "audio/webm";
      const ext = mime.includes("mp4")
        ? "mp4"
        : mime.includes("mpeg")
          ? "mp3"
          : mime.includes("ogg")
            ? "ogg"
            : "webm";
      const fileName = `voice-${voiceMomentId}-${Date.now()}.${ext}`;

      const signResp = await fetch("/api/r2/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          contentType: mime,
          contentLength: recordedBlob.size,
          scope: "voice",
        }),
      });
      if (!signResp.ok) {
        const data = await signResp.json().catch(() => ({}));
        throw new Error(data.error ?? `Sign failed: ${signResp.status}`);
      }
      const { uploadUrl, publicUrl } = (await signResp.json()) as {
        uploadUrl: string;
        publicUrl: string;
      };

      const putResp = await fetch(uploadUrl, {
        method: "PUT",
        body: recordedBlob,
        headers: { "Content-Type": mime },
      });
      if (!putResp.ok) {
        throw new Error(`Upload failed: ${putResp.status}`);
      }

      setPhase("sending");
      const durationSec = Math.max(1, Math.round(elapsedMs / 1000));
      const result = await sendVoiceMoment({
        voiceMomentId,
        audioUrl: publicUrl,
        durationSec,
      });
      if (!result.ok) throw new Error(result.error);

      onSent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      setPhase("preview");
    }
  }

  const seconds = Math.floor(elapsedMs / 1000);
  const isBusy = phase === "uploading" || phase === "sending";

  return (
    <div className="mt-3 rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter space-y-3">
      {phase === "idle" && (
        <div className="flex items-center justify-between gap-3">
          <p className="font-body text-body-md text-on-surface-variant">
            Up to 60 seconds for {recipientFirstName}.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="font-body text-label-md text-on-surface-variant hover:text-charcoal px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-charcoal text-cream font-body text-label-sm tracking-wide hover:opacity-90 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">
                fiber_manual_record
              </span>
              Start recording
            </button>
          </div>
        </div>
      )}

      {phase === "recording" && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-soft-red animate-pulse"
              aria-hidden
            >
              fiber_manual_record
            </span>
            <p className="font-body text-body-md text-charcoal tabular-nums">
              Recording · {formatTime(elapsedMs)} / 1:00
            </p>
          </div>
          <button
            type="button"
            onClick={stopInternal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-charcoal text-cream font-body text-label-sm tracking-wide hover:opacity-90 active:scale-95"
          >
            <span className="material-symbols-outlined text-[16px]">stop</span>
            Stop
          </button>
        </div>
      )}

      {(phase === "preview" || phase === "uploading" || phase === "sending") && (
        <div className="space-y-3">
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Preview · {seconds}s
          </p>
          {previewUrl && (
            <audio
              src={previewUrl}
              controls
              className="w-full"
              preload="auto"
            />
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={isBusy}
              className="font-body text-label-md text-on-surface-variant hover:text-charcoal px-3 py-2 disabled:opacity-40"
            >
              Re-record
            </button>
            <button
              type="button"
              onClick={send}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-charcoal text-cream font-body text-label-sm tracking-wide hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[16px]">
                send
              </span>
              {phase === "uploading"
                ? "Uploading…"
                : phase === "sending"
                  ? "Sending…"
                  : `Send to ${recipientFirstName}`}
            </button>
          </div>
          {error && (
            <p className="font-body text-label-sm text-soft-red">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(d: Date): string {
  const minutes = Math.round((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
