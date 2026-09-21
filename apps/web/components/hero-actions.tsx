"use client";

import { StartGuestButton } from "@/components/start-guest";
import { WalletSignIn } from "@/components/wallet-signin";

export function HeroActions() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <StartGuestButton />
      <WalletSignIn />
    </div>
  );
}
