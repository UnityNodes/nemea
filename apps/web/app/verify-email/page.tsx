import type { Metadata } from "next";
import { Suspense } from "react";
import { Wordmark } from "@/components/logo";
import { VerifyEmail } from "@/components/verify-email";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default function VerifyEmailPage() {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Wordmark />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-xl px-4 py-14 sm:px-6">
        <Suspense fallback={<Skeleton className="h-40" />}>
          <VerifyEmail />
        </Suspense>
      </main>
    </>
  );
}
