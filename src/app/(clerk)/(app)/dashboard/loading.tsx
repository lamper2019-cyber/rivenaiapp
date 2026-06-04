import { Skeleton, SkeletonCard } from "@/components/skeleton";

// Shown automatically while the dashboard's server data loads. Mirrors the
// real layout — greeting, KPI row, then a couple of cards — so the page
// doesn't pop or shift when the real content arrives.
export default function DashboardLoading() {
  return (
    <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-8 space-y-section-gap">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-2/3" />
      </div>

      <div className="grid grid-cols-3 gap-gutter">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>

      <SkeletonCard />
      <SkeletonCard />
    </main>
  );
}
