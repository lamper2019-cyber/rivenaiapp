import { Skeleton } from "@/components/skeleton";

// Loading state for the RIVEN chat: a few alternating message bubbles plus the
// composer bar, so the conversation view doesn't flash empty.
export default function ChatLoading() {
  return (
    <main className="px-container-mobile md:px-container-desktop max-w-2xl mx-auto py-8 flex flex-col gap-4">
      <Skeleton className="h-16 w-3/4 rounded-2xl" />
      <Skeleton className="h-12 w-1/2 rounded-2xl self-end" />
      <Skeleton className="h-20 w-4/5 rounded-2xl" />
      <Skeleton className="h-12 w-2/5 rounded-2xl self-end" />
      <Skeleton className="h-14 w-full rounded-full mt-auto" />
    </main>
  );
}
