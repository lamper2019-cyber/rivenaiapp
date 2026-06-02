import { prisma } from "@/lib/prisma";
import { startOfIsoWeek } from "@/lib/week";

/**
 * Sunday Daily Ritual data layer.
 *
 * Four prompt formats live here:
 *   - "pulse"        — 3 tap options, fills a bar chart with the group's split
 *   - "this_or_that" — 2 tap options, side-by-side cards
 *   - "is_this_you"  — 3 confession-style reactions (😤 me / 🙏 been there / ...)
 *   - "open"         — legacy free-text answer, replay-only (historical prompts)
 *
 * Going forward, new prompts auto-rotate through the three tap formats. The
 * coach editor can override per week. Tap-format answers store choice (the
 * option key) and leave body null; legacy open answers do the opposite.
 *
 * "Open" === today's day-of-week is Sunday in Central time. Off-Sunday, all
 * surfaces render in replay mode (no taps land, no writes go through).
 */

// ── Format kinds ──────────────────────────────────────────────────────────

export type SundayPromptKind =
  | "pulse"
  | "this_or_that"
  | "is_this_you"
  | "open";

export const TAP_KINDS: SundayPromptKind[] = [
  "pulse",
  "this_or_that",
  "is_this_you",
];

export function isSundayPromptKind(v: string): v is SundayPromptKind {
  return v === "pulse" || v === "this_or_that" || v === "is_this_you" || v === "open";
}

export type SundayPromptOption = { key: string; label: string };

// Default option seeds the coach editor uses when a kind is first picked.
// RIVEN can rewrite any of them, but these are sensible starting points.
export const DEFAULT_OPTIONS: Record<
  Exclude<SundayPromptKind, "open">,
  SundayPromptOption[]
> = {
  pulse: [
    { key: "discipline", label: "discipline" },
    { key: "vanity",     label: "vanity" },
    { key: "habit",      label: "habit" },
  ],
  this_or_that: [
    { key: "left",  label: "I'll start Monday" },
    { key: "right", label: "I want it bad enough" },
  ],
  is_this_you: [
    { key: "me",          label: "😤 me" },
    { key: "been_there",  label: "🙏 been there" },
    { key: "not_anymore", label: "🌿 not anymore" },
  ],
};

/** Parse the JSON `options` column safely. Returns [] on malformed data. */
export function parseOptions(raw: unknown): SundayPromptOption[] {
  if (!Array.isArray(raw)) return [];
  const out: SundayPromptOption[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).key === "string" &&
      typeof (item as Record<string, unknown>).label === "string"
    ) {
      out.push({
        key: (item as { key: string }).key,
        label: (item as { label: string }).label,
      });
    }
  }
  return out;
}

// ── Reactions (on legacy "open" answers only) ─────────────────────────────

export type SundayReactionKind = "heart" | "fire";

export const SUNDAY_REACTION_KINDS: SundayReactionKind[] = ["heart", "fire"];

export const SUNDAY_REACTION_LABEL: Record<SundayReactionKind, string> = {
  heart: "❤️",
  fire: "🔥",
};

// ── Snapshot types ────────────────────────────────────────────────────────

export type SundayAnswerSummary = {
  id: string;
  firstName: string;
  body: string;
  createdAt: Date;
  isMine: boolean;
  reactionCounts: Record<SundayReactionKind, number>;
  myReactions: Record<SundayReactionKind, boolean>;
};

export type SundayRitualSnapshot = {
  isOpen: boolean;
  weekStart: Date;
  prompt:
    | {
        id: string;
        question: string;
        kind: SundayPromptKind;
        options: SundayPromptOption[];
      }
    | null;
  // For tap formats: tally of choice keys + the viewer's own pick.
  tally: Record<string, number>;
  myChoice: string | null;
  totalTaps: number;
  // For the legacy "open" format only:
  myAnswer: { id: string; body: string } | null;
  others: SundayAnswerSummary[];
};

const ACTIVE_STATUSES = ["trialing", "active", "comped"];

/** "Open" === today's day-of-week is Sunday in Central time. */
export function isRitualOpen(now: Date = new Date()): boolean {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
    }).format(now) === "Sun"
  );
}

/**
 * Pick the next tap format in the rotation: pulse → this_or_that →
 * is_this_you → pulse. "open" never gets auto-picked; only the coach can
 * resurrect it via the editor (and we're retiring it anyway).
 *
 * Looks at the most recent non-"open" prompt before today; whatever kind
 * that was, return the NEXT one in the rotation. First-ever prompt → pulse.
 */
