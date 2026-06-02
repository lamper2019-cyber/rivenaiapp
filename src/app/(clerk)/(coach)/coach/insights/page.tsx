import { prisma } from "@/lib/prisma";
import { buildCommandCenter, type PostCard, type Cluster, type Swot } from "@/lib/insights";
import {
  isPosthogQueryConfigured,
  fetchFunnelTotals,
  type FunnelTotals,
} from "@/lib/posthog-insights";
import { isInstagramConfigured } from "@/lib/instagram";
import { SyncButton } from "./sync-button";
import { QualifiedDmsField } from "./qualified-dms-field";
import { PostIdeas } from "./post-ideas";
import { PostAutopsy, type AutopsyPost } from "./post-autopsy";

// Always fresh — low-traffic coach page, numbers change on every sync.
export const dynamic = "force-dynamic";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ── KPI stat card ──────────────────────────────────────────── */
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/50 bg-white/50 px-gutter py-5">
      <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant/80 text-[10px] mb-3">
        {label}
      </p>
      <span className="font-display text-headline-md text-charcoal leading-none">{value}</span>
    </div>
  );
}

/* ── Conversion funnel (IG → site → quiz → trial) ───────────── */
function Funnel({ t }: { t: FunnelTotals | null }) {
  const steps = [
    { n: t?.igVisitors ?? 0, label: "Visitors", h: "h-full", bg: "bg-charcoal/[0.06]" },
    { n: t?.sessions ?? 0, label: "Site", h: "h-[80%]", bg: "bg-charcoal/[0.10]" },
    { n: t?.quizStarts ?? 0, label: "Quiz", h: "h-[58%]", bg: "bg-charcoal/[0.14]" },
    { n: t?.trials ?? 0, label: "Trial", h: "h-[38%]", bg: "bg-gold/30" },
  ];
  return (
    <div className="rounded-2xl border border-outline-variant/50 bg-white/50 px-gutter py-6">
      <div className="flex items-center justify-between mb-8">
        <h3 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
          The conversion funnel
        </h3>
        <span className="font-body text-label-md text-on-surface-variant/60">Last 7 days</span>
      </div>
      <div className="flex items-end h-28 gap-1.5">
        {steps.map((s) => (
          <div key={s.label} className={`flex-1 ${s.h} ${s.bg} rounded-md flex flex-col items-center justify-center`}>
            <span className="font-display text-headline-md text-charcoal leading-none">{s.n}</span>
            <span className="font-body text-[10px] tracking-widest uppercase text-on-surface-variant/70 mt-1">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Follower momentum sparkline (real snapshots) ───────────── */
function Momentum({ series }: { series: number[] }) {
  const W = 320, H = 90, pad = 6;
  let path: string | null = null;
  if (series.length >= 2) {
    const min = Math.min(...series), max = Math.max(...series);
    const span = max - min || 1;
    path = series
      .map((v, i) => {
        const x = pad + (i / (series.length - 1)) * (W - pad * 2);
        const y = pad + (1 - (v - min) / span) * (H - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }
  return (
    <div className="rounded-2xl border border-outline-variant/50 bg-white/50 px-gutter py-6">
      <h3 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-4">
        Follower momentum
      </h3>
      {path ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Follower trend">
          <path d={path} fill="none" stroke="currentColor" className="text-gold" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <p className="font-body text-label-md text-on-surface-variant/70 py-6 text-center">
          Building history — the trend line fills in as the daily sync runs.
        </p>
      )}
    </div>
  );
}

/* ── Top post hero card ─────────────────────────────────────── */
function HeroPost({ p }: { p: PostCard }) {
  return (
    <div className="border-l-4 border-gold pl-5 py-2">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xl leading-none">🥇</span>
        {p.contentType ? (
          <span className="rounded-full bg-surface-container-lowest border border-outline-variant/60 px-3 py-0.5 font-body text-[10px] tracking-widest uppercase text-on-surface-variant">
            {p.contentType}
          </span>
        ) : null}
      </div>
      <p className="font-body text-body-lg font-semibold text-charcoal mb-4">
        {p.permalink ? (
          <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="hover:text-gold transition-colors">
            {p.hook || p.caption}
          </a>
        ) : (
          p.hook || p.caption
        )}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <HeroStat label="Reach" value={fmt(p.reach)} />
        <HeroStat label="Avg watch" value={p.avgWatchSec != null ? `${p.avgWatchSec}s` : "—"} />
        <HeroStat label="Saves" value={fmt(p.saved)} />
        <HeroStat label="Conversions" value={`${p.trials} trial${p.trials === 1 ? "" : "s"}`} gold />
      </div>
      {p.whyItWorks ? (
        <div className="rounded-xl bg-charcoal/[0.03] border border-outline-variant/20 px-4 py-3">
          <p className="font-body text-label-md text-on-surface-variant italic">
            🧠 <span className="font-semibold text-charcoal not-italic">AI insight:</span> {p.whyItWorks}
          </p>
        </div>
      ) : null}
    </div>
  );
}
function HeroStat({ label, value, gold = false }: { label: string; value: string; gold?: boolean }) {
  return (
    <div>
      <p className="font-body text-[10px] tracking-widest uppercase text-on-surface-variant/60">{label}</p>
      <p className={`font-display text-body-lg ${gold ? "text-gold" : "text-charcoal"}`}>{value}</p>
    </div>
  );
}

/* ── Pattern clusters (what TYPE wins) ──────────────────────── */
function ClustersStrip({ clusters, note }: { clusters: Cluster[]; note: string | null }) {
  if (clusters.length === 0) return null;
  const max = Math.max(...clusters.map((c) => c.avgReach), 1);
  const verdict = (t: Cluster["trend"]) =>
    t === "up" ? { txt: "double down", cls: "text-sage" } : t === "down" ? { txt: "rethink", cls: "text-soft-red" } : { txt: "tune", cls: "text-gold" };
  return (
    <section className="riven-rise-in rounded-2xl border border-outline-variant/50 bg-white/50 px-gutter py-6">
      <h3 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-5">
        What&apos;s working · by pattern
      </h3>
      <div className="space-y-3">
        {clusters.map((c) => {
          const v = verdict(c.trend);
          return (
            <div key={c.key} className="flex items-center gap-3">
              <span className="w-20 sm:w-24 shrink-0 font-body text-body-md text-charcoal capitalize">{c.key}</span>
              <div className="flex-1 h-2 rounded-full bg-charcoal/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(6, (c.avgReach / max) * 100)}%` }} />
              </div>
              <span className="w-14 text-right font-display text-body-md text-charcoal">{fmt(c.avgReach)}</span>
              <span className={`w-24 text-right font-body text-label-md ${v.cls}`}>{v.txt}</span>
            </div>
          );
        })}
      </div>
      {note ? <p className="mt-5 font-body text-label-md text-on-surface-variant">{note}</p> : null}
    </section>
  );
}

/* ── SWOT board ─────────────────────────────────────────────── */
function SwotBoard({ swot }: { swot: Swot }) {
  const quad = (title: string, items: string[], cls: string) => (
    <div className="rounded-xl border border-outline-variant/40 p-4">
      <p className={`font-body text-label-md tracking-widest uppercase ${cls} mb-2.5`}>{title}</p>
      <ul className="space-y-1.5">
        {items.length ? (
          items.map((t, i) => (
            <li key={i} className="font-body text-label-md text-charcoal flex gap-2">
              <span className="text-on-surface-variant/40">•</span>
              <span>{t}</span>
            </li>
          ))
        ) : (
          <li className="font-body text-label-md text-on-surface-variant/50">—</li>
        )}
      </ul>
    </div>
  );
  return (
    <section className="riven-rise-in rounded-2xl border border-outline-variant/50 bg-white/50 px-gutter py-6">
      <h3 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-5">
        This month · SWOT
      </h3>
      <div className="grid md:grid-cols-2 gap-3">
        {quad("Strengths", swot.strengths, "text-sage")}
        {quad("Weaknesses", swot.weaknesses, "text-soft-red")}
        {quad("Opportunities", swot.opportunities, "text-gold")}
        {quad("Threats", swot.threats, "text-on-surface-variant")}
      </div>
    </section>
  );
}

/* ── Map a PostCard → the client autopsy row's props ────────── */
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

  // Follower momentum series from stored daily snapshots.
  const snaps = await prisma.igAccountSnapshot.findMany({
    orderBy: { capturedAt: "asc" },
    take: 60,
    select: { followers: true },
  });
  const followerSeries = snaps.map((s) => s.followers).filter((n): n is number => n != null);

  const needsSetup = !isInstagramConfigured || !isPosthogQueryConfigured;
  const top = cc.posts[0];
  const hooks = cc.posts.filter((p) => p.hook).sort((a, b) => b.reach - a.reach).slice(0, 5);
  // The feed shows EVERY post as it landed (chronological), not just top.
  const feed = [...cc.posts].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-6xl mx-auto py-10 pb-32 space-y-gutter">
      {/* Header */}
      <header className="riven-rise-in flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Command Center
          </p>
          <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
            Content Performance
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Ranked by what drove RIVEN — not by views.
          </p>
        </div>
        <SyncButton />
      </header>

      {needsSetup ? (
        <section className="riven-rise-in rounded-2xl border border-gold/60 bg-gold/15 px-gutter py-4">
          <p className="font-body text-body-md text-charcoal">
            Finish setup: add{" "}
            {!isInstagramConfigured ? <code>INSTAGRAM_ACCESS_TOKEN</code> : null}
            {!isInstagramConfigured && !isPosthogQueryConfigured ? " + " : null}
            {!isPosthogQueryConfigured ? <code>POSTHOG_PERSONAL_API_KEY</code> : null} on Railway.
          </p>
        </section>
      ) : null}

      {/* KPI grid */}
      <section className="riven-rise-in grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="IG visitors" value={fmt(totals?.igVisitors)} />
        <Kpi label="Link → site" value={fmt(totals?.sessions)} />
        <Kpi label="Quiz starts" value={fmt(totals?.quizStarts)} />
        <Kpi label="Trials" value={fmt(totals?.trials)} />
        <Kpi label="Followers" value={fmt(cc.account.followers)} />
        <QualifiedDmsField current={cc.account.qualifiedDmsWeek} />
      </section>
      {posthogError ? (
        <p className="font-body text-label-md text-soft-red -mt-2">PostHog: {posthogError}</p>
      ) : null}

      {/* Funnel + momentum */}
      <section className="riven-rise-in grid lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-7">
          <Funnel t={totals} />
        </div>
        <div className="lg:col-span-5">
          <Momentum series={followerSeries} />
        </div>
      </section>

      {/* Pattern clusters — what TYPE wins */}
      <ClustersStrip clusters={cc.clusters} note={cc.formatNote} />

      {/* SWOT — the strategy read */}
      {cc.hasData ? <SwotBoard swot={cc.swot} /> : null}

      {/* Feed + right rail */}
      <section className="grid lg:grid-cols-12 gap-gutter items-start">
        {/* Main column: top performer + chronological feed */}
        <div className="lg:col-span-8 space-y-gutter">
          {cc.hasData && top ? (
            <div className="riven-rise-in rounded-2xl border border-gold/40 bg-white/50 px-gutter py-6">
              <h3 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-4">
                Top performer
              </h3>
              <HeroPost p={top} />
            </div>
          ) : null}

          <div className="riven-rise-in rounded-2xl border border-outline-variant/50 bg-white/50 px-gutter py-6">
            <h3 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-3">
              Content feed · as they land
            </h3>
            {cc.hasData ? (
              <div className="space-y-1">
                {feed.map((p) => (
                  <PostAutopsy key={p.igId} post={toAutopsy(p)} />
                ))}
              </div>
            ) : (
              <p className="font-body text-body-md text-on-surface-variant py-8 text-center">
                No posts synced yet. Hit <span className="text-charcoal">Sync now</span>.
              </p>
            )}
          </div>
        </div>

        {/* Right rail */}
        <div className="lg:col-span-4 space-y-gutter">
          {/* Hooks swipe file */}
          {hooks.length > 0 ? (
            <div className="riven-rise-in rounded-2xl border border-outline-variant/50 bg-white/50 px-gutter py-6">
              <h3 className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-4">
                Your hooks · swipe file
              </h3>
              <ul className="space-y-2.5">
                {hooks.map((p) => (
                  <li key={p.igId} className="rounded-xl border border-outline-variant/30 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-display text-body-md text-charcoal">{fmt(p.reach)} reach</span>
                      {p.contentType ? (
                        <span className="font-body text-[9px] tracking-widest uppercase text-on-surface-variant/60">
                          {p.contentType}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-body text-label-md text-on-surface-variant line-clamp-2">{p.hook}</p>
                  </li>
                ))}
              </ul>
              {cc.pattern ? (
                <div className="mt-4 rounded-xl bg-gold/10 border border-gold/30 px-4 py-3">
                  <p className="font-body text-label-md text-charcoal">💡 {cc.pattern}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* What to post next */}
          <div className="riven-rise-in">
            <PostIdeas />
          </div>
        </div>
      </section>
    </main>
  );
}
