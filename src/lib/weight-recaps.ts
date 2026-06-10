import { prisma } from "@/lib/prisma";

/**
 * Longer-horizon weight recaps built from the daily weigh-ins:
 *   - MONTHLY (every 30 days): a staircase of monthly averages — where she was
 *     each month from the start.
 *   - YEARLY (after 365 days): the full-year line + log streak + milestones.
 *
 * Both are full-screen overlays (like the Sunday wrap). "Show once per period"
 * is handled client-side via a localStorage key, so no extra DB column.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const monthShort = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

/** Group weigh-ins by calendar month (YYYY-MM), oldest→newest, as averages. */
function monthlyAverages(
  rows: { day: Date; weightLb: number }[],
): Array<{ ym: string; avg: number }> {
  const byMonth = new Map<string, number[]>();
  for (const r of rows) {
    const ym = r.day.toISOString().slice(0, 7);
    const arr = byMonth.get(ym) ?? [];
    arr.push(r.weightLb);
    byMonth.set(ym, arr);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, ws]) => ({ ym, avg: round1(avg(ws)) }));
}

export type MonthBar = { label: string; avg: number };
export type MonthlyRecap = {
  monthIndex: number; // how many months of data she has
  periodKey: string; // current YYYY-MM — the "show once this month" key
  bars: MonthBar[];
  totalDelta: number; // first month avg − latest month avg (positive = down)
  lbsToGoal: number;
  latestAvg: number;
};

/** Monthly staircase recap. Needs ≥2 calendar months of weigh-ins. */
export async function getMonthlyRecap(userId: string): Promise<MonthlyRecap | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profile: { select: { goalWeight: true } },
      dailyWeighIns: { orderBy: { day: "asc" }, select: { day: true, weightLb: true } },
    },
  });
  if (!user?.profile || user.dailyWeighIns.length === 0) return null;

  const months = monthlyAverages(user.dailyWeighIns);
  if (months.length < 2) return null; // need a completed month + the current one

  const bars = months.map((m) => ({ label: monthShort(m.ym), avg: m.avg }));
  const latestAvg = bars[bars.length - 1].avg;
  return {
    monthIndex: months.length,
    periodKey: new Date().toISOString().slice(0, 7),
    bars,
    totalDelta: round1(bars[0].avg - latestAvg),
    lbsToGoal: round1(latestAvg - user.profile.goalWeight),
    latestAvg,
  };
}

export type YearlyRecap = {
  periodKey: string; // year, the "show once this year" key
  startAvg: number;
  currentAvg: number;
  totalDelta: number; // positive = down over the year
  series: number[]; // monthly averages, for the line
  logStreak: number; // longest run of consecutive days logged
  milestones: number; // 10-lb milestones crossed
};

/** Longest run of consecutive calendar days present in the sorted day list. */
function longestStreak(daysAsc: Date[]): number {
  let best = 0, run = 0;
  let prev: number | null = null;
  for (const d of daysAsc) {
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000;
    if (prev != null && t === prev + 1) run += 1;
    else if (prev != null && t === prev) {
      /* same day dup — ignore */
      continue;
    } else run = 1;
    prev = t;
    if (run > best) best = run;
  }
  return best;
}

/** Year-in-review. Needs ≥365 days since her first weigh-in. */
export async function getYearlyRecap(userId: string): Promise<YearlyRecap | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      dailyWeighIns: { orderBy: { day: "asc" }, select: { day: true, weightLb: true } },
    },
  });
  const rows = user?.dailyWeighIns ?? [];
  if (rows.length === 0) return null;

  const days = (Date.now() - rows[0].day.getTime()) / 86_400_000;
  if (days < 365) return null;

  const months = monthlyAverages(rows);
  const series = months.map((m) => m.avg);
  const startAvg = series[0];
  const currentAvg = series[series.length - 1];
  const totalDelta = round1(startAvg - currentAvg);

  return {
    periodKey: String(new Date().getUTCFullYear()),
    startAvg,
    currentAvg,
    totalDelta,
    series,
    logStreak: longestStreak(rows.map((r) => r.day)),
    milestones: Math.max(0, Math.floor(totalDelta / 10)),
  };
}
