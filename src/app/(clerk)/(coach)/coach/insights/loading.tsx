import { Skeleton, SkeletonCard } from "@/components/skeleton";

// Loading state for the coach Content Command Center — KPI grid, funnel, then
// the content feed. This page does the most server work (Instagram + PostHog),
// so a skeleton here matters most.
export default function InsightsLoading() {
  return (
    <main className="px-container-mobile md:px-container-desktop max-w-4xl mx-auto py-8 space-y-section-gap">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-1/2" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>

      <Skeleton className="h-40 rounded-lg" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </main>
  );
}
