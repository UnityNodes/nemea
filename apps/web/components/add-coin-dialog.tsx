"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search, TriangleAlert } from "lucide-react";
import type { TokenLookupCandidate } from "@nemea/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { isBlank, parsePositive } from "@/lib/parse";
import { useAddHolding, useLookup } from "@/lib/queries";

function AddCoinForm({ onDone }: { onDone: () => void }) {
  const lookup = useLookup();
  const add = useAddHolding();
  const [symbol, setSymbol] = useState("");
  const [searched, setSearched] = useState("");
  const [candidates, setCandidates] = useState<TokenLookupCandidate[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);

  const search = (event: FormEvent) => {
    event.preventDefault();
    const value = symbol.trim();
    if (!value) return;
    lookup.mutate(value, {
      onSuccess: (data) => {
        setSearched(value.toUpperCase());
        setCandidates(data.candidates);
        setPicked(data.candidates.length === 1 ? (data.candidates[0]?.cmcId ?? null) : null);
        add.reset();
      },
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (picked === null) return;
    const parsedAmount = parsePositive(amount);
    const parsedCost = isBlank(cost) ? null : parsePositive(cost);
    setAmountError(parsedAmount === null ? "Enter an amount greater than zero." : null);
    setCostError(!isBlank(cost) && parsedCost === null ? "Enter a price greater than zero, or leave this empty." : null);
    if (parsedAmount === null || (!isBlank(cost) && parsedCost === null)) return;
    add.mutate({ cmcId: picked, amount: parsedAmount, costBasisUsd: parsedCost }, { onSuccess: onDone });
  };

  const sameSymbol = candidates ? candidates.filter((c) => c.symbol.toUpperCase() === searched).length : 0;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={search} className="flex flex-col gap-2" noValidate>
        <Label htmlFor="coin-symbol">Coin symbol</Label>
        <div className="flex gap-2">
          <Input id="coin-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} aria-describedby="coin-symbol-hint" className="uppercase" />
          <Button type="submit" variant="secondary" loading={lookup.isPending} disabled={!symbol.trim()}>
            <Search className="size-4" aria-hidden />
            Find
          </Button>
        </div>
        <FieldHint id="coin-symbol-hint">The short ticker, for example ETH, BTC or USDC.</FieldHint>
      </form>

      <div aria-live="polite" className="flex flex-col gap-4">
        {lookup.isError ? <FieldError>{errorMessage(lookup.error)}</FieldError> : null}
        {candidates !== null && candidates.length === 0 ? <p className="rounded-[var(--radius-control)] bg-sunken p-3 text-sm text-muted">No coin with the symbol {searched} was found. Check the spelling, or try the ticker shown on your exchange.</p> : null}
        {candidates !== null && candidates.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold">Which one is yours?</legend>
            {sameSymbol > 1 ? (
              <div className="flex items-start gap-2 rounded-[var(--radius-control)] bg-warn-soft p-3 text-sm text-warn-text">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  Several different coins use the symbol {searched}. Pick the one you own by its name. The most established one is listed first.
                </p>
              </div>
            ) : null}
            <ul className="flex flex-col gap-2">
              {candidates.map((c) => (
                <li key={c.cmcId}>
                  <label
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border bg-surface p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-safe-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                      picked === c.cmcId ? "border-primary" : "border-line-strong",
                    )}
                  >
                    <input type="radio" name="coin" value={c.cmcId} checked={picked === c.cmcId} onChange={() => setPicked(c.cmcId)} className="size-5 shrink-0 accent-[var(--primary)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {c.name} <span className="font-normal text-muted">({c.symbol})</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
                        <span>{c.rank === null ? "No market rank" : `Ranked #${c.rank} by market size`}</span>
                        {c.isStablecoin ? <Badge tone="info">Stablecoin</Badge> : null}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}
      </div>

      {picked !== null ? (
        <form onSubmit={submit} className="flex flex-col gap-5 border-t border-line pt-5" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="coin-amount">How many do you hold?</Label>
            <Input id="coin-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={amountError ? true : undefined} aria-describedby={amountError ? "coin-amount-error" : undefined} />
            {amountError ? <FieldError id="coin-amount-error">{amountError}</FieldError> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="coin-cost">Price you paid per coin, in USD (optional)</Label>
            <Input id="coin-cost" inputMode="decimal" autoComplete="off" value={cost} onChange={(e) => setCost(e.target.value)} aria-describedby="coin-cost-hint" />
            <FieldHint id="coin-cost-hint">Used only to show how far the price is from what you paid.</FieldHint>
            {costError ? <FieldError>{costError}</FieldError> : null}
          </div>
          <div aria-live="polite">{add.isError ? <FieldError>{errorMessage(add.error)}</FieldError> : null}</div>
          <Button type="submit" loading={add.isPending}>
            Add to my portfolio
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function AddCoinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!open) setGeneration((g) => g + 1);
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a coin" description="Search by symbol, pick the right coin, then tell Nemea how many you hold.">
        <AddCoinForm key={generation} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
