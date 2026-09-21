"use client";

import { useState, type FormEvent } from "react";
import type { PricedHoldingView } from "@nemea/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { isBlank, parsePositive, toInputString } from "@/lib/parse";
import { useDeleteHolding, useUpdateHolding } from "@/lib/queries";

function EditForm({ holding, onClose }: { holding: PricedHoldingView; onClose: () => void }) {
  const update = useUpdateHolding();
  const [amount, setAmount] = useState(toInputString(holding.amount));
  const [cost, setCost] = useState(holding.costBasisUsd === null ? "" : toInputString(holding.costBasisUsd));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedAmount = parsePositive(amount);
    const parsedCost = isBlank(cost) ? null : parsePositive(cost);
    setAmountError(parsedAmount === null ? "Enter an amount greater than zero." : null);
    setCostError(!isBlank(cost) && parsedCost === null ? "Enter a price greater than zero, or leave this empty." : null);
    if (parsedAmount === null || (!isBlank(cost) && parsedCost === null)) return;
    update.mutate({ id: holding.id, amount: parsedAmount, costBasisUsd: parsedCost }, { onSuccess: onClose });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {holding.source === "wallet" ? <FieldHint>This holding came from a wallet import. Importing that wallet again will replace what you enter here.</FieldHint> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-amount">Amount of {holding.symbol} you hold</Label>
        <Input id="edit-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={amountError ? true : undefined} aria-describedby={amountError ? "edit-amount-error" : undefined} />
        {amountError ? <FieldError id="edit-amount-error">{amountError}</FieldError> : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-cost">Price you paid per coin, in USD (optional)</Label>
        <Input id="edit-cost" inputMode="decimal" autoComplete="off" value={cost} onChange={(e) => setCost(e.target.value)} aria-invalid={costError ? true : undefined} aria-describedby="edit-cost-hint" />
        <FieldHint id="edit-cost-hint">Used only to show how far the price is from what you paid.</FieldHint>
        {costError ? <FieldError>{costError}</FieldError> : null}
      </div>
      {update.isError ? <FieldError>{errorMessage(update.error)}</FieldError> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" loading={update.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export function EditHoldingDialog({ holding, onClose }: { holding: PricedHoldingView | null; onClose: () => void }) {
  return (
    <Dialog open={holding !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {holding ? (
        <DialogContent title={`Edit ${holding.symbol}`} description={holding.name}>
          <EditForm key={holding.id} holding={holding} onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

export function DeleteHoldingDialog({ holding, onClose }: { holding: PricedHoldingView | null; onClose: () => void }) {
  const remove = useDeleteHolding();
  return (
    <Dialog open={holding !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {holding ? (
        <DialogContent title={`Remove ${holding.symbol}?`} description="This only removes it from what Nemea watches. Nothing happens to your funds.">
          <div className="flex flex-col gap-4">
            {remove.isError ? <FieldError>{errorMessage(remove.error)}</FieldError> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Keep it
                </Button>
              </DialogClose>
              <Button type="button" variant="danger" loading={remove.isPending} onClick={() => remove.mutate(holding.id, { onSuccess: onClose })}>
                Remove {holding.symbol}
              </Button>
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
