import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-busy="true">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="mt-6 h-20 w-full max-w-2xl" />
      <Skeleton className="mt-4 h-6 w-full max-w-md" />
    </main>
  );
}
