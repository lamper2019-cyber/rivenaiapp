"use client";

import { useEffect, useRef, useState } from "react";
import { weighInAction } from "@/app/(clerk)/(app)/dashboard/weigh-in-actions";
import {
  lockDaySlotAction,
  swapDaySlotAction,
  ateDaySlotAction,
} from "@/app/(clerk)/(app)/dashboard/day-plan-actions";

type Hero = {
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  calories: number;
  protein: number;
  locked: boolean;
  eaten: boolean;
};

const SLOT_WORD: Record<Hero["slot"], string> = {
  breakfast: "this morning",
  lunch: "for lunch",
  dinner: "tonight",
  snack: "for your snack",
};

/** "Tonight I set you air-fryer wings — 612 cal, 48g. Want it?" */
function offerLine(h: Hero): string {
  return `${cap(SLOT_WORD[h.slot])} I set you ${h.name.toLowerCase()} — ${h.calories} cal, ${h.protein}g protein. Want it?`;
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The orb home — RIVEN as a presence you talk to (Jarvis), per
 * docs/design/riven-orb-mockup.html + riven-orb-conversations.html.
 *
 * Idle  → the hero orb + one reply line + chips (mockup.html feel).
 * Active → a chat thread, orb shrinks to the header (conversations.html).
 * Open   → if she hasn't weighed today, RIVEN asks for the number first
 *          (tap the slider or just type/say it) before anything else.
 *
 * The brain is the existing /api/chat/stream — it logs meals (log_meal tool)
 * and answers from her live data — so talking to the orb logs food and
 * updates the macro ring for real. Weigh-in goes through weighInAction
 * (logs + reframe). Voice (mic) reuses /api/chat/transcribe.
 */

type Turn = { role: "you" | "riven"; text: string };
type Today = {
  protein: number;
  proteinFloor: number;
  calLeft: number;
  weighedToday: boolean;
  prefillWeight: number;
  goalWeight: number;
  firstName: string;
  hero: Hero | null;
};

const CIRC = 157; // 2πr, r=25

export function RivenHome({ initialFirstName }: { initialFirstName: string }) {
  const [today, setToday] = useState<Today | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [reply, setReply] = useState("One sec…");
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [weighOpen, setWeighOpen] = useState(false);
  const [planOffer, setPlanOffer] = useState(false);
  const [weight, setWeight] = useState(180);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const active = turns.length > 0;

  async function refreshToday() {
    try {
      const r = await fetch("/api/me/today");
      if (!r.ok) return null;
      const d: Today = await r.json();
      setToday(d);
      return d;
    } catch {
      return null;
    }
  }

  // On open: pull today, then set the opening line — weigh-in if she hasn't.
  useEffect(() => {
    refreshToday().then((d) => {
      if (!d) {
        setReply(`Morning, ${initialFirstName}. Tell me what you ate and I'll handle the rest.`);
        return;
      }
      setWeight(Math.round(d.prefillWeight));
      if (!d.weighedToday) {
        setReply(`Morning, ${d.firstName}. Step on the scale — one number, same time, before you eat.`);
        setWeighOpen(true);
      } else if (d.hero && !d.hero.eaten) {
        setReply(offerLine(d.hero));
        setPlanOffer(true);
      } else {
        setReply(`You're logged in for today, ${d.firstName}. What'd you eat? Just tell me.`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, streaming]);

  // Submit a weigh-in → logs it + RIVEN reframes.
  async function submitWeigh() {
    setError(null);
    setWeighOpen(false);
    setThinking(true);
    setTurns((t) => [...t, { role: "you", text: `${weight}` }]);
    const r = await weighInAction({ weight });
    setThinking(false);
    if (!r.ok) {
      setError(r.error);
      setWeighOpen(true);
      return;
    }
    setTurns((t) => [...t, { role: "riven", text: r.reply }]);
    setReply(r.reply);
    const d = await refreshToday();
    // The day opened — now offer tonight's pick, conversationally.
    if (d?.hero && !d.hero.eaten) {
      setPlanOffer(true);
      setTurns((t) => [...t, { role: "riven", text: offerLine(d.hero!) }]);
    }
  }

  // RIVEN's pick, accepted/changed by tapping or talking — the day-plan
  // engine spoken through the conversation instead of shown as a card.
  async function planAction(kind: "lock" | "swap" | "ate") {
    const h = today?.hero;
    if (!h || thinking) return;
    const label = kind === "lock" ? "Lock it in" : kind === "swap" ? "Swap it" : "I ate it";
    setTurns((t) => [...t, { role: "you", text: label }]);
    setThinking(true);
    try {
      if (kind === "swap") {
        await swapDaySlotAction({ slot: h.slot });
        const d = await refreshToday();
        const reply = d?.hero
          ? `Swapped — try ${d.hero.name.toLowerCase()} instead. ${d.hero.calories} cal, ${d.hero.protein}g.`
          : "Swapped.";
        setTurns((t) => [...t, { role: "riven", text: reply }]);
        setReply(reply);
      } else if (kind === "lock") {
        await lockDaySlotAction({ slot: h.slot });
        await refreshToday();
        const reply = "Locked in. Make it, log it — tap “I ate it” when you do.";
        setTurns((t) => [...t, { role: "riven", text: reply }]);
        setReply(reply);
      } else {
        await ateDaySlotAction({ slot: h.slot });
        await refreshToday();
        const reply = "Logged — that's tonight handled. Steady wins.";
        setTurns((t) => [...t, { role: "riven", text: reply }]);
        setReply(reply);
        setPlanOffer(false);
      }
    } catch {
      setError("Couldn't do that — try again.");
    } finally {
      setThinking(false);
    }
  }

  // Send a message to RIVEN (logs meals / answers) via the streaming brain.
  async function send(message: string) {
    const msg = message.trim();
    if (!msg || thinking) return;
    setError(null);
    setInput("");
    setTurns((t) => [...t, { role: "you", text: msg }]);
    setThinking(true);
    setStreaming("");
    try {
      const resp = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!resp.ok || !resp.body) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error ?? "RIVEN's tied up — try again.");
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setThinking(false);
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreaming(acc);
      }
      setStreaming(null);
      setTurns((t) => [...t, { role: "riven", text: acc.trim() || "…" }]);
      setReply(acc.trim());
      refreshToday(); // a logged meal moves the ring
    } catch (e) {
      setThinking(false);
      setStreaming(null);
      setError(e instanceof Error ? e.message : "Something went sideways.");
    }
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
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.set("audio", blob);
        try {
          const r = await fetch("/api/chat/transcribe", { method: "POST", body: fd });
          const d = await r.json();
          if (!r.ok) return setError(d.error ?? "Didn't catch that.");
          if (d.text?.trim()) send(d.text.trim());
        } catch {
          setError("Couldn't hear that — try again.");
        }
      };
      rec.start();
      setRecording(true);
    } catch {
      setError("Mic access is off. Turn it on in settings to talk to RIVEN.");
    }
  }

  const pct = today ? Math.min(today.protein / Math.max(today.proteinFloor, 1), 1) : 0;

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 140px)" }}>
      {/* header */}
      <div className="flex items-center justify-between">
        <span className="font-display tracking-[0.28em] text-cream text-label-md">RIVEN</span>
        <span className="font-body text-label-sm tracking-widest uppercase text-cream/45">Today</span>
      </div>

      {/* macro widget */}
      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-cream/10 bg-cream/[0.04] px-4 py-3">
        <div className="relative h-[58px] w-[58px] shrink-0">
          <svg width="58" height="58" className="-rotate-90">
            <circle cx="29" cy="29" r="25" fill="none" stroke="rgba(250,247,242,0.10)" strokeWidth="5" />
            <circle
              cx="29" cy="29" r="25" fill="none" stroke="#C9A961" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC - CIRC * pct}
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-cream text-label-md leading-none">{today?.protein ?? 0}</span>
            <span className="text-[8px] tracking-widest uppercase text-cream/45 mt-0.5">g prot</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="font-body text-label-sm text-cream/45">Protein</span>
            <span className="font-display text-cream text-body-md">
              <span className="text-gold">{today?.protein ?? 0}</span> / {today?.proteinFloor ?? 0}g
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-body text-label-sm text-cream/45">Calories left</span>
            <span className="font-display text-cream text-body-md">{(today?.calLeft ?? 0).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* stage — hero orb when idle, thread when talking */}
      {!active ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-7 py-8">
          <HeroOrb thinking={thinking} />
          <p className="font-display text-cream text-headline-sm text-center leading-snug max-w-[300px] px-2">
            {streaming ?? reply}
          </p>
        </div>
      ) : (
        <div ref={threadRef} className="flex-1 overflow-y-auto py-5 space-y-3.5">
          {turns.map((t, i) =>
            t.role === "you" ? (
              <div key={i} className="flex justify-end">
                <div className="bg-cream/[0.08] border border-cream/10 text-cream rounded-2xl rounded-br-[5px] px-3.5 py-2.5 max-w-[86%] font-body text-body-md">
                  {t.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2 max-w-[86%]">
                <MiniOrb />
                <div className="rounded-2xl rounded-bl-[5px] px-3.5 py-2.5 font-display text-cream text-body-md leading-relaxed bg-gold/[0.12] border border-gold/20">
                  {t.text}
                </div>
              </div>
            ),
          )}
          {streaming !== null && (
            <div className="flex items-start gap-2 max-w-[86%]">
              <MiniOrb />
              <div className="rounded-2xl rounded-bl-[5px] px-3.5 py-2.5 font-display text-cream text-body-md leading-relaxed bg-gold/[0.12] border border-gold/20">
                {streaming || "…"}
              </div>
            </div>
          )}
          {thinking && streaming === null && (
            <div className="flex items-center gap-2">
              <MiniOrb />
              <span className="font-body text-label-sm text-cream/45">thinking…</span>
            </div>
          )}
        </div>
      )}

      {/* weigh-in control — appears when RIVEN's asking for the number */}
      {weighOpen && (
        <div className="rounded-2xl border border-gold/30 bg-cream/[0.04] px-4 py-4 mb-3">
          <p className="font-display text-cream text-display-sm text-center">
            {weight}
            <span className="font-body text-cream/45 text-body-md ml-1">lb</span>
          </p>
          <input
            type="range"
            min={Math.max(70, (today?.prefillWeight ?? 180) - 30)}
            max={Math.min(700, (today?.prefillWeight ?? 180) + 30)}
            step={0.1}
            value={weight}
            onChange={(e) => setWeight(parseFloat(e.target.value))}
            className="riven-slider w-full mt-3"
            aria-label="Today's weight"
          />
          <button
            type="button"
            onClick={submitWeigh}
            className="mt-3 w-full bg-gold text-charcoal py-3 rounded-full font-body text-label-md tracking-widest uppercase active:scale-95 transition-transform"
          >
            Lock it in
          </button>
          <p className="text-center font-body text-label-sm text-cream/40 mt-2">
            …or just type the number below.
          </p>
        </div>
      )}

      {/* chips — only before she's started talking */}
      {!active && !weighOpen && (
        <div className="flex flex-wrap gap-2 justify-center mb-3">
          {["How's my protein?", "What should I eat tonight?", "I'm eating out — help"].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => send(c)}
              className="font-body text-label-sm text-cream bg-cream/[0.06] border border-cream/10 px-3 py-2 rounded-full active:scale-95 transition-transform"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* plan offer — accept/change tonight's pick by tapping (or just talk) */}
      {planOffer && today?.hero && !today.hero.eaten && !thinking && (
        <div className="flex flex-wrap gap-2 justify-center mb-3">
          {!today.hero.locked && (
            <button
              type="button"
              onClick={() => planAction("lock")}
              className="font-body text-label-sm text-charcoal bg-gold px-4 py-2 rounded-full active:scale-95 transition-transform"
            >
              Lock it in
            </button>
          )}
          {!today.hero.locked && (
            <button
              type="button"
              onClick={() => planAction("swap")}
              className="font-body text-label-sm text-cream border border-cream/25 px-4 py-2 rounded-full active:scale-95 transition-transform"
            >
              Swap
            </button>
          )}
          <button
            type="button"
            onClick={() => planAction("ate")}
            className="font-body text-label-sm text-cream border border-gold/50 px-4 py-2 rounded-full active:scale-95 transition-transform"
          >
            I ate it
          </button>
        </div>
      )}

      {error && <p className="font-body text-label-sm text-soft-red text-center mb-2">{error}</p>}

      {/* talk bar */}
      <div className="flex items-center gap-2 rounded-full border border-cream/10 bg-cream/[0.06] py-1.5 pl-4 pr-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              const n = parseFloat(input.trim());
              if (weighOpen && !isNaN(n) && n >= 70 && n <= 700) {
                setWeight(n);
                submitWeigh();
              } else {
                send(input);
              }
            }
          }}
          placeholder="Talk to RIVEN…"
          className="flex-1 bg-transparent border-none outline-none text-cream font-body text-body-md placeholder:text-cream/40"
        />
        <button
          type="button"
          onClick={toggleMic}
          aria-label={recording ? "Stop" : "Talk"}
          className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform ${
            recording ? "bg-soft-red riven-pulse-soft" : "bg-gradient-to-br from-[#E3C988] to-gold"
          }`}
        >
          <span className="material-symbols-outlined text-[18px] text-charcoal filled">
            {recording ? "stop" : "mic"}
          </span>
        </button>
      </div>
    </div>
  );
}

/* The big breathing hero orb (idle). */
function HeroOrb({ thinking }: { thinking: boolean }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 188, height: 188 }}>
      <div
        className="absolute rounded-full riven-orb-breath"
        style={{
          width: 188,
          height: 188,
          background:
            "radial-gradient(circle, rgba(201,169,97,0.32) 0%, rgba(201,169,97,0.09) 45%, transparent 70%)",
          filter: "blur(8px)",
          animationDuration: thinking ? "1.6s" : undefined,
        }}
      />
      <div
        className="riven-orb-breath rounded-full"
        style={{
          width: 124,
          height: 124,
          background:
            "radial-gradient(circle at 36% 32%, #fff5df 0%, #E3C988 22%, #C9A961 52%, #9c7e3f 78%, #6f5829 100%)",
          boxShadow:
            "0 0 40px rgba(201,169,97,0.5), inset -8px -10px 26px rgba(80,60,20,0.6), inset 8px 8px 20px rgba(255,245,220,0.5)",
          transform: thinking ? "scale(1.06)" : undefined,
          animationDuration: thinking ? "1.6s" : undefined,
        }}
      />
    </div>
  );
}

function MiniOrb() {
  return (
    <span
      aria-hidden
      className="shrink-0 mt-1 rounded-full"
      style={{
        width: 22,
        height: 22,
        background: "radial-gradient(circle at 36% 32%, #fff5df, #C9A961 70%)",
        boxShadow: "0 0 10px rgba(201,169,97,0.4)",
      }}
    />
  );
}
