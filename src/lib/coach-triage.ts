/**
 * Triage events for the coach roster — what needs Sean's attention right now.
 *
 * Pure function. Computation happens in the page (so we can batch DB reads),
 * then the array is handed to the TriageFeed component for render. Mirrors
 * the Sean-voice rule: copy is direct, names her by first name, never preachy.
 */

export type TriageSeverity = "red" | "gold" | "sage";

export type TriageCategory =
  | "no_log_72h"
  | "no_log_48h"
  | "no_log_24h"
  | "checkin_waiting"
  | "streak_milestone";

export type TriageEvent = {
  clientId: string;
  clientFirstName: string;
  severity: TriageSeverity;
  category: TriageCategory;
  copy: string;
  href: string;
};

const SEVERITY_RANK: Record<TriageSeverity, number> = {
  red: 0,
  gold: 1,
  sage: 2,
};

const STREAK_MILESTONES: number[] = [3, 5, 7, 14, 30];

export function computeTriageEvents(input: {
  clients: Array<{
    id: string;
    name: string;
    lastMealLogAt: Date | null;
    latestCheckIn: { weekStart: Date; createdAt: Date } | null;
    latestCoachReplyAt: Date | null;
    streakEndingYesterday: number;
  }>;
  now: Date;
  currentWeekStart: Date;
  maxCards?: number;
}): TriageEvent[] {
  const maxCards = input.maxCards ?? 5;
  const events: TriageEvent[] = [];
  const hoursSince = (then: Date) =>
    (input.now.getTime() - then.getTime()) / (1000 * 60 * 60);

  for (const c of input.clients) {
    const firstName = c.name.split(/\s+/)[0];

    // No-log triage. Highest-severity bucket only, not all of them.
    if (c.lastMealLogAt) {
      const h = hoursSince(c.lastMealLogAt);
      if (h >= 72) {
        const days = Math.floor(h / 24);
        events.push({
          clientId: c.id,
          clientFirstName: firstName,
          severity: "red",
          category: "no_log_72h",
          copy: `${firstName}'s gone quiet — ${days} days since her last log.`,
          href: `/coach/clients/${c.id}`,
        });
      } else if (h >= 48) {
        events.push({
          clientId: c.id,
          clientFirstName: firstName,
          severity: "red",
          category: "no_log_48h",
          copy: `${firstName} hasn't logged in ${Math.floor(h)} hours. Check in?`,
          href: `/coach/clients/${c.id}`,
        });
      } else if (h >= 24) {
        events.push({
          clientId: c.id,
          clientFirstName: firstName,
          severity: "gold",
          category: "no_log_24h",
          copy: `${firstName}'s log went quiet — nothing in 24 hours.`,
          href: `/coach/clients/${c.id}`,
        });
      }
    }

    // Sunday check-in submitted this week, Sean hasn't replied since.
    if (
      c.latestCheckIn &&
      c.latestCheckIn.weekStart.getTime() >= input.currentWeekStart.getTime()
    ) {
      const repliedSince =
        c.latestCoachReplyAt && c.latestCoachReplyAt > c.latestCheckIn.createdAt;
      if (!repliedSince) {
        events.push({
          clientId: c.id,
          clientFirstName: firstName,
          severity: "red",
          category: "checkin_waiting",
          copy: `${firstName}'s check-in is in, waiting on you.`,
          href: `/coach/clients/${c.id}`,
        });
      }
    }

    // Streak milestone closed yesterday — celebrate, don't let it slide by.
    if (STREAK_MILESTONES.includes(c.streakEndingYesterday)) {
      events.push({
        clientId: c.id,
        clientFirstName: firstName,
        severity: "sage",
        category: "streak_milestone",
        copy: `${firstName} just locked in ${c.streakEndingYesterday} straight days.`,
        href: `/coach/clients/${c.id}`,
      });
    }
  }

  // Red first, gold next, sage last. Within tier, alphabetical by first name.
  events.sort((a, b) => {
    const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (r !== 0) return r;
    return a.clientFirstName.localeCompare(b.clientFirstName);
  });

  return events.slice(0, maxCards);
}
