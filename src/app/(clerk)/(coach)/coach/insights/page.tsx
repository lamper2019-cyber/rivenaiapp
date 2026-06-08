import { prisma } from "@/lib/prisma";
import { buildCommandCenter, type PostCard, type Cluster, type Swot } from "@/lib/insights";
import {
  isPosthogQueryConfigured,
  fetchFunnelTotals,
  type FunnelTotals,
} from "@/lib/posthog-insights";
import { isInstagramConfigured } from "@/lib/instagram";
import {
  Eye, UserPlus, MousePointerClick, Rocket, Target, GraduationCap,
  Check, Sparkles, Compass, ArrowUpRight, type LucideIcon,
} from "lucide-react";
import { SyncButton } from "./sync-button";
import { QualifiedDmsField } from "./qualified-dms-field";
import { PostIdeas } from "./post-ideas";
import { PostAutopsy, type AutopsyPost } from "./post-autopsy";

// Always fresh — low-traffic coach page, numbers change on every sync.
export const dynamic = "force-dynamic";

/**
 * "Post Lab" design — the look Sean built. All DATA and WIRING are unchanged:
 * real PostHog funnel (fetchFunnelTotals), real Instagram posts + AI verdicts
 * (buildCommandCenter), real SWOT/clusters, real follower snapshots. Only the
 * presentation changed to this end-to-end funnel layout.
 */

// Palette from Sean's design.
const C = {
  bg: "#F4F0E8", cream: "#FAF7F2", card: "#FFFFFF", charcoal: "#1A1A1A",
  gold: "#C9A961", sage: "#7C9A7E", red: "#C76B5C", mute: "#8A8378",
  line: "#E7E0D4", blue: "#6F8FA3",
};
const FUNNEL_COLORS = [C.sage, C.gold, C.blue, C.red];

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const cardStyle: React.CSSProperties = {
  background: C.card, borderRadius: 18, border: `1px solid ${C.line}`,
};

/* ── KPI card ───────────────────────────────────────────────── */
function Kpi({
  Icon, color, value, label, sub,
}: {
  Icon: LucideIcon;
  color: string; value: string; label: string; sub: string;
}) {
  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 11, background: color,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={19} color="#fff" />
      </div>
      <div className="font-display" style={{ fontSize: 28, color: C.charcoal, marginTop: 12, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: C.charcoal, fontWeight: 600, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: C.mute }}>{sub}</div>
    </div>
  );
}

/* ── Views → Trial funnel (real PostHog totals) ─────────────── */
function FunnelView({ t }: { t: FunnelTotals | null }) {
  const steps = [
    { s: "IG visitors", v: t?.igVisitors ?? 0 },
    { s: "Site visits", v: t?.sessions ?? 0 },
    { s: "Quiz starts", v: t?.quizStarts ?? 0 },
    { s: "Trials", v: t?.trials ?? 0 },
  ];
  const top = Math.max(steps[0].v, 1);

  // Real biggest-leak: lowest step-to-step conversion where the prior step > 0.
  let leakIdx = -1, leakConv = 101;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i - 1].v > 0) {
      const conv = (steps[i].v / steps[i - 1].v) * 100;
      if (conv < leakConv) { leakConv = conv; leakIdx = i; }
    }
  }

  return (
    <div style={{ ...cardStyle, borderRadius: 20, padding: 24 }}>
      <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 4 }}>
        <div className="flex items-center gap-2">
          <Target size={18} color={C.gold} />
          <h2 className="font-display" style={{ fontSize: 22, color: C.charcoal }}>Views → Trial funnel</h2>
        </div>
        <span style={{ fontSize: 12, color: C.mute }}>Last 7 days</span>
      </div>
      <p style={{ color: C.mute, fontSize: 13, marginBottom: 22 }}>
        Each step shows how many made it and the % that continued from the step above. The biggest drop is where to focus.
      </p>

      <div className="flex flex-col items-center gap-1">
        {steps.map((f, i) => {
          const pctOfTop = Math.max((f.v / top) * 100, 26);
          const conv = i === 0 || steps[i - 1].v === 0 ? null : ((f.v / steps[i - 1].v) * 100).toFixed(1);
          return (
            <div key={f.s} className="w-full flex flex-col items-center">
              {i > 0 ? (
                <div style={{ fontSize: 11.5, color: C.mute, fontWeight: 600, padding: "2px 0" }}>
                  ↓ {conv == null ? "—" : `${conv}%`} continued
                </div>
              ) : null}
              <div style={{
                width: `${pctOfTop}%`, minWidth: 200, background: FUNNEL_COLORS[i],
                borderRadius: 12, padding: "14px 18px", color: "#fff",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                boxShadow: "0 4px 14px rgba(0,0,0,.06)",
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{f.s}</span>
                <span className="font-display" style={{ fontSize: 20 }}>{f.v.toLocaleString()}</span>
              </div>
            </div>
          );
        })}
      </div>

      {leakIdx > 0 ? (
        <div style={{ background: C.cream, borderRadius: 12, padding: 14, marginTop: 20, fontSize: 13, color: C.charcoal, lineHeight: 1.5 }}>
          <b style={{ color: C.red }}>Biggest leak:</b> {steps[leakIdx - 1].s.toLowerCase()} → {steps[leakIdx].s.toLowerCase()} — only {leakConv.toFixed(1)}% continued. That step is where you&apos;re losing the most people; sharpen what moves them from {steps[leakIdx - 1].s.toLowerCase()} to {steps[leakIdx].s.toLowerCase()}.
        </div>
      ) : null}
    </div>
  );
}

