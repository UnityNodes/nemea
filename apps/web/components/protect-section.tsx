"use client";

import { useState } from "react";
import { ArrowRightLeft, ExternalLink, Info, ShieldCheck } from "lucide-react";
import { CHAIN_LABELS, type SwapSuggestion } from "@nemea/shared-types";
import { Disclaimer } from "@/components/disclaimer";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { useActions, useSavePreferences } from "@/lib/queries";

const FRACTIONS = [
  { value: 0.25, label: "25%" },
  { value: 0.5, label: "50%" },
  { value: 1, label: "100%" },
];

function Suggestion({ suggestion }: { suggestion: SwapSuggestion }) {
  return (
    <li className="rounded-[var(--radius-panel)] border border-line-strong bg-surface p-4 sm:p-5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold">
        <ArrowRightLeft className="size-5 text-primary" aria-hidden />
        <span className="num">{formatAmount(suggestion.suggestedAmount)}</span> {suggestion.fromSymbol}
        <span className="font-normal text-muted">to</span> {suggestion.toSymbol}
      </p>
      <p className="mt-1 text-sm text-muted">
        On {CHAIN_LABELS[suggestion.chain]}. This is only a suggestion, and the amount is the share you picked above.
      </p>
      {suggestion.notes.length > 0 ? (
        <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-sm marker:text-muted">
          {suggestion.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2.5">
        {suggestion.uniswapUrl ? (
          <a href={suggestion.uniswapUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "primary", size: "md" })}>
            Open in Uniswap
            <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
        {suggestion.oneInchUrl ? (
          <a href={suggestion.oneInchUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary", size: "md" })}>
            Open in 1inch
            <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
        {!suggestion.uniswapUrl && !suggestion.oneInchUrl ? <p className="text-sm text-muted">No swap link could be built for this pair.</p> : null}
      </div>
      {suggestion.referralConfigured ? <p className="mt-3 text-xs text-muted">Nemea may earn a referral fee on swaps made through these links.</p> : null}
    </li>
  );
}

export function ProtectSection({ alertId, level }: { alertId: string; level: number }) {
  const [fraction, setFraction] = useState(0.5);
  const actions = useActions(alertId, fraction, level, true);
  const raise = useSavePreferences();

  return (
    <section id="protect" aria-labelledby="protect-heading" className="scroll-mt-24">
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--shadow-soft)] sm:p-7">
        <h2 id="protect-heading" className="display flex items-center gap-3 text-3xl sm:text-4xl">
          <ShieldCheck className="size-8 shrink-0 text-primary" aria-hidden />
          If you want to act
        </h2>
        <p className="mt-3 max-w-2xl text-muted">
          Doing nothing is a perfectly good choice. If you would rather move some of this coin into a stablecoin, Nemea can prepare a swap idea. Nemea cannot move anything for you. You open Uniswap or 1inch, check every detail, and confirm in your own wallet.
        </p>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">How much of your holding would the idea cover?</legend>
          <div role="radiogroup" aria-label="Share of your holding" className="mt-2 flex gap-2">
            {FRACTIONS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={fraction === f.value}
                onClick={() => setFraction(f.value)}
                className={cn(
                  "num h-11 min-w-20 rounded-full border px-5 font-semibold transition-colors",
                  fraction === f.value ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-surface hover:bg-sunken",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-6" aria-live="polite">
          {actions.isPending ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-28" />
            </div>
          ) : actions.isError ? (
            <div role="alert" className="rounded-[var(--radius-control)] border border-warn-solid/40 bg-warn-soft p-4 text-warn-text">
              <p className="font-semibold">{errorMessage(actions.error)}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => void actions.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {actions.data.level < 2 ? (
                <div className="rounded-[var(--radius-control)] bg-sunken p-4">
                  <p className="flex items-start gap-2">
                    <Info className="mt-0.5 size-4.5 shrink-0 text-muted" aria-hidden />
                    <span>{actions.data.unavailableReason ?? "Swap suggestions are switched off at protection level 1."}</span>
                  </p>
                  <p className="mt-2 text-sm text-muted">Level 2 only adds suggestions like this one. Nemea never signs or sends anything.</p>
                  <Button className="mt-3" onClick={() => raise.mutate({ protectionLevel: 2 })} loading={raise.isPending}>
                    Raise protection to level 2
                  </Button>
                  {raise.isError ? (
                    <p role="alert" className="mt-2 text-sm font-medium text-crit-text">
                      {errorMessage(raise.error)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  {actions.data.unavailableReason ? (
                    <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-sunken p-4">
                      <Info className="mt-0.5 size-4.5 shrink-0 text-muted" aria-hidden />
                      <span>{actions.data.unavailableReason}</span>
                    </p>
                  ) : null}
                  {actions.data.suggestions.length > 0 ? (
                    <ul className="flex flex-col gap-3">
                      {actions.data.suggestions.map((s) => (
                        <Suggestion key={`${s.chain}-${s.fromCmcId}-${s.toAddress}`} suggestion={s} />
                      ))}
                    </ul>
                  ) : !actions.data.unavailableReason ? (
                    <p className="rounded-[var(--radius-control)] bg-sunken p-4 text-muted">There is nothing to suggest for this alert.</p>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
        <Disclaimer className="mt-6 border-t border-line pt-4" />
      </div>
    </section>
  );
}
