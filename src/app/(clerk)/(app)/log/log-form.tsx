"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { logMeal, undoLastMeal, type LogMealResult } from "./actions";

type MealItem = {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

type MealRow = {
  id: string;
  description: string;
  shortName: string | null;
  calories: number;
  protein: number;
  processedFlag: boolean;
  createdAt: Date;
  items: MealItem[];
};

type FrequentItem = {
  name: string;
  count: number;
  avgCalories: number;
};

type Totals = {
  cutCalories: number;
  proteinFloor: number;
  caloriesToday: number;
  proteinToday: number;
} | null;

export function LogForm({
  todayMeals,
  earlierMeals,
  frequentMeals,
  initialTotals,
}: {
  todayMeals: MealRow[];
  earlierMeals: MealRow[];
  frequentMeals: FrequentItem[];
  initialTotals: Totals;
}) {
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<LogMealResult | null>(null);
  const [totals, setTotals] = useState<Totals>(initialTotals);
  const [pending, startTransition] = useTransition();
  const [undoPending, startUndo] = useTransition();
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  // Voice recording state — mirrors the pattern in chat-ui.tsx so behavior
  // is consistent across the app. Recording is tap-to-toggle (not push-to-
  // hold) for accessibility.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number>(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mic stream kept alive across recordings within one page session — saves
  // her from a second permission prompt on each subsequent tap. iOS still
  // re-prompts cross-session (when the PWA is fully closed and reopened);
  // that's an Apple limitation we can't override. Released on unmount so we
  // don't leave the mic indicator on after she leaves /log.
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state === "recording") recorder.stop();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      // Release the persistent mic stream so the mic indicator goes off.
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || pending) return;

    const fd = new FormData();
    fd.set("description", description);
    setUndoMessage(null);

    startTransition(async () => {
      const res = await logMeal(fd);
      setResult(res);
      if (res.ok) {
        setDescription("");
        if (totals) {
          setTotals({
            ...totals,
            caloriesToday: totals.caloriesToday + res.analysis.calories,
            proteinToday: totals.proteinToday + res.analysis.protein,
          });
        }
      }
    });
  }

  function handleUndo() {
    if (undoPending || pending) return;
    setUndoMessage(null);
    startUndo(async () => {
      const res = await undoLastMeal();
      if (res.ok) {
        // Wipe the result card and roll the totals back to what the server returned.
        setResult(null);
        setUndoMessage(
          `Undid: ${res.undone.description.slice(0, 60)}${res.undone.description.length > 60 ? "…" : ""}`
        );
        if (totals) {
          setTotals({
            ...totals,
            caloriesToday: res.totals.calories,
            proteinToday: res.totals.protein,
          });
        }
      } else {
        setUndoMessage(res.error);
      }
    });
  }

  async function startRecording() {
    setVoiceError(null);
    if (recording || transcribing || pending) return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError("This browser doesn't support voice. Type the meal instead.");
      return;
    }

    // Reuse the existing mic stream if one is alive — saves a permission
    // prompt for every recording after the first within this page session.
    // If the stream's tracks ended (e.g. iOS revoked them after a long
    // background period) we fall back to requesting a fresh one.
    let stream: MediaStream;
    const existing = streamRef.current;
    if (existing && existing.getTracks().some((t) => t.readyState === "live")) {
      stream = existing;
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch {
        setVoiceError("Microphone access denied. Allow it in your browser settings.");
        return;
      }
    }

    // Chrome → webm/opus, Safari → mp4/m4a — pick the best the browser supports.
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
    const supported = candidates.find(
      (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    );
    const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);

    recordedChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      // Intentionally do NOT stop the stream tracks here — keeping them alive
      // lets the next tap of the mic skip the permission prompt. Unmount
      // (see useEffect above) releases them.
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
        const resp = await fetch("/api/chat/transcribe", { method: "POST", body: fd });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data.error ?? `Transcribe failed: ${resp.status}`);
        }
        const data = (await resp.json()) as { text: string };
        // Drop the transcript into the textarea; she taps Log to confirm.
        // Auto-submit is tempting but burns an API call on every misheard
        // word — preview-then-submit is safer.
        setDescription((prev) => (prev.trim() ? `${prev} ${data.text}` : data.text));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Transcription failed.";
        setVoiceError(msg);
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
    if (recorder && recorder.state === "recording") recorder.stop();
  }

  const seconds = Math.floor(recordingMs / 1000);
  const recordingLabel = `${String(Math.floor(seconds / 60)).padStart(1, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-section-gap">
      {totals && (
        <div className="grid grid-cols-2 gap-gutter">
          <TotalCard
            label="Calories today"
            value={totals.caloriesToday}
            target={totals.cutCalories}
            unit=""
          />
          <TotalCard
            label="Protein today"
            value={totals.proteinToday}
            target={totals.proteinFloor}
            unit="g"
          />
        </div>
      )}

      {/* Voice hero — primary input path. Big tap target, prominent visual. */}
      <section
        className="rounded-md bg-gradient-to-br from-secondary-container/40 via-cream to-tertiary-container/20 border border-gold/40 shadow-elevation-1 px-gutter py-6"
        aria-label="Voice meal logger"
      >
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant text-center">
          {recording ? "Listening…" : transcribing ? "Reading the plate…" : "What did you eat?"}
        </p>

        <div className="mt-4 flex flex-col items-center gap-3">
          {!recording && !transcribing && (
            <button
              type="button"
              onClick={startRecording}
              aria-label="Tap to record a voice memo"
              className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-charcoal text-cream shadow-elevation-2 active:scale-95 hover:opacity-90 transition-all"
            >
              <span className="absolute inset-0 rounded-full bg-gold/30 riven-glow" aria-hidden />
              <span className="material-symbols-outlined relative text-cream text-[42px] filled">
                mic
              </span>
            </button>
          )}

          {recording && (
            <button
              type="button"
              onClick={stopRecording}
              aria-label="Stop recording"
              className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-soft-red text-cream shadow-elevation-2 active:scale-95 riven-pulse-strong"
            >
              <span className="material-symbols-outlined text-cream text-[42px] filled">
                stop
              </span>
            </button>
          )}

          {transcribing && (
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-charcoal/80 text-cream shadow-elevation-2">
              <span className="material-symbols-outlined text-cream text-[32px] animate-spin">
                progress_activity
              </span>
            </div>
          )}

          <p className="font-body text-body-md text-on-surface-variant">
            {recording
              ? `Recording ${recordingLabel} — tap to stop`
              : transcribing
                ? "Transcribing your voice memo…"
                : "Tap the mic and describe your meal"}
          </p>

          {voiceError && (
            <p className="font-body text-label-sm text-soft-red mt-1">{voiceError}</p>
          )}
        </div>
      </section>

      {/* Text fallback — still here, demoted under the mic. */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <details className="group" open={description.length > 0}>
          <summary className="cursor-pointer list-none inline-flex items-center gap-2 font-body text-label-md tracking-widest uppercase text-on-surface-variant hover:text-charcoal transition-colors">
            <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90">
              chevron_right
            </span>
            Or type it instead
          </summary>
          <div className="mt-3 space-y-2">
            <textarea
              name="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={pending}
              rows={3}
              maxLength={500}
              placeholder="Two scrambled eggs, half an avocado, and a slice of sourdough toast"
              className="w-full bg-surface-container-lowest rounded-md border border-outline-variant focus:border-gold focus:ring-0 outline-none p-4 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/50 transition-colors resize-none disabled:opacity-60"
            />
            <div className="flex justify-between text-label-sm text-on-surface-variant/70">
              <span>RIVEN estimates the macros and gives a quick read.</span>
              <span>{description.length} / 500</span>
            </div>
          </div>
        </details>

        <button
          type="submit"
          disabled={pending || !description.trim()}
          className="block w-full text-center bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 hover:opacity-90 shadow-elevation-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? "Reading the plate…" : "Log it"}
        </button>
      </form>

      {result && !result.ok && (
        <div className="rounded-md border border-soft-red/40 bg-soft-red/10 px-gutter py-3">
          <p className="font-body text-body-md text-soft-red">{result.error}</p>
        </div>
      )}

      {result && result.ok && (
        <ResultCard
          analysis={result.analysis}
          onUndo={handleUndo}
          undoPending={undoPending}
        />
      )}

      {undoMessage && (
        <div className="rounded-md border border-outline-variant/60 bg-surface-container-lowest px-gutter py-3">
          <p className="font-body text-body-md text-on-surface-variant">{undoMessage}</p>
        </div>
      )}

      {frequentMeals.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Frequent
          </h2>
          <p className="font-body text-label-sm text-on-surface-variant/70">
            Per-food count over the last 30 days. Tap to log just that item.
          </p>
          <div className="flex flex-wrap gap-2">
            {frequentMeals.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setDescription(item.name)}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 font-body text-body-md text-charcoal hover:border-gold hover:bg-cream transition-colors disabled:opacity-60"
                title={`${item.name} — logged ${item.count}× in last 30 days · avg ${item.avgCalories} cal`}
              >
                <span className="truncate max-w-[16rem]">{item.name}</span>
                <span className="font-body text-label-sm text-on-surface-variant/70 whitespace-nowrap">
                  ×{item.count}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {todayMeals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
              Today
            </h2>
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoPending || pending}
              className="inline-flex items-center gap-1 font-body text-label-sm tracking-wide text-on-surface-variant hover:text-charcoal disabled:opacity-50 transition-colors"
              title="Undo today's most recent meal log"
            >
              <span className="material-symbols-outlined text-[14px]">undo</span>
              {undoPending ? "Undoing…" : "Undo last"}
            </button>
          </div>
          <ul className="space-y-2">
            {todayMeals.map((m) => (
              <MealRowItem
                key={m.id}
                meal={m}
                onTapMeal={() => setDescription(m.description)}
                onTapItem={(name) => setDescription(name)}
                disabled={pending}
              />
            ))}
          </ul>
        </section>
      )}

      {earlierMeals.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Earlier this week
          </h2>
          <ul className="space-y-2">
            {earlierMeals.map((m) => (
              <MealRowItem
                key={m.id}
                meal={m}
                onTapMeal={() => setDescription(m.description)}
                onTapItem={(name) => setDescription(name)}
                disabled={pending}
                muted
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MealRowItem({
  meal,
  onTapItem,
  onTapMeal,
  disabled,
  muted = false,
}: {
  meal: MealRow;
  onTapItem: (name: string) => void;
  onTapMeal: () => void;
  disabled: boolean;
  muted?: boolean;
}) {
  // Prefer the AI-extracted shortName; fall back to a truncated description
  // for legacy rows logged before shortName existed.
  const headerLabel =
    meal.shortName ??
    (meal.description.length > 48
      ? `${meal.description.slice(0, 48).trim()}…`
      : meal.description);
  return (
    <li
      className={`rounded-md border px-gutter py-3 transition-colors ${
        muted
          ? "border-outline-variant/40 bg-surface-container-lowest/70"
          : "border-outline-variant bg-surface-container-lowest"
      }`}
    >
      {/* Header: tap the whole row to re-log the full meal. */}
      <button
        type="button"
        onClick={onTapMeal}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-3 text-left disabled:opacity-60"
        title={`Log this whole meal again: ${meal.description}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {meal.processedFlag && (
            <span
              aria-label="Flagged: ultra-processed or refined"
              className="material-symbols-outlined text-soft-red text-[18px] shrink-0"
            >
              error
            </span>
          )}
          <span className="font-body text-body-md text-charcoal truncate">
            {headerLabel}
          </span>
        </div>
        <div className="flex items-baseline gap-3 shrink-0">
          <span className="font-body text-label-sm text-on-surface-variant/80 whitespace-nowrap">
            {meal.protein}g
          </span>
          <span className="font-body text-body-md text-charcoal whitespace-nowrap">
            {meal.calories} cal
          </span>
        </div>
      </button>

      {/* Item pills — each one is a separate button so she can re-log just
          that food. Only renders when items are present (legacy rows
          without items still show the header above and skip this row). */}
      {meal.items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 pt-2 border-t border-outline-variant/40">
          {meal.items.map((item, idx) => (
            <button
              key={`${meal.id}-${idx}-${item.name}`}
              type="button"
              onClick={() => onTapItem(item.name)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-full bg-cream border border-outline-variant/60 px-3 py-1 text-label-sm font-body text-charcoal hover:border-gold hover:bg-surface-container-lowest transition-colors disabled:opacity-60"
              title={`Log just ${item.name} again — ${item.calories} cal`}
            >
              <span className="truncate max-w-[12rem]">{item.name}</span>
              <span className="text-on-surface-variant/70 whitespace-nowrap">
                {item.calories}c
              </span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function TotalCard({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const pct = target > 0 ? Math.min((value / target) * 100, 110) : 0;
  const overTarget = value > target;
  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1">
      <p className="font-body text-label-sm tracking-wide uppercase text-on-surface-variant/80">
        {label}
      </p>
      <p className="font-display text-headline-md text-charcoal mt-1">
        {value}
        {unit}
        <span className="font-body text-body-md text-on-surface-variant/70">
          {" "}
          / {target}
          {unit}
        </span>
      </p>
      <div className="mt-3 h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${overTarget ? "bg-soft-red" : "bg-sage"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ResultCard({
  analysis,
  onUndo,
  undoPending,
}: {
  analysis: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
    shortName: string;
    items: MealItem[];
    processedFlag: boolean;
    flagReason: string;
    coaching: string;
  };
  onUndo: () => void;
  undoPending: boolean;
}) {
  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter md:p-6 shadow-elevation-2 space-y-4">
      {/* Flag pill — only when something refined / processed is on the plate.
          Sits above the coaching prose so the "why" reads as context, not a
          lecture appended at the end. */}
      {analysis.processedFlag && analysis.flagReason && (
        <div className="rounded-md bg-soft-red/10 border border-soft-red/40 px-gutter py-3">
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className="material-symbols-outlined text-soft-red text-[20px] shrink-0 mt-0.5"
            >
              error
            </span>
            <div className="flex-1">
              <p className="font-body text-label-md tracking-widest uppercase text-soft-red mb-1">
                Heads up
              </p>
              <p className="font-body text-body-md text-charcoal leading-relaxed">
                {analysis.flagReason}
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="font-body text-body-md text-charcoal leading-relaxed">
        {analysis.coaching}
      </p>

      {/* Per-item breakdown — shows exactly how Claude split the meal so the
          client sees the math before it lands in her history list. */}
      {analysis.items.length > 1 && (
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-outline-variant/40">
          {analysis.items.map((item, idx) => (
            <span
              key={`${idx}-${item.name}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-cream border border-outline-variant/60 px-3 py-1 text-label-sm font-body text-charcoal"
              title={`${item.protein}g protein, ${item.fat}g fat, ${item.carbs}g carbs`}
            >
              <span className="truncate max-w-[12rem]">{item.name}</span>
              <span className="text-on-surface-variant/70">{item.calories}c</span>
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-outline-variant/40">
        <Macro label="Cal" value={analysis.calories} unit="" />
        <Macro label="Protein" value={analysis.protein} unit="g" />
        <Macro label="Fat" value={analysis.fat} unit="g" />
        <Macro label="Carbs" value={analysis.carbs} unit="g" />
      </div>
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={undoPending}
          className="inline-flex items-center gap-1.5 font-body text-label-md tracking-widest uppercase text-on-surface-variant hover:text-charcoal disabled:opacity-60 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">undo</span>
          {undoPending ? "Undoing…" : "Undo"}
        </button>
      </div>
    </div>
  );
}

function Macro({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-headline-md text-charcoal">
        {value}
        <span className="font-body text-label-sm text-on-surface-variant/70">{unit}</span>
      </p>
      <p className="font-body text-label-sm tracking-wide uppercase text-on-surface-variant/70 mt-0.5">
        {label}
      </p>
    </div>
  );
}
