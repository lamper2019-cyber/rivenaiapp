"use client";

import { useState, useTransition } from "react";
import { setQualifiedDms } from "./actions";

/**
 * The "qualified DMs this week" stat — but editable inline. This is the
 * single highest-signal number (people asking "how do I work with you?"),
 * and IG won't hand us messaging data without heavy review, so RIVEN taps it
 * in. Click the number → it becomes an input → blur/Enter saves.
 */
export function QualifiedDmsField({ current }: { current: number | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? 0);
  const [isPending, startTransition] = useTransition();

  function save() {
    setEditing(false);
    startTransition(async () => {
      await setQualifiedDms(value);
    });
  }

  return (
    <div className="flex flex-col gap-0.5">
      {editing ? (
        <input
          autoFocus
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="font-display text-headline-md text-charcoal leading-none w-20 bg-transparent border-b border-gold focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="font-display text-headline-md text-charcoal leading-none text-left hover:text-gold transition-colors inline-flex items-center gap-1"
        >
          {isPending ? "…" : (current ?? 0)}
          <span className="material-symbols-outlined text-sm text-gold/70">edit</span>
        </button>
      )}
      <span className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        Qualified DMs
      </span>
    </div>
  );
}
