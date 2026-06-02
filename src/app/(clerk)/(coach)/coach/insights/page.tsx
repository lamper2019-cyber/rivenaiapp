import { buildCommandCenter, type PostCard } from "@/lib/insights";
import {
  isPosthogQueryConfigured,
  fetchFunnelTotals,
  type FunnelTotals,
} from "@/lib/posthog-insights";
import { isInstagramConfigured } from "@/lib/instagram";
import { SyncButton } from "./sync-button";
import { QualifiedDmsField } from "./qualified-dms-field";

// Always fresh — this is a low-traffic coach page and the numbers change daily.
export const dynamic = "force-dynamic";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-headline-md text-charcoal leading-none">
        {value}
      </span>
      <span className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
        {label}
      </span>
    </div>
  );
}

function PostRow({ post, rank }: { post: PostCard; rank: number }) {
  const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : null;
  const won = post.trials > 0 || post.quizStarts > 0;
  return (
    <li
      className={`rounded-2xl border px-gutter py-4 ${
        post.flopReason
          ? "border-soft-red/40 bg-soft-red/5"
          : won
            ? "border-gold/50 bg-gold/[0.06]"
            : "border-outline-variant/50 bg-white/40"
      }`}
    >
      <div className="flex items-start gap-3">
        {medal ? (
          <span className="text-xl leading-none mt-0.5">{medal}</span>
        ) : (
          <span className="material-symbols-outlined text-on-surface-variant/50 text-base mt-0.5">
            {post.mediaType === "REELS" || post.mediaType === "VIDEO"
              ? "movie"
              : "image"}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-body text-body-md text-charcoal truncate">
            {post.permalink ? (
              <a
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gold transition-colors"
              >
                {post.caption}
              </a>
            ) : (
              post.caption
            )}
          </p>
          <p className="font-body text-label-md text-on-surface-variant mt-1">
            {fmt(post.reach)} reach
            {post.avgWatchSec != null ? ` · ${post.avgWatchSec}s avg watch` : ""}
            {` · ${fmt(post.saved)} saves`}
            {` · ${post.linkTaps} taps → ${post.quizStarts} quiz → ${post.trials} trial${
              post.trials === 1 ? "" : "s"
            }`}
          </p>
          {post.flopReason ? (
            <p className="font-body text-label-md text-soft-red mt-1.5">
              └─ {post.flopReason}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default async function CoachInsightsPage() {
  const cc = await buildCommandCenter();

  // Funnel headline numbers — live from PostHog when configured, else null.
  let totals: FunnelTotals | null = null;
  let posthogError: string | null = null;
  if (isPosthogQueryConfigured) {
    try {
      totals = await fetchFunnelTotals(7);
    } catch (e) {
      posthogError = e instanceof Error ? e.message : "PostHog query failed.";
    }
  }

  const needsSetup = !isInstagramConfigured || !isPosthogQueryConfigured;

  return (
    <main className="relative px-container-mobile md:px-container-desktop max-w-3xl mx-auto py-12 space-y-section-gap pb-32">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
            Coach
          </p>
          <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal">
            Content Command Center
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Your posts ranked by what drove RIVEN — not by views.
          </p>
        </div>
        <SyncButton />
      </header>

      {/* THIS WEEK strip */}
      <section className="rounded-2xl border border-outline-variant/50 bg-white/40 px-gutter py-5">
        <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-4">
          This week · last 7 days
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-5 gap-x-4">
          <Stat label="IG visitors" value={fmt(totals?.igVisitors)} />
          <Stat label="Link → site" value={fmt(totals?.sessions)} />
          <Stat label="Quiz starts" value={fmt(totals?.quizStarts)} />
          <Stat label="Trials" value={fmt(totals?.trials)} />
          <Stat label="Followers" value={fmt(cc.account.followers)} />
          <QualifiedDmsField current={cc.account.qualifiedDmsWeek} />
        </div>
        {posthogError ? (
          <p className="font-body text-label-md text-soft-red mt-4">
            PostHog: {posthogError}
          </p>
        ) : null}
      </section>

      {/* Setup notice */}
      {needsSetup ? (
        <section className="rounded-2xl border border-gold/60 bg-gold/15 px-gutter py-5 space-y-2">
          <p className="font-body text-label-md tracking-widest uppercase text-charcoal">
            Finish setup
          </p>
          <ul className="font-body text-body-md text-charcoal space-y-1.5 mt-2">
            {!isInstagramConfigured ? (
              <li>
                · Instagram not connected — add <code>INSTAGRAM_ACCESS_TOKEN</code>{" "}
                and <code>INSTAGRAM_BUSINESS_ACCOUNT_ID</code>.
              </li>
            ) : null}
            {!isPosthogQueryConfigured ? (
              <li>
                · PostHog not connected — add <code>POSTHOG_PERSONAL_API_KEY</code>{" "}
                and <code>POSTHOG_PROJECT_ID</code>.
              </li>
            ) : null}
          </ul>
          <p className="font-body text-label-md text-on-surface-variant pt-1">
            Until then the numbers above show what we can read; once both are
            set, the daily sync fills everything in.
          </p>
        </section>
      ) : null}

      {/* Posts */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-headline-md text-charcoal">Your posts</h2>
          <span className="font-body text-label-md text-on-surface-variant">
            ranked by business value
          </span>
        </div>

        {cc.hasData ? (
          <ul className="space-y-3">
            {cc.posts.map((p, i) => (
              <PostRow key={p.igId} post={p} rank={i} />
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-outline-variant/50 bg-white/40 px-gutter py-10 text-center">
            <p className="font-body text-body-md text-on-surface-variant">
              No posts synced yet. Connect Instagram and hit{" "}
              <span className="text-charcoal">Sync now</span> — your posts land here.
            </p>
          </div>
        )}
      </section>

      {/* Pattern line */}
      {cc.pattern ? (
        <section className="rounded-2xl border border-charcoal/15 bg-charcoal/[0.03] px-gutter py-5">
          <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant mb-1.5">
            Pattern
          </p>
          <p className="font-body text-body-md text-charcoal">{cc.pattern}</p>
        </section>
      ) : null}
    </main>
  );
}
