"use client";

import { useState, useTransition } from "react";
import { logMeal, type LogMealResult } from "./actions";

type RecentMeal = {
  id: string;
  description: string;
  calories: number;
  protein: number;
  createdAt: Date;
};

type Totals = {
  cutCalories: number;
  proteinFloor: number;
  caloriesToday: number;
  proteinToday: number;
} | null;

export function LogForm({
  recentMeals,
  initialTotals,
}: {
  recentMeals: RecentMeal[];
  initialTotals: Totals;
}) {
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<LogMealResult | null>(null);
  const [totals, setTotals] = useState<Totals>(initialTotals);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || pending) return;

    const fd = new FormData();
    fd.set("description", description);

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

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-2">
          <span className="font-body text-label-md tracking-wide uppercase text-on-surface-variant">
            What did you eat?
          </span>
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            rows={3}
            maxLength={500}
            placeholder="Two scrambled eggs, half an avocado, and a slice of sourdough toast"
            className="w-full bg-surface-container-lowest rounded-md border border-outline-variant focus:border-gold focus:ring-0 outline-none p-4 font-body text-body-md text-charcoal placeholder:text-on-surface-variant/50 transition-colors resize-none disabled:opacity-60"
            required
          />
          <div className="flex justify-between text-label-sm text-on-surface-variant/70">
            <span>RIVEN estimates the macros and gives a quick read.</span>
            <span>{description.length} / 500</span>
          </div>
        </label>

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

      {result && result.ok && <ResultCard analysis={result.analysis} />}

      {recentMeals.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Recent meals
          </h2>
          <div className="flex flex-wrap gap-2">
            {recentMeals.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setDescription(m.description)}
                disabled={pending}
                className="group inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 font-body text-body-md text-charcoal hover:border-gold hover:bg-cream transition-colors disabled:opacity-60"
                title={`${m.calories} cal · ${m.protein}g protein`}
              >
                <span className="truncate max-w-[16rem]">{m.description}</span>
                <span className="font-body text-label-sm text-on-surface-variant/70 whitespace-nowrap">
                  {m.calories} cal
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
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
}: {
  analysis: { calories: number; protein: number; fat: number; carbs: number; coaching: string };
}) {
  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 p-gutter md:p-6 shadow-elevation-2 space-y-4">
      <p className="font-body text-body-md text-charcoal leading-relaxed">
        {analysis.coaching}
      </p>
      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-outline-variant/40">
        <Macro label="Cal" value={analysis.calories} unit="" />
        <Macro label="Protein" value={analysis.protein} unit="g" />
        <Macro label="Fat" value={analysis.fat} unit="g" />
        <Macro label="Carbs" value={analysis.carbs} unit="g" />
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
