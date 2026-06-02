/**
 * Bucketed triage for the coach roster. Splits clients into:
 *  - needsAttention: RIVEN has an action item (no-log, pending check-in)
 *  - doingWell:      RIVEN should acknowledge (streak milestone, weight drop)
 *  - (everyone else): no signal either way — shown in the plain roster
 *
 * One client only appears in ONE bucket. needsAttention always wins — if she
 * needs RIVEN's eyes, that's more urgent than celebrating.
 *
 * Pure function. Computation happens in the page (so we can batch DB reads),
 * then the arrays are handed to the TriageFeed component for render.
 */

export type TriageSeverity = "red" | "gold" | "sage";

export type TriageCategory =
  | "no_log_72h"
  | "no_log_48h"
  | "no_log_24h"
  | "checkin_waiting"
  | "streak_milestone"
  | "weight_drop";

export type TriageEvent = {
  clientId: string;
  clientFirstName: string;
  severity: TriageSeverity;
  category: TriageCategory;
  copy: string;
  href: string;
};

export type TriageBuckets = {
  needsAttention: TriageEvent[];
  doingWell: TriageEvent[];
  /** All client IDs that appear in either bucket — for filtering "Everyone else". */
  bucketedClientIds: Set<string>;
};

const SEVERITY_RANK: Record<TriageSeverity, number> = {
  red: 0,
  gold: 1,
  sage: 2,
};

const STREAK_MILESTONES: number[] = [3, 5, 7, 14, 30];

type TriageClientInput = {
  id: string;
  name: string;
  lastMealLogAt: Date | null;
  latestCheckIn: {
    weekStart: Date;
    createdAt: Date;
    weight: number | null;
  } | null;
  previousCheckInWeight: number | null;
  latestCoachReplyAt: Date | null;
  streakEndingYesterday: number;
};