/* ── Dark "your read" card — real auto-generated insight strings ─ */
function YourRead({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ background: C.charcoal, borderRadius: 18, padding: 20 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <GraduationCap size={18} color={C.gold} />
        <h2 className="font-display" style={{ fontSize: 18, color: C.cream }}>What&apos;s working · your read</h2>
      </div>
      <div className="flex flex-col gap-2">
        {items.slice(0, 5).map((l, i) => (
          <div key={i} className="flex items-start gap-2 riven-rise-in">
            <Check size={15} color={C.sage} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, color: "#E2DBCD", lineHeight: 1.45 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Clusters — what TYPE wins (real) ───────────────────────── */
function ClustersView({ clusters, note }: { clusters: Cluster[]; note: string | null }) {
  if (clusters.length === 0) return null;
  const max = Math.max(...clusters.map((c) => c.avgReach), 1);
  const verdict = (t: Cluster["trend"]) =>
    t === "up" ? { txt: "double down", c: C.sage } : t === "down" ? { txt: "rethink", c: C.red } : { txt: "tune", c: C.gold };
  return (
    <div style={{ ...cardStyle, borderRadius: 20, padding: 24 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 18 }}>
        <Compass size={18} color={C.gold} />
        <h2 className="font-display" style={{ fontSize: 20, color: C.charcoal }}>What&apos;s working · by pattern</h2>
      </div>
      <div className="flex flex-col gap-3">
        {clusters.map((c) => {
          const v = verdict(c.trend);
          return (
            <div key={c.key} className="flex items-center gap-3">
              <span style={{ width: 92, flexShrink: 0, fontSize: 14, color: C.charcoal, textTransform: "capitalize" }}>{c.key}</span>
              <div style={{ flex: 1, height: 8, borderRadius: 999, background: "rgba(26,26,26,.06)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 999, background: C.gold, width: `${Math.max(6, (c.avgReach / max) * 100)}%` }} />
              </div>
              <span className="font-display" style={{ width: 56, textAlign: "right", fontSize: 15, color: C.charcoal }}>{fmt(c.avgReach)}</span>
              <span style={{ width: 92, textAlign: "right", fontSize: 13, color: v.c, fontWeight: 600 }}>{v.txt}</span>
            </div>
          );
        })}
      </div>
      {note ? <p style={{ marginTop: 18, fontSize: 13, color: C.mute }}>{note}</p> : null}
    </div>
  );
}

/* ── SWOT (real) ────────────────────────────────────────────── */
function SwotView({ swot }: { swot: Swot }) {
  const quad = (title: string, items: string[], color: string) => (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
      <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color, fontWeight: 700, marginBottom: 10 }}>{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.length ? items.map((t, i) => (
          <li key={i} style={{ fontSize: 13, color: C.charcoal, lineHeight: 1.45, display: "flex", gap: 8 }}>
            <span style={{ color: C.mute }}>•</span><span>{t}</span>
          </li>
        )) : <li style={{ fontSize: 13, color: C.mute }}>—</li>}
      </ul>
    </div>
  );
  return (
    <div style={{ ...cardStyle, borderRadius: 20, padding: 24 }}>
      <h2 className="font-display" style={{ fontSize: 20, color: C.charcoal, marginBottom: 16 }}>This month · SWOT</h2>
      <div className="grid md:grid-cols-2 gap-3">
        {quad("Strengths", swot.strengths, C.sage)}
        {quad("Weaknesses", swot.weaknesses, C.red)}
        {quad("Opportunities", swot.opportunities, C.gold)}
        {quad("Threats", swot.threats, C.mute)}
      </div>
    </div>
  );
}

/* ── Hooks swipe file (real) ────────────────────────────────── */
function HooksView({ hooks, pattern }: { hooks: PostCard[]; pattern: string | null }) {
  if (hooks.length === 0) return null;
  return (
    <div style={{ ...cardStyle, borderRadius: 20, padding: 24 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
        <Sparkles size={18} color={C.gold} />
        <h2 className="font-display" style={{ fontSize: 20, color: C.charcoal }}>Your hooks · swipe file</h2>
      </div>
      <ul className="flex flex-col gap-2.5">
        {hooks.map((p) => (
          <li key={p.igId} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 12px" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
              <span className="font-display" style={{ fontSize: 15, color: C.charcoal }}>{fmt(p.reach)} reach</span>
              {p.contentType ? <span style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.mute }}>{p.contentType}</span> : null}
            </div>
            <p style={{ fontSize: 13, color: C.mute, lineHeight: 1.4 }}>{p.hook}</p>
          </li>
        ))}
      </ul>
      {pattern ? (
        <div style={{ marginTop: 16, background: "rgba(201,169,97,.12)", border: `1px solid rgba(201,169,97,.35)`, borderRadius: 12, padding: 14, fontSize: 13, color: C.charcoal }}>
          💡 {pattern}
        </div>
      ) : null}
    </div>
  );
}

/* ── Map PostCard → autopsy client props (unchanged wiring) ─── */
function toAutopsy(p: PostCard): AutopsyPost {
  return {
    igId: p.igId,
    hook: p.hook || p.caption,
    dateLabel: p.publishedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    contentType: p.contentType,
    verdict: p.verdict,
    reach: p.reach,
    saved: p.saved,
    avgWatchSec: p.avgWatchSec,
    quizStarts: p.quizStarts,
    trials: p.trials,
    whyItWorks: p.whyItWorks,
    flopReason: p.flopReason,
    permalink: p.permalink,
  };
}

export default async function CoachInsightsPage() {
  const cc = await buildCommandCenter();

  let totals: FunnelTotals | null = null;
  let posthogError: string | null = null;
  if (isPosthogQueryConfigured) {
    try {
      totals = await fetchFunnelTotals(7);
    } catch (e) {
      posthogError = e instanceof Error ? e.message : "PostHog query failed.";
    }
  }

  const snaps = await prisma.igAccountSnapshot.findMany({
    orderBy: { capturedAt: "asc" },
    take: 60,
    select: { followers: true },
  });
  const followerSeries = snaps.map((s) => s.followers).filter((n): n is number => n != null);
  const followerDelta =
    followerSeries.length >= 2 ? followerSeries[followerSeries.length - 1] - followerSeries[0] : null;

  const needsSetup = !isInstagramConfigured || !isPosthogQueryConfigured;
  const hooks = cc.posts.filter((p) => p.hook).sort((a, b) => b.reach - a.reach).slice(0, 5);
  const feed = [...cc.posts].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  // The dark "your read" card pulls real auto-generated strings.
  const read: string[] = [];
  if (cc.pattern) read.push(cc.pattern);
  if (cc.formatNote) read.push(cc.formatNote);
  for (const s of cc.swot.strengths.slice(0, 2)) read.push(s);
  for (const o of cc.swot.opportunities.slice(0, 1)) read.push(o);

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }} className="px-5 py-8 pb-32">
        {/* Header */}
        <div className="riven-rise-in flex items-end justify-between flex-wrap gap-4" style={{ marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: C.gold, fontWeight: 600 }}>RIVEN · POST LAB</div>
            <h1 className="font-display" style={{ fontSize: 36, color: C.charcoal, lineHeight: 1.05, marginTop: 6 }}>Your content, end to end</h1>
            <p style={{ color: C.mute, fontSize: 14, marginTop: 6 }}>
              From a stranger&apos;s first view to a trial started — and the read behind every post.
            </p>
          </div>
          <SyncButton />
        </div>

        {needsSetup ? (
          <div className="riven-rise-in" style={{ background: "rgba(201,169,97,.15)", border: `1px solid ${C.gold}`, borderRadius: 14, padding: 16, marginBottom: 20, fontSize: 13.5, color: C.charcoal }}>
            Finish setup: add{" "}
            {!isInstagramConfigured ? <code>INSTAGRAM_ACCESS_TOKEN</code> : null}
            {!isInstagramConfigured && !isPosthogQueryConfigured ? " + " : null}
            {!isPosthogQueryConfigured ? <code>POSTHOG_PERSONAL_API_KEY</code> : null} on Railway.
          </div>
        ) : null}

        {/* KPI row */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", marginBottom: 20 }}>
          <Kpi Icon={Eye} color={C.sage} value={fmt(totals?.igVisitors)} label="IG visitors" sub="came from your content" />
          <Kpi Icon={UserPlus} color={C.gold} value={fmt(cc.account.followers)}
            label="Followers" sub={followerDelta != null ? `${followerDelta >= 0 ? "+" : ""}${followerDelta} since tracking` : "net total"} />
          <Kpi Icon={MousePointerClick} color={C.blue} value={fmt(totals?.sessions)} label="Site visits" sub="tapped through" />
          <Kpi Icon={Rocket} color={C.red} value={fmt(totals?.trials)} label="Trials started" sub="came in the door" />
          <div style={{ ...cardStyle, padding: 18 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: C.charcoal, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowUpRight size={19} color="#fff" />
            </div>
            <div style={{ marginTop: 12 }}>
              <QualifiedDmsField current={cc.account.qualifiedDmsWeek} />
            </div>
          </div>
        </div>
        {posthogError ? (
          <p style={{ fontSize: 13, color: C.red, marginTop: -8, marginBottom: 16 }}>PostHog: {posthogError}</p>
        ) : null}

        {/* The funnel */}
        <div className="riven-rise-in" style={{ marginBottom: 18 }}>
          <FunnelView t={totals} />
        </div>

        {/* Dark read */}
        <div className="riven-rise-in" style={{ marginBottom: 18 }}>
          <YourRead items={read} />
        </div>

        {/* Clusters */}
        {cc.clusters.length ? (
          <div className="riven-rise-in" style={{ marginBottom: 18 }}>
            <ClustersView clusters={cc.clusters} note={cc.formatNote} />
          </div>
        ) : null}

        {/* SWOT */}
        {cc.hasData ? (
          <div className="riven-rise-in" style={{ marginBottom: 18 }}>
            <SwotView swot={cc.swot} />
          </div>
        ) : null}

        {/* Posts feed */}
        <div style={{ ...cardStyle, borderRadius: 20, padding: 24, marginBottom: 18 }}>
          <h2 className="font-display" style={{ fontSize: 20, color: C.charcoal, marginBottom: 4 }}>Every post · as it landed</h2>
          <p style={{ fontSize: 13, color: C.mute, marginBottom: 16 }}>
            Tap any post for the read — what worked, and what to tweak next time.
          </p>
          {cc.hasData ? (
            <div className="flex flex-col gap-1">
              {feed.map((p) => (
                <PostAutopsy key={p.igId} post={toAutopsy(p)} />
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 14, color: C.mute, textAlign: "center", padding: "32px 0" }}>
              No posts synced yet. Hit <b style={{ color: C.charcoal }}>Sync now</b> up top.
            </p>
          )}
        </div>

        {/* Hooks swipe file */}
        <div className="riven-rise-in" style={{ marginBottom: 18 }}>
          <HooksView hooks={hooks} pattern={cc.pattern} />
        </div>

        {/* What to post next */}
        <div className="riven-rise-in">
          <PostIdeas />
        </div>

        <p style={{ fontSize: 11.5, color: C.mute, textAlign: "center", marginTop: 24 }}>
          Live data — Instagram performance + your real signup funnel. Steady wins.
        </p>
      </div>
    </div>
  );
}
