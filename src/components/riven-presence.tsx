"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { RivenOrb, type OrbState } from "@/components/riven-orb";
import { askRivenAction } from "@/app/(clerk)/(app)/dashboard/ask-riven-actions";
import type { AskTurn } from "@/lib/riven-ask";

/**
 * RIVEN presence — the Jarvis surface at the top of home. The living orb,
 * the morning brief in RIVEN's "already handled" voice, a speak button (only
 * when voice is configured), and "Talk to RIVEN" → a chat sheet with text +
 * a mic. Text answers are free and always on; voice is gated to the brief +
 * the mic so the spend stays where it lands.
 */
export function RivenPresence({
  brief,
  firstName,
}: {
  brief: string;
  firstName: string;
}) {
  const [open, setOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [orb, setOrb] = useState<OrbState>("rest");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Is RIVEN's voice live? (ELEVENLABS keys set on the server.)
  useEffect(() => {
    let alive = true;
    fetch("/api/voice/speak")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setVoiceEnabled(!!d.enabled);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Speak a line out loud. Sets the orb to "speaking" while audio plays.
  async function speak(text: string) {
    if (!voiceEnabled) return;
    try {
      const r = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) return;
      const blob = await r.blob();
      audioRef.current?.pause();
      const a = new Audio(URL.createObjectURL(blob));
      audioRef.current = a;
      setOrb("speaking");
      a.onended = () => setOrb("rest");
      a.onerror = () => setOrb("rest");
      await a.play();
    } catch {
      setOrb("rest");
    }
  }

  return (
    <section
      aria-label="RIVEN"
      className="rounded-2xl bg-charcoal px-gutter py-5"
    >
      <div className="flex items-start gap-3">
        <RivenOrb state={orb} size="md" />
        <div className="flex-1">
          <p className="font-body text-[10px] tracking-widest uppercase text-gold mb-1">
            RIVEN
          </p>
          <p className="font-display text-headline-sm text-cream leading-snug">
            {brief}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gold text-charcoal py-3 font-body text-label-md tracking-widest uppercase active:scale-95 transition-transform"
        >
          <span className="material-symbols-outlined text-[18px]">mic</span>
          Talk to RIVEN
        </button>
        {voiceEnabled && (
          <button
            type="button"
            onClick={() => speak(brief)}
            aria-label="Hear it"
            className="rounded-full border border-cream/30 text-cream p-3 active:scale-95 transition-transform"
          >
            <span className="material-symbols-outlined text-[18px]">volume_up</span>
          </button>
        )}
      </div>

      {open && (
        <AskSheet
          firstName={firstName}
          voiceEnabled={voiceEnabled}
          onSpeak={speak}
          onOrb={setOrb}
          onClose={() => {
            setOrb("rest");
            audioRef.current?.pause();
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}

/* ── The talk-to-RIVEN sheet: text + mic, RIVEN answers (and can speak) ── */
function AskSheet({
  firstName,
  voiceEnabled,
  onSpeak,
  onOrb,
  onClose,
}: {
  firstName: string;
  voiceEnabled: boolean;
  onSpeak: (t: string) => void;
  onOrb: (s: OrbState) => void;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setError(null);
    const history = turns;
    setTurns((t) => [...t, { role: "user", content: q }]);
    setText("");
    startTransition(async () => {
      const r = await askRivenAction({ question: q, history });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTurns((t) => [...t, { role: "assistant", content: r.answer }]);
      onSpeak(r.answer); // speaks only if voice is enabled
    });
  }

  async function toggleMic() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        onOrb("rest");
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.set("audio", blob);
        try {
          const resp = await fetch("/api/chat/transcribe", { method: "POST", body: fd });
          const data = await resp.json();
          if (!resp.ok) {
            setError(data.error ?? "Didn't catch that.");
            return;
          }
          if (data.text?.trim()) send(data.text.trim());
        } catch {
          setError("Couldn't hear that — try again.");
        }
      };
      rec.start();
      setRecording(true);
      onOrb("listening");
      rec.onstart = () => {};
      // flip recording flag off when it actually stops
      rec.addEventListener("stop", () => setRecording(false), { once: true });
    } catch {
      setError("Mic access is off. Turn it on in settings to talk to RIVEN.");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-cream">
      <header className="flex items-center justify-between px-container-mobile py-4 border-b border-outline-variant/40">
        <div className="flex items-center gap-2.5">
          <RivenOrb state={recording ? "listening" : pending ? "speaking" : "rest"} size="sm" />
          <p className="font-display text-headline-sm text-charcoal">RIVEN</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="material-symbols-outlined text-charcoal/70"
        >
          close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-container-mobile py-5 space-y-4">
        {turns.length === 0 && (
          <p className="font-body text-body-md text-on-surface-variant text-center py-8">
            Ask me anything, {firstName} — what to eat, how you&apos;re tracking, why
            the scale moved. I&apos;ve got your numbers.
          </p>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="bg-charcoal text-cream rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] font-body text-body-md">
                {t.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2.5">
              <RivenOrb state="rest" size="sm" />
              <div className="bg-white/70 border border-outline-variant/50 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%] font-body text-body-md text-charcoal">
                {t.content}
                {voiceEnabled && (
                  <button
                    type="button"
                    onClick={() => onSpeak(t.content)}
                    aria-label="Hear it"
                    className="ml-2 align-middle material-symbols-outlined text-[16px] text-gold"
                  >
                    volume_up
                  </button>
                )}
              </div>
            </div>
          ),
        )}
        {pending && (
          <div className="flex items-center gap-2.5">
            <RivenOrb state="speaking" size="sm" />
            <span className="font-body text-label-sm text-on-surface-variant">thinking…</span>
          </div>
        )}
        {error && <p className="font-body text-label-sm text-soft-red">{error}</p>}
      </div>

      <div
        className="border-t border-outline-variant/40 px-container-mobile pt-3 flex items-center gap-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <button
          type="button"
          onClick={toggleMic}
          aria-label={recording ? "Stop" : "Talk"}
          className={`rounded-full p-3 active:scale-95 transition-all ${
            recording ? "bg-soft-red text-cream riven-pulse-soft" : "bg-charcoal text-cream"
          }`}
        >
          <span className="material-symbols-outlined text-[20px] filled">
            {recording ? "stop" : "mic"}
          </span>
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(text)}
          placeholder="Ask RIVEN…"
          className="flex-1 rounded-full border border-outline-variant/60 bg-surface-container-lowest px-4 py-2.5 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none"
        />
        <button
          type="button"
          disabled={!text.trim() || pending}
          onClick={() => send(text)}
          aria-label="Send"
          className="rounded-full bg-gold text-charcoal p-3 disabled:opacity-40 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
        </button>
      </div>
    </div>
  );
}