export function computeBucketedTriage(input: {
  clients: TriageClientInput[];
  now: Date;
  currentWeekStart: Date;
  maxPerBucket?: number;
}): TriageBuckets {
  const maxPerBucket = input.maxPerBucket ?? 5;
  const needsAttention: TriageEvent[] = [];
  const needsAttentionIds = new Set<string>();
  const hoursSince = (then: Date) =>
    (input.now.getTime() - then.getTime()) / (1000 * 60 * 60);

  // First pass: needs you. Per client, push at most one "no-log" event AND
  // at most one "checkin_waiting" event. If anything fires, the client gets
  // bucketed (excluded from doingWell).
  for (const c of input.clients) {
    const firstName = c.name.split(/\s+/)[0];

    if (c.lastMealLogAt) {
      const h = hoursSince(c.lastMealLogAt);
      if (h >= 72) {
        const days = Math.floor(h / 24);
        needsAttention.push({
          clientId: c.id,
          clientFirstName: firstName,
          severity: "red",
          category: "no_log_72h",
          copy: `${firstName}'s gone quiet — ${days} days since her last log.`,
          href: `/coach/clients/${c.id}`,
        });
        needsAttentionIds.add(c.id);
      } else if (h >= 48) {
        needsAttention.push({
          clientId: c.id,
          clientFirstName: firstName,
          severity: "red",
          category: "no_log_48h",
          copy: `${firstName} hasn't logged in ${Math.floor(h)} hours. Check in?`,
          href: `/coach/clients/${c.id}`,
        });
        needsAttentionIds.add(c.id);
      } else if (h >= 24) {
        needsAttention.push({
          clientId: c.id,
          clientFirstName: firstName,
          severity: "gold",
          category: "no_log_24h",
          copy: `${firstName}'s log went quiet — nothing in 24 hours.`,
          href: `/coach/clients/${c.id}`,
        });
        needsAttentionIds.add(c.id);
      }
    }

    if (
      c.latestCheckIn &&
      c.latestCheckIn.weekStart.getTime() >= input.currentWeekStart.getTime()
    ) {
      const repliedSince =
        c.latestCoachReplyAt && c.latestCoachReplyAt > c.latestCheckIn.createdAt;
      if (!repliedSince) {
        needsAttention.push({
          clientId: c.id,
          clientFirstName: firstName,
          severity: "red",
          category: "checkin_waiting",
          copy: `${firstName}'s check-in is in, waiting on you.`,
          href: `/coach/clients/${c.id}`,
        });
        needsAttentionIds.add(c.id);
      }
    }
  }

  // Red first, gold next. Within tier, alphabetical by first name.
  needsAttention.sort((a, b) => {
    const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (r !== 0) return r;
    return a.clientFirstName.localeCompare(b.clientFirstName);
  });

  // Second pass: doing well. One card per client. Combine signals when both
  // weight drop AND streak fire — that's the most impressive single line.
  const doingWell: TriageEvent[] = [];
  for (const c of input.clients) {
    if (needsAttentionIds.has(c.id)) continue;

    const firstName = c.name.split(/\s+/)[0];
    const milestone = STREAK_MILESTONES.includes(c.streakEndingYesterday)
      ? c.streakEndingYesterday
      : null;
    const weightDrop = computeWeightDrop({
      latestCheckIn: c.latestCheckIn,
      previousCheckInWeight: c.previousCheckInWeight,
      currentWeekStart: input.currentWeekStart,
    });

    if (!milestone && weightDrop === null) continue;

    let copy: string;
    let category: TriageCategory;
    if (weightDrop !== null && milestone) {
      copy = `${firstName}'s down ${weightDrop.toFixed(1)} lbs this week + ${milestone}-day log streak.`;
      category = "weight_drop";
    } else if (weightDrop !== null) {
      copy = `${firstName}'s down ${weightDrop.toFixed(1)} lbs this week — say something.`;
      category = "weight_drop";
    } else {
      copy = `${firstName} just locked in ${milestone} straight days.`;
      category = "streak_milestone";
    }

    doingWell.push({
      clientId: c.id,
      clientFirstName: firstName,
      severity: "sage",
      category,
      copy,
      href: `/coach/clients/${c.id}`,
    });
  }

  // Sort doingWell by impressiveness: weight drop magnitude × 100 + streak.
  // So 1.2 lbs = 120, a 30-day streak = 30 — drops outweigh streaks. Both
  // signals stack when present.
  doingWell.sort((a, b) => {
    const scoreA = impressionScore(input.clients.find((x) => x.id === a.clientId)!, input.currentWeekStart);
    const scoreB = impressionScore(input.clients.find((x) => x.id === b.clientId)!, input.currentWeekStart);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.clientFirstName.localeCompare(b.clientFirstName);
  });

  const cappedNeeds = needsAttention.slice(0, maxPerBucket);
  const cappedDoing = doingWell.slice(0, maxPerBucket);
  const bucketedClientIds = new Set<string>();
  for (const e of cappedNeeds) bucketedClientIds.add(e.clientId);
  for (const e of cappedDoing) bucketedClientIds.add(e.clientId);

  return {
    needsAttention: cappedNeeds,
    doingWell: cappedDoing,
    bucketedClientIds,
  };
}

function computeWeightDrop(input: {
  latestCheckIn: { weekStart: Date; weight: number | null } | null;
  previousCheckInWeight: number | null;
  currentWeekStart: Date;
}): number | null {
  if (!input.latestCheckIn) return null;
  // Only celebrate a drop if the latest check-in is from THIS week — otherwise
  // we'd surface stale wins from a month ago.
  if (input.latestCheckIn.weekStart.getTime() < input.currentWeekStart.getTime()) {
    return null;
  }
  if (input.latestCheckIn.weight === null) return null;
  if (input.previousCheckInWeight === null) return null;
  const drop = input.previousCheckInWeight - input.latestCheckIn.weight;
  // Require at least 0.5 lbs to filter out scale noise / hydration.
  if (drop < 0.5) return null;
  return drop;
}

function impressionScore(c: TriageClientInput, currentWeekStart: Date): number {
  const wd = computeWeightDrop({
    latestCheckIn: c.latestCheckIn,
    previousCheckInWeight: c.previousCheckInWeight,
    currentWeekStart,
  });
  const milestone = STREAK_MILESTONES.includes(c.streakEndingYesterday)
    ? c.streakEndingYesterday
    : 0;
  return (wd ?? 0) * 100 + milestone;
}
