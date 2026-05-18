import { startOfCentralDay } from "@/lib/dates";

/**
 * Calendar/heatmap of meal-log days for a single client on the coach detail
 * page. Pure server-side computation. The resulting CalendarDay objects are
 * fully serializable (no Date instances on .meals — createdAt is a millisecond
 * number) so they cross the server/client component boundary cleanly.
 */

export type MealForCalendar = {
  id: string;
  description: string;
  shortName: string | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  createdAt: number; // ms since epoch
};

export type DayStatus = "empty" | "sage" | "gold" | "red";

export type CalendarDay = {
  dateKey: number; // ms timestamp of Central midnight
  dayLabel: string; // "17"
  monthLabel: string; // "May"
  weekdayLabel: string; // "Sun"
  fullDateLabel: string; // "Sun, May 17"
  totalCalories: number;
  meals: MealForCalendar[];
  status: DayStatus;
  isToday: boolean;
};

type RawMealLog = {
  id: string;
  description: string;
  shortName: string | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  createdAt: Date;
};

export function buildCalendarDays(input: {
  meals: RawMealLog[];
  daysBack: number;
  cutCalorieTarget: number;
}): CalendarDay[] {
  const today = startOfCentralDay();
  const todayKey = today.getTime();

  // Group meals by Central-day bucket.
  const byDay = new Map<number, { totalCal: number; meals: MealForCalendar[] }>();
  for (const m of input.meals) {
    const key = startOfCentralDay(m.createdAt).getTime();
    let entry = byDay.get(key);
    if (!entry) {
      entry = { totalCal: 0, meals: [] };
      byDay.set(key, entry);
    }
    entry.totalCal += m.calories;
    entry.meals.push({
      id: m.id,
      description: m.description,
      shortName: m.shortName,
      calories: m.calories,
      protein: m.protein,
      fat: m.fat,
      carbs: m.carbs,
      createdAt: m.createdAt.getTime(),
    });
  }

  const days: CalendarDay[] = [];
  for (let i = input.daysBack - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.getTime();
    const entry = byDay.get(key) ?? { totalCal: 0, meals: [] };
    const target = input.cutCalorieTarget;

    let status: DayStatus;
    if (entry.totalCal === 0 || target === 0) {
      status = "empty";
    } else if (entry.totalCal <= target) {
      // At or below target = in deficit zone. Sean's coaching goal.
      status = "sage";
    } else if (entry.totalCal <= target * 1.25) {
      status = "gold";
    } else {
      status = "red";
    }

    const fmt = (opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        ...opts,
      }).format(d);

    days.push({
      dateKey: key,
      dayLabel: fmt({ day: "numeric" }),
      monthLabel: fmt({ month: "short" }),
      weekdayLabel: fmt({ weekday: "short" }),
      fullDateLabel: fmt({ weekday: "short", month: "short", day: "numeric" }),
      totalCalories: entry.totalCal,
      meals: entry.meals,
      status,
      isToday: key === todayKey,
    });
  }

  return days;
}
