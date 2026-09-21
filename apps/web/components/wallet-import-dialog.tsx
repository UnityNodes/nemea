"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CircleAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { CHAINS, CHAIN_LABELS, EvmAddress, type Chain, type WalletImportPreview } from "@nemea/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { formatAmount, shortAddress } from "@/lib/format";
import { useWalletConfirm, useWalletPreview } from "@/lib/queries";

function ImportForm({ onDone }: { onDone: () => void }) {
  const preview = useWalletPreview();
  const confirm = useWalletConfirm();
  const [address, setAddress] = useState("");
  const [chains, setChains] = useState<Chain[]>([...CHAINS]);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<WalletImportPreview | null>(null);
  const [readChains, setReadChains] = useState<Chain[]>([]);

  const toggle = (chain: Chain) => setChains((current) => (current.includes(chain) ? current.filter((c) => c !== chain) : [...current, chain]));

  const run = (event: FormEvent) => {
    event.preventDefault();
    const parsed = EvmAddress.safeParse(address.trim());
    if (!parsed.success) {
      setProblem("That is not a valid wallet address. It starts with 0x and has 42 characters.");
      return;
    }
    if (chains.length === 0) {
      setProblem("Pick at least one network to look at.");
      return;
    }
    setProblem(null);
    setResult(null);
    confirm.reset();
    preview.mutate(
      { address: parsed.data, chains },
      {
        onSuccess: (data) => {
          setResult(data);
          setReadChains(chains.filter((c) => !data.chainErrors.some((e) => e.chain === c)));
        },
      },
    );
  };

  const importAll = () => {
    if (!result || readChains.length === 0) return;
    confirm.mutate({ address: result.address, chains: readChains, items: result.items }, { onSuccess: onDone });
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-safe-soft p-3 text-sm text-safe-text">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>Read-only. Nemea looks at public balances only. It never asks for a signature, a key or a transaction.</span>
      </p>
      <form onSubmit={run} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wallet-address">Wallet address</Label>
          <Input id="wallet-address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono text-[0.95rem]" aria-invalid={problem ? true : undefined} aria-describedby={problem ? "wallet-address-error" : undefined} />
          {problem ? <FieldError id="wallet-address-error">{problem}</FieldError> : null}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Networks to look at</legend>
          <div className="flex flex-wrap gap-2">
            {CHAINS.map((chain) => (
              <label key={chain} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3.5 has-[:checked]:border-primary has-[:checked]:bg-safe-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
                <input type="checkbox" checked={chains.includes(chain)} onChange={() => toggle(chain)} className="size-5 accent-[var(--primary)]" />
                <span className="text-sm font-medium">{CHAIN_LABELS[chain]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" variant="secondary" loading={preview.isPending}>
          Preview what Nemea finds
        </Button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-4">
        {preview.isPending ? (
          <p className="rounded-[var(--radius-control)] bg-sunken p-3 text-sm text-muted" role="status">
            Reading balances on {chains.map((c) => CHAIN_LABELS[c]).join(", ")}. Public networks can be slow, so this may take up to half a minute.
          </p>
        ) : null}
        {preview.isError ? <FieldError>{errorMessage(preview.error)}</FieldError> : null}
        {result ? <PreviewResult result={result} /> : null}
        {confirm.isError ? <FieldError>{errorMessage(confirm.error)}</FieldError> : null}
      </div>

      {result && result.items.length > 0 ? (
        <div className="sticky -bottom-5 z-10 -mx-5 -mb-1 flex flex-col gap-2 border-t border-line bg-surface px-5 pb-4 pt-4">
          <FieldHint>Importing replaces anything you previously imported from this wallet on these networks. Coins you added by hand stay as they are.</FieldHint>
          <Button onClick={importAll} loading={confirm.isPending}>
            Import {result.items.length} {result.items.length === 1 ? "holding" : "holdings"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PreviewResult({ result }: { result: WalletImportPreview }) {
  return (
    <div className="flex flex-col gap-4">
      {result.chainErrors.length > 0 ? (
        <div role="alert" className="rounded-[var(--radius-control)] border border-warn-solid/40 bg-warn-soft p-3.5 text-sm text-warn-text">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4" aria-hidden />
            Some networks could not be read
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {result.chainErrors.map((e) => (
              <li key={e.chain}>
                <span className="font-semibold">{CHAIN_LABELS[e.chain]}:</span> {e.message}
              </li>
            ))}
          </ul>
          <p className="mt-2">Balances on these networks are missing from the list below. Try again in a moment.</p>
        </div>
      ) : null}

      {result.items.length > 0 ? (
        <div>
          <p className="text-sm font-semibold">
            Found {result.items.length} {result.items.length === 1 ? "holding" : "holdings"} in {shortAddress(result.address)}
          </p>
          <ul className="mt-2 divide-y divide-line rounded-[var(--radius-control)] border border-line bg-surface">
            {result.items.map((item) => (
              <li key={`${item.chain}-${item.cmcId}-${item.contractAddress ?? "native"}`} className="flex items-center justify-between gap-3 px-3.5 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold">{item.symbol}</span>
                  <span className="block truncate text-xs text-muted">{item.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  <span className="num text-sm font-medium">{formatAmount(item.amount)}</span>
                  <Badge tone="info" className="w-[4.75rem] justify-center">
                    {CHAIN_LABELS[item.chain]}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-sunken p-3.5 text-sm text-muted">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Nothing could be imported from {shortAddress(result.address)}.
            {result.chainErrors.length > 0 ? " Some networks failed to load, see above." : result.skipped.length > 0 ? " Every token found was skipped, see the reasons below." : " No supported token balances were found on the networks you picked."}
          </span>
        </p>
      )}

      {result.skipped.length > 0 ? (
        <details className="rounded-[var(--radius-control)] border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-3.5 text-sm font-semibold">Skipped tokens ({result.skipped.length})</summary>
          <ul className="divide-y divide-line border-t border-line">
            {result.skipped.map((s, i) => (
              <li key={`${s.chain}-${s.contractAddress ?? i}-${i}`} className="px-3.5 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.symbol ?? (s.contractAddress ? shortAddress(s.contractAddress) : "Unknown token")}</span>
                  <Badge tone="neutral">{CHAIN_LABELS[s.chain]}</Badge>
                </p>
                <p className="mt-1 text-muted">{s.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function WalletImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    if (!open) setGeneration((g) => g + 1);
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Import from a wallet" description="Paste a public address and Nemea reads its balances for you to review.">
        <ImportForm key={generation} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
