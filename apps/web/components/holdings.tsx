"use client";

import { useState } from "react";
import { Download, Pencil, Plus, Sprout, Trash2, Wallet } from "lucide-react";
import { CHAIN_LABELS, type PricedHoldingView } from "@nemea/shared-types";
import { AddCoinDialog } from "@/components/add-coin-dialog";
import { DeleteHoldingDialog, EditHoldingDialog } from "@/components/holding-dialogs";
import { Missing } from "@/components/missing";
import { Pct } from "@/components/pct";
import { WalletImportDialog } from "@/components/wallet-import-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { formatAmount, formatPct, formatUsd, durationPhrase } from "@/lib/format";
import { useLoadSample, usePortfolio } from "@/lib/queries";

const NO_PRICE = "No price from CoinMarketCap yet";

function CostBasis({ holding }: { holding: PricedHoldingView }) {
  if (holding.costBasisUsd === null) return null;
  if (holding.costBasisDeltaPct === null) return <span className="text-xs text-muted">vs what you paid: needs a price</span>;
  return (
    <span className="num text-xs text-muted">
      {formatPct(holding.costBasisDeltaPct, 1)} vs what you paid
    </span>
  );
}

function PriceCell({ holding }: { holding: PricedHoldingView }) {
  if (holding.priceUsd === null) return <Missing reason={NO_PRICE} />;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      {holding.quoteStale ? (
        <Badge tone="warn" title={holding.quoteAgeSeconds === null ? "Age of this price is unknown" : `This price is ${durationPhrase(holding.quoteAgeSeconds)} old`}>
          Stale
        </Badge>
      ) : null}
      <span className="num">{formatUsd(holding.priceUsd)}</span>
    </span>
  );
}

function Origin({ holding }: { holding: PricedHoldingView }) {
  if (holding.source !== "wallet") return null;
  return (
    <Badge tone="info">
      <Wallet className="size-3" aria-hidden />
      {holding.chain ? CHAIN_LABELS[holding.chain] : "Wallet"}
    </Badge>
  );
}

function RowActions({ holding, onEdit, onDelete }: { holding: PricedHoldingView; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${holding.symbol}`}>
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Remove ${holding.symbol}`}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

export function Holdings() {
  const portfolio = usePortfolio(true);
  const sample = useLoadSample();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<PricedHoldingView | null>(null);
  const [removing, setRemoving] = useState<PricedHoldingView | null>(null);

  const holdings = portfolio.data?.holdings ?? [];

  return (
    <section aria-labelledby="holdings-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="holdings-heading" className="display text-3xl">
          Holdings
        </h2>
        {holdings.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Add a coin
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
              <Download className="size-4" aria-hidden />
              Import from wallet
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-4" aria-live="polite">
        {portfolio.isPending ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : portfolio.isError ? (
          <p role="alert" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 text-sm text-muted">
            {errorMessage(portfolio.error)}
          </p>
        ) : holdings.length === 0 ? (
          <div className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface p-6 sm:p-8">
            <Sprout className="size-7 text-primary" aria-hidden />
            <h3 className="mt-3 text-lg font-semibold">Nothing to watch yet</h3>
            <p className="mt-1 max-w-md text-muted">Add the coins you hold, or load a sample portfolio to see how Nemea works. Sample amounts are not yours and you can remove them any time.</p>
            <div className="mt-5">
              <Button onClick={() => sample.mutate()} loading={sample.isPending}>
                Load a sample portfolio
              </Button>
            </div>
            <p className="mt-6 text-sm font-semibold text-muted">Or use your own coins</p>
            <div className="mt-2 flex flex-wrap gap-2.5">
              <Button variant="secondary" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" aria-hidden />
                Add a coin
              </Button>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Download className="size-4" aria-hidden />
                Import from wallet
              </Button>
            </div>
            {sample.isError ? (
              <p role="alert" className="mt-3 text-sm font-medium text-crit-text">
                {errorMessage(sample.error)}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-soft)] md:block">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Your holdings with amount, price, 24 hour change and value</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold text-faint">
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Coin
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Amount
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Price
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      24h
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">
                      Value
                    </th>
                    <th scope="col" className="px-2 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {holdings.map((h) => (
                    <tr key={h.id} className="align-middle">
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold">{h.symbol}</span>
                          <Origin holding={h} />
                        </span>
                        <span className="block max-w-[11rem] truncate text-xs text-muted" title={h.name}>
                          {h.name}
                        </span>
                      </th>
                      <td className="num px-3 py-3 text-right">{formatAmount(h.amount)}</td>
                      <td className="px-3 py-3 text-right">
                        <PriceCell holding={h} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Pct value={h.percentChange24h} missing="24-hour change not available" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="num block font-semibold">{h.valueUsd === null ? <Missing reason={NO_PRICE} /> : formatUsd(h.valueUsd)}</span>
                        <CostBasis holding={h} />
                      </td>
                      <td className="px-2 py-2">
                        <RowActions holding={h} onEdit={() => setEditing(h)} onDelete={() => setRemoving(h)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2.5 md:hidden">
              {holdings.map((h) => (
                <li key={h.id} className="rounded-[var(--radius-panel)] border border-line bg-surface py-3 pl-4 pr-2">
                  <div className="flex items-start justify-between gap-3 pr-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{h.symbol}</span>
                        <Origin holding={h} />
                      </p>
                      <p className="truncate text-sm text-muted">{h.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="num font-semibold">{h.valueUsd === null ? <Missing reason={NO_PRICE} /> : formatUsd(h.valueUsd)}</p>
                      <p className="text-sm">
                        <Pct value={h.percentChange24h} missing="24-hour change not available" />
                      </p>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="min-w-0 text-sm text-muted">
                      <p className="flex flex-wrap items-center gap-x-1.5">
                        <span className="num">{formatAmount(h.amount)} at</span>
                        <PriceCell holding={h} />
                      </p>
                      {h.costBasisUsd !== null ? (
                        <p className="mt-0.5">
                          <CostBasis holding={h} />
                        </p>
                      ) : null}
                    </div>
                    <RowActions holding={h} onEdit={() => setEditing(h)} onDelete={() => setRemoving(h)} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <AddCoinDialog open={addOpen} onOpenChange={setAddOpen} />
      <WalletImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <EditHoldingDialog holding={editing} onClose={() => setEditing(null)} />
      <DeleteHoldingDialog holding={removing} onClose={() => setRemoving(null)} />
    </section>
  );
}
