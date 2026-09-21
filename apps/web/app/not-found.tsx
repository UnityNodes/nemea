import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Wordmark />
        </div>
      </header>
      <main id="main" className="mx-auto flex min-h-[60dvh] max-w-3xl flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="display text-[clamp(2.8rem,8vw,5rem)]">
          This valley is <em className="pb-1 font-medium italic">empty.</em>
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
