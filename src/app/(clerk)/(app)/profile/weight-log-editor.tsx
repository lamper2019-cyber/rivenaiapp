"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setWeightForDayAction,
  deleteWeightForDayAction,
} from "./weight-log-actions";
import type { WeighHistoryRow } from "@/lib/daily-weigh-in";

/**
 * Account weight log — the full history she can correct. Each day shows its
 * weight; tap "Edit" to fix a typo, "Delete" to remove a stray; "Add a day"
 * backfills one she missed. Calm and journal-like, not a spreadsheet.
 */
export function WeightLogEditor({ history }: { history: WeighHistoryRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => router.refresh();
  const todayKey = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
  });

  function save(dayKey: string, weight: number) {
    setError(null);
    startTransition(async () => {
      const r = await setWeightForDayAction({ dayKey, weight });
      if (!r.ok) return setError(r.error);
      setEditingDay(null);
      setAdding(false);
      refresh();
    });
  }

  function remove(dayKey: string) {
    setError(null);
    startTransition(async () => {
      const r = await deleteWeightForDayAction({ dayKey });
      if (!r.ok) return setError(r.error);
      refresh();
    });
  }

  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-5 shadow-elevation-1 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-headline-md text-charcoal">
            Your weight log
          </h3>
          <p className="font-body text-body-md text-on-surface-variant leading-relaxed">
            Logged a day wrong? Fix it. Missed one? Add it. It&apos;s your
            record — keep it honest and the trend stays true.
          </p>
        </div>
      </div>

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={pending}
          className="w-full bg-transparent text-charcoal border border-charcoal/70 py-3 rounded-full font-body text-label-md tracking-widest uppercase active:scale-95 disabled:opacity-50 transition-all"
        >
          + Add a day
        </button>
      ) : (
        <AddRow
          todayKey={todayKey}
          existingDays={history.map((h) => h.day)}
          pending={pending}
          onCancel={() => setAdding(false)}
          onSave={save}
        />
      )}

      {history.length === 0 ? (
        <p className="font-body text-body-md text-on-surface-variant text-center py-6">
          No weigh-ins yet. Add one above, or log today on Home.
        </p>
      ) : (
        <ul className="divide-y divide-outline-variant/40">
          {history.map((row) => (
            <li key={row.day} className="py-3">
              {editingDay === row.day ? (
                <EditRow
                  row={row}
                  pending={pending}
                  onCancel={() => setEditingDay(null)}
                  onSave={(w) => save(row.day, w)}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-body text-body-md text-charcoal">
                      {row.weightLb.toFixed(1)}{" "}
                      <span className="text-on-surface-variant/70">lb</span>
                    </p>
                    <p className="font-body text-label-sm text-on-surface-variant">
                      {row.isToday ? "Today" : formatDay(row.day)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingDay(row.day)}
                      disabled={pending}
                      className="rounded-full px-3 py-1.5 font-body text-label-sm text-charcoal border border-outline-variant/60 active:scale-95 disabled:opacity-50 transition-all"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row.day)}
                      disabled={pending}
                      aria-label={`Delete ${row.isToday ? "today" : formatDay(row.day)}`}
                      className="rounded-full px-3 py-1.5 font-body text-label-sm text-soft-red active:scale-95 disabled:opacity-50 transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="font-body text-label-sm text-soft-red">{error}</p>}
    </div>
  );
}

function EditRow({
  row,
  pending,
  onCancel,
  onSave,
}: {
  row: WeighHistoryRow;
  pending: boolean;
  onCancel: () => void;
  onSave: (w: number) => void;
}) {
  const [val, setVal] = useState(row.weightLb.toFixed(1));
  return (
    <div className="space-y-2">
      <p className="font-body text-label-sm text-on-surface-variant">
        {row.isToday ? "Today" : formatDay(row.day)}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={0.1}
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-28 rounded-md border border-outline-variant/60 bg-cream px-3 py-2 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none"
        />
        <span className="font-body text-body-md text-on-surface-variant/70">lb</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="font-body text-label-sm text-on-surface-variant px-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !val.trim()}
            onClick={() => onSave(parseFloat(val))}
            className="rounded-full bg-charcoal text-cream px-4 py-2 font-body text-label-sm tracking-widest uppercase disabled:opacity-40 active:scale-95 transition-all"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AddRow({
  todayKey,
  existingDays,
  pending,
  onCancel,
  onSave,
}: {
  todayKey: string;
  existingDays: string[];
  pending: boolean;
  onCancel: () => void;
  onSave: (dayKey: string, weight: number) => void;
}) {
  const [day, setDay] = useState(todayKey);
  const [val, setVal] = useState("");
  const overwriting = existingDays.includes(day);

  return (
    <div className="rounded-md bg-cream border border-gold/40 px-gutter py-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          max={todayKey}
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none"
        />
        <input
          type="number"
          step={0.1}
          inputMode="decimal"
          placeholder="lb"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-24 rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 font-body text-body-md text-charcoal focus:border-charcoal focus:outline-none"
        />
      </div>
      {overwriting && (
        <p className="font-body text-label-sm text-on-surface-variant">
          You already have that day — saving will update it.
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="font-body text-label-sm text-on-surface-variant px-2"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || !val.trim() || !day}
          onClick={() => onSave(day, parseFloat(val))}
          className="rounded-full bg-charcoal text-cream px-5 py-2 font-body text-label-sm tracking-widest uppercase disabled:opacity-40 active:scale-95 transition-all"
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** "Tue, Jun 10" in Central time from a YYYY-MM-DD key. */
function formatDay(dayKey: string): string {
  return new Date(`${dayKey}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
