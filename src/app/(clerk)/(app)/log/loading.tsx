import { Skeleton, SkeletonCard } from "@/components/skeleton";

// Loading state for the meal-log page: the remaining-calories hero, the input
// area, and a couple of recent-meal rows.
export default function LogLoading() {
  return (
    <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-8 space-y-section-gap">
      <Skeleton className="h-32 rounded-lg" />
      <Skeleton className="h-28 rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </main>
  );
}
