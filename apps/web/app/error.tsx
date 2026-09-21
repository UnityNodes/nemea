"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/logo";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Wordmark />
        </div>
      </header>
      <main id="main" className="mx-auto flex min-h-[60dvh] max-w-3xl flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="display text-[clamp(2.6rem,7vw,4.4rem)]">Something slipped on our side</h1>
        <p role="alert" className="mt-4 max-w-xl text-lg text-muted">
          This page hit an unexpected problem. Your holdings and your funds are not affected. Try again, and if it keeps happening, come back in a few minutes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" onClick={reset}>
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ size: "lg", variant: "secondary" })}>
            Back to the start
          </Link>
        </div>
      </main>
    </>
  );
}
