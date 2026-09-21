import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("not-found");

export default function NotFound() {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Wordmark />
        </div>
      </header>
      <main id="main" className="mx-auto flex min-h-[60dvh] max-w-3xl flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="display text-[clamp(2.3rem,6.4vw,4rem)]">
          This valley is <em className="not-italic text-primary">empty.</em>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">The page you followed does not exist here. Nothing is wrong with your portfolio or your funds.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className={buttonVariants({ size: "lg" })}>
            Back to the start
          </Link>
          <Link href="/app" className={buttonVariants({ size: "lg", variant: "secondary" })}>
            Open the dashboard
          </Link>
        </div>
      </main>
    </>
  );
}
