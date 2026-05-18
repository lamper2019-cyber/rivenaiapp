import { startOfCentralDay } from "@/lib/dates";

/**
 * Per-client boolean array of meal-log presence over the most recent
 * `daysBack` Central-time calendar days. Index 0 is the oldest day; the
 * last index is today.
 *
 * Use the same daysBack when computing streaks so the visualization and
 * streak math agree.
 */
export function buildHeatmapByClient(
  rows: Array<{ userId: string; createdAt: Date }>,
  daysBack: number,
): Map<string, boolean[]> {
  const today = startOfCentralDay();
  const dayKeys: number[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayKeys.push(d.getTime());
  }

  const map = new Map<string, boolean[]>();
  for (const r of rows) {
    const dayStart = startOfCentralDay(r.createdAt).getTime();
    const idx = dayKeys.indexOf(dayStart);
    if (idx < 0) continue;
    if (!map.has(r.userId)) map.set(r.userId, new Array(daysBack).fill(false));
    map.get(r.userId)![idx] = true;
  }
  return map;
}

/**
 * Length of the consecutive logging streak ENDING YESTERDAY, given a heatmap
 * where the last index is today. Today is intentionally excluded — streaks
 * are celebrated the morning after they're locked in. Mirrors the in-cron
 * helper in `src/lib/sean-messages.ts` but reads a precomputed array.
 */
export function streakEndingYesterdayFromHeatmap(heatmap: boolean[]): number {
  if (heatmap.length < 2) return 0;
  let count = 0;
  for (let i = heatmap.length - 2; i >= 0; i--) {
    if (heatmap[i]) count++;
    else break;
  }
  return count;
}

/** Last 7 entries of a longer heatmap, for the 7-day roster visualization. */
export function take7(heatmap: boolean[]): boolean[] {
  return heatmap.slice(-7);
}
