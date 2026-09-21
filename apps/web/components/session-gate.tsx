"use client";

import type { ReactNode } from "react";
import { KeyRound } from "lucide-react";
import type { MeView } from "@nemea/shared-types";
import { StartGuestButton } from "@/components/start-guest";
import { WalletSignIn } from "@/components/wallet-signin";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/queries";

export function SessionGate({ children }: { children: (me: MeView) => ReactNode }) {
  const me = useMe();
  if (me.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-14 w-72 max-w-full" />
        <Skeleton className="mt-6 h-64" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <div role="alert" className="mx-auto max-w-lg rounded-[var(--radius-panel)] border border-line bg-surface p-6">
        <p className="font-semibold">Nemea could not check your session.</p>
        <p className="mt-1 text-muted">{errorMessage(me.error)}</p>
        <Button variant="secondary" className="mt-4" onClick={() => void me.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!me.data) {
    return (
      <div className="mx-auto mt-6 max-w-lg rounded-[var(--radius-panel)] border border-line bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8">
        <KeyRound className="size-7 text-primary" aria-hidden />
        <h1 className="display mt-3 text-3xl">Pick up where you left off</h1>
        <p className="mt-2 text-muted">There is no active session in this browser, or it has ended. Start as a guest to look around, or sign in with a wallet to keep your portfolio.</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <StartGuestButton size="md" />
          <WalletSignIn size="md" redirect={false} />
        </div>
      </div>
    );
  }
  return <>{children(me.data)}</>;
}
