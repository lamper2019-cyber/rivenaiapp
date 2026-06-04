import { Skeleton } from "@/components/skeleton";

// Loading state for the monthly/weekly check-in form.
export default function CheckInLoading() {
  return (
    <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-8 space-y-section-gap">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-1/2" />
      </div>
      <div className="grid grid-cols-2 gap-gutter">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-14 w-full rounded-full" />
    </main>
  );
}
