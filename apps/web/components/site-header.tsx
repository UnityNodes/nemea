"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { StartGuestButton } from "@/components/start-guest";
import { cn } from "@/lib/cn";

const navLink = "hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:text-ink md:inline-flex";

export function MarketingHeader() {
  return (
    <header className="border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-1" aria-label="Main">
          <a href="/#how" className={navLink}>
            How it works
          </a>
          <a href="/#limits" className={navLink}>
            Honest limits
          </a>
          <Link href="/status" className={navLink}>
            Status
          </Link>
          <StartGuestButton size="sm" showError={false} className="ml-1" />
        </nav>
      </div>
    </header>
  );
}

export function AppHeader({ right, current }: { right?: ReactNode; current?: "dashboard" | "status" | "alert" }) {
  const link = (active: boolean) =>
    cn("inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors md:min-h-9", active ? "bg-sunken text-ink" : "text-muted hover:text-ink");
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Wordmark href="/app" />
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
            <Link href="/app" className={link(current === "dashboard")} aria-current={current === "dashboard" ? "page" : undefined}>
              Dashboard
            </Link>
            <Link href="/status" className={link(current === "status")} aria-current={current === "status" ? "page" : undefined}>
              Status
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/status" className={cn(link(current === "status"), "sm:hidden")}>
            Status
          </Link>
          {right}
        </div>
      </div>
    </header>
  );
}