export async function pickNextRotationKind(): Promise<
  Exclude<SundayPromptKind, "open">
> {
  const previous = await prisma.sundayPrompt.findFirst({
    where: { kind: { in: TAP_KINDS } },
    orderBy: { weekStart: "desc" },
    select: { kind: true },
  });
  if (!previous) return "pulse";
  const idx = TAP_KINDS.indexOf(previous.kind as SundayPromptKind);
  const next = TAP_KINDS[(idx + 1) % TAP_KINDS.length];
  // The cast is safe — TAP_KINDS only contains the three non-open kinds.
  return next as Exclude<SundayPromptKind, "open">;
}

export async function getSundayRitualSnapshot(
  viewerUserId: string,
): Promise<SundayRitualSnapshot> {
  const weekStart = startOfIsoWeek(new Date());
  const isOpen = isRitualOpen();

  const promptRow = await prisma.sundayPrompt.findUnique({
    where: { weekStart },
    select: {
      id: true,
      question: true,
      kind: true,
      options: true,
    },
  });

  if (!promptRow) {
    return {
      isOpen,
      weekStart,
      prompt: null,
      tally: {},
      myChoice: null,
      totalTaps: 0,
      myAnswer: null,
      others: [],
    };
  }

  const kind: SundayPromptKind = isSundayPromptKind(promptRow.kind)
    ? promptRow.kind
    : "open";
  const options = parseOptions(promptRow.options);
  const prompt = {
    id: promptRow.id,
    question: promptRow.question,
    kind,
    options,
  };

  // Pull all answers in one shot. Active clients OR the coach (RIVEN
  // participating is part of the value).
  const answers = await prisma.sundayPromptAnswer.findMany({
    where: {
      promptId: promptRow.id,
      OR: [
        {
          user: {
            role: "CLIENT",
            subscriptionStatus: { in: ACTIVE_STATUSES },
          },
        },
        { user: { role: "COACH" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      choice: true,
      createdAt: true,
      userId: true,
      user: { select: { profile: { select: { name: true } } } },
      reactions: { select: { userId: true, kind: true } },
    },
  });

  // Tap-format aggregation: count choices, find viewer's own choice.
  const tally: Record<string, number> = {};
  for (const opt of options) tally[opt.key] = 0;
  let myChoice: string | null = null;
  let totalTaps = 0;

  // Legacy open-format aggregation: my body answer + others' writings.
  let myAnswer: SundayRitualSnapshot["myAnswer"] = null;
  const others: SundayAnswerSummary[] = [];

  for (const a of answers) {
    if (a.choice) {
      // Tap answer.
      if (a.choice in tally) tally[a.choice] += 1;
      else tally[a.choice] = 1; // tolerate older/legacy keys
      totalTaps += 1;
      if (a.userId === viewerUserId) myChoice = a.choice;
      // Tap answers don't render in the "others" list — the bar chart IS
      // the social proof.
      continue;
    }

    // Legacy open-format answer (body text).
    if (!a.body) continue;
    const firstName =
      (a.user.profile?.name ?? "").trim().split(/\s+/)[0] || "A RIVEN member";
    if (a.userId === viewerUserId) {
      myAnswer = { id: a.id, body: a.body };
    }
    const reactionCounts: Record<SundayReactionKind, number> = {
      heart: 0,
      fire: 0,
    };
    const myReactions: Record<SundayReactionKind, boolean> = {
      heart: false,
      fire: false,
    };
    for (const r of a.reactions) {
      if ((SUNDAY_REACTION_KINDS as string[]).includes(r.kind)) {
        const k = r.kind as SundayReactionKind;
        reactionCounts[k]++;
        if (r.userId === viewerUserId) myReactions[k] = true;
      }
    }
    others.push({
      id: a.id,
      firstName,
      body: a.body,
      createdAt: a.createdAt,
      isMine: a.userId === viewerUserId,
      reactionCounts,
      myReactions,
    });
  }

  return {
    isOpen,
    weekStart,
    prompt,
    tally,
    myChoice,
    totalTaps,
    myAnswer,
    others,
  };
}

/** Coach helper: get this week's prompt for the editor form. */
export async function getCurrentWeekPrompt() {
  const weekStart = startOfIsoWeek(new Date());
  return prisma.sundayPrompt.findUnique({
    where: { weekStart },
    select: {
      id: true,
      question: true,
      kind: true,
      options: true,
      weekStart: true,
      updatedAt: true,
    },
  });
}
