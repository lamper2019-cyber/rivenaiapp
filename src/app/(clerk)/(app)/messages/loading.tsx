import { Skeleton, SkeletonCard } from "@/components/skeleton";

// Loading state for the coach-message inbox.
export default function MessagesLoading() {
  return (
    <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-8 space-y-section-gap">
      <Skeleton className="h-8 w-40" />
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </main>
  );
}
