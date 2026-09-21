"use client";

import { Clock, TriangleAlert } from "lucide-react";
import type { PortfolioView } from "@nemea/shared-types";
import { Missing } from "@/components/missing";
import { Pct } from "@/components/pct";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatUsd, relativeTime } from "@/lib/format";
import { usePortfolio, useNow } from "@/lib/queries";

export function PortfolioSummary() {
  const portfolio = usePortfolio(true);
  const now = useNow();

  if (portfolio.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-14 w-72 max-w-full" />
        <Skeleton className="h-4 w-56" />
      </div>
    );
  }
  if (portfolio.isError) {
    return (
      <div role="alert" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
        <p className="font-semibold">Your portfolio could not be loaded.</p>
        <p className="mt-1 text-sm text-muted">{errorMessage(portfolio.error)}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void portfolio.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return <SummaryBody view={portfolio.data} now={now} />;
}

function SummaryBody({ view, now }: { view: PortfolioView; now: number }) {
  const staleCount = view.holdings.filter((h) => h.quoteStale && h.priceUsd !== null).length;
  const empty = view.holdings.length === 0;
  return (
    <section aria-labelledby="value-heading">
      <h1 id="value-heading" className="text-sm font-semibold text-muted">
        Portfolio value
      </h1>
      {view.totalValueUsd === null ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Missing reason={empty ? "Add a coin to see a total" : "No coin in your portfolio has a price yet"} className="text-4xl font-semibold" />
          <span className="text-muted">{empty ? "Add a coin to see your total." : "The total appears once at least one coin has a price."}</span>
        </p>
      ) : (
        <div className="mt-1 flex flex-wrap items-end gap-x-5 gap-y-2">
          <p className="num text-[clamp(2.4rem,7vw,3.6rem)] font-semibold leading-none tracking-tight">{formatUsd(view.totalValueUsd)}</p>
          <p className="flex items-center gap-2 pb-0.5 text-sm">
            <Pct value={view.change24hPct} missing="24-hour change is not available yet" className="text-base" />
            <span className="text-muted">in 24 hours</span>
          </p>
        </div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
        <Clock className="size-4 shrink-0" aria-hidden />
        {view.updatedAt ? (
          <span title={formatDateTime(view.updatedAt)}>Prices updated {relativeTime(view.updatedAt, now)}</span>
        ) : (
          <span>{empty ? "Prices appear once you add a coin" : "No price data has arrived yet"}</span>
        )}
      </p>
      {staleCount > 0 ? (
        <div role="status" className="mt-4 flex max-w-2xl items-start gap-3 rounded-[var(--radius-control)] border border-warn-solid/40 bg-warn-soft p-3.5 text-warn-text">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="font-semibold">Stale data.</span> {staleCount === 1 ? "One price is" : `${staleCount} prices are`} older than expected, so the numbers below may not match the market right now.
          </p>
        </div>
      ) : null}
      {view.unpricedCount > 0 && !empty ? (
        <p className="mt-3 max-w-2xl text-sm text-muted">
          {view.unpricedCount === 1 ? "One coin has" : `${view.unpricedCount} coins have`} no price yet, so {view.unpricedCount === 1 ? "it is" : "they are"} left out of the total.
        </p>
      ) : null}
    </section>
  );
}
