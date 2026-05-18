"use client";

import { useState } from "react";
import type { CalendarDay, DayStatus } from "@/lib/meal-calendar";

const STATUS_CELL: Record<DayStatus, string> = {
  empty: "bg-on-surface-variant/10 text-on-surface-variant/55",
  sage: "bg-sage/30 text-charcoal",
  gold: "bg-gold/40 text-charcoal",
  red: "bg-soft-red/30 text-charcoal",
};

const STATUS_SWATCH: Record<Exclude<DayStatus, "empty">, string> = {
  sage: "bg-sage/30",
  gold: "bg-gold/40",
  red: "bg-soft-red/30",
};

export function MealCalendar({
  days,
  target,
}: {
  days: CalendarDay[];
  target: number;
}) {
  const [activeKey, setActiveKey] = useState<number | null>(null);
  const active = activeKey !== null ? days.find((d) => d.dateKey === activeKey) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="Meal log calendar">
        {days.map((d) => {
          const isSelected = d.dateKey === activeKey;
          return (
            <button
              key={d.dateKey}
              type="button"
              onClick={() =>
                setActiveKey(d.dateKey === activeKey ? null : d.dateKey)
              }
              aria-label={`${d.fullDateLabel}, ${d.totalCalories.toLocaleString()} calories${
                d.isProbablyIncomplete ? ", probably incomplete" : ""
              }`}
              aria-pressed={isSelected}
              className={`relative aspect-square rounded-md flex items-center justify-center transition-all font-body text-body-md leading-none active:scale-95 ${
                STATUS_CELL[d.status]
              } ${
                isSelected
                  ? "ring-2 ring-charcoal"
                  : d.isToday
                  ? "ring-1 ring-charcoal/40"
                  : ""
              }`}
            >
              {d.dayLabel}
              {d.isProbablyIncomplete && (
                <span
                  aria-hidden
                  className="absolute top-0.5 right-1 font-body text-[10px] leading-none text-charcoal/70"
                >
                  ?
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap font-body text-label-sm text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-sm ${STATUS_SWATCH.sage}`} />
          In deficit
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-sm ${STATUS_SWATCH.gold}`} />
          Slight over
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-sm ${STATUS_SWATCH.red}`} />
          Way over
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-on-surface-variant/10" />
          No log
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-body text-charcoal/70 text-[12px] leading-none">?</span>
          Maybe incomplete
        </span>
      </div>

      {active && (
        <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter shadow-elevation-1">
          <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
            <h3 className="font-display text-headline-sm text-charcoal">
              {active.fullDateLabel}
            </h3>
            <p className="font-body text-body-md text-on-surface-variant whitespace-nowrap">
              {active.totalCalories.toLocaleString()} cal
              {target > 0 && (
                <span className="text-on-surface-variant/70">
                  {" "}
                  / {target.toLocaleString()}
                </span>
              )}
            </p>
          </div>

          {active.isProbablyIncomplete && (
            <div className="rounded-md bg-gold/15 border border-gold/45 px-3 py-2 mb-3">
              <p className="font-body text-label-sm text-charcoal">
                Looks incomplete — only {active.meals.length} meal
                {active.meals.length === 1 ? "" : "s"} logged, well under target.
                Probably didn't track the rest of the day.
              </p>
            </div>
          )}

          {active.meals.length === 0 ? (
            <p className="font-body text-body-md text-on-surface-variant">
              No logs that day.
            </p>
          ) : (
            <ul className="space-y-2">
              {active.meals.map((m) => {
                const time = new Date(m.createdAt).toLocaleString("en-US", {
                  timeZone: "America/Chicago",
                  hour: "numeric",
                  minute: "2-digit",
                });
                return (
                  <li
                    key={m.id}
                    className="border-b border-outline-variant/30 last:border-0 pb-2 last:pb-0"
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <p className="font-body text-body-md text-charcoal">
                        {m.shortName ?? m.description}
                      </p>
                      <p className="font-body text-label-sm text-on-surface-variant whitespace-nowrap">
                        {time} · {m.calories.toLocaleString()} cal
                      </p>
                    </div>
                    <p className="font-body text-label-sm text-on-surface-variant mt-0.5">
                      {m.protein}g protein · {m.fat}g fat · {m.carbs}g carbs
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
