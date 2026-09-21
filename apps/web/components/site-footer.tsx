import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { Disclaimer } from "@/components/disclaimer";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-sunken/60">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex flex-col gap-5">
          <Wordmark />
          <Disclaimer className="max-w-2xl" />
        </div>
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted">
          <li className="inline-flex min-h-11 items-center">Built by Unity Nodes</li>
          <li className="inline-flex min-h-11 items-center">MIT licensed</li>
          <li>
            <Link href="/status" className="inline-flex min-h-11 items-center rounded-md font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              System status
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
