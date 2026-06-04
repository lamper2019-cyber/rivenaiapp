// Skeleton placeholders — the gray "shape of the content" blocks that show
// while a route's data loads, instead of a blank screen or a spinner. Next.js
// renders a route's loading.tsx automatically during the server fetch, so
// these compose into per-route loading screens.
//
// Brand notes: placeholders use the surface-container tone (not a harsh gray)
// so they feel like RIVEN, not a generic dashboard. The shimmer respects
// `prefers-reduced-motion` via `motion-reduce:animate-none` — per CLAUDE.md we
// never force motion on users who opted out.

import type { CSSProperties } from "react";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={style}
      className={`animate-pulse motion-reduce:animate-none rounded-md bg-surface-container ${className}`}
    />
  );
}

/** A stack of text-line placeholders (last line shortened, like real text). */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

/** A card-shaped placeholder for list/feed items. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-gold/20 bg-cream px-gutter py-5 space-y-3 ${className}`}
    >
      <Skeleton className="h-5 w-1/3" />
      <SkeletonText lines={2} />
    </div>
  );
}
