import { Wordmark } from "@/components/logo";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Wordmark href="/app" />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-14 w-72 max-w-full" />
        <Skeleton className="mt-10 h-72" />
      </main>
    </>
  );
}
