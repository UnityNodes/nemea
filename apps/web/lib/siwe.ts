"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConfig } from "wagmi";
import { connect, getAccount, signMessage } from "wagmi/actions";
import { createSiweMessage } from "viem/siwe";
import type { MeView } from "@nemea/shared-types";
import { api, errorMessage } from "./api.ts";
import { qk } from "./queries.ts";
import { writeSessionHint } from "./session-hint.ts";

type Nonce = { nonce: string; domain: string; uri: string };

function friendly(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  if (name === "ProviderNotFoundError") return "No browser wallet was found. Install one such as MetaMask or Rabby, or continue as a guest.";
  if (name === "UserRejectedRequestError" || code === 4001) return "The request was cancelled in your wallet. Nothing was signed.";
  return errorMessage(error);
}

export function useSiweSignIn() {
  const config = useConfig();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (): Promise<MeView | null> => {
    setPending(true);
    setError(null);
    try {
      const connector = config.connectors[0];
      if (!connector) throw new Error("No browser wallet was found. Install one such as MetaMask or Rabby, or continue as a guest.");
      const current = getAccount(config);
      let address = current.isConnected ? current.address : undefined;
      let chainId: number | undefined = current.chainId;
      if (!address) {
        const result = await connect(config, { connector });
        address = result.accounts[0];
        chainId = result.chainId;
      }
      if (!address || chainId === undefined) throw new Error("The wallet did not share an account.");
      const challenge = await api<Nonce>("/auth/siwe/nonce");
      const message = createSiweMessage({
        address,
        chainId,
        domain: challenge.domain,
        nonce: challenge.nonce,
        uri: challenge.uri,
        version: "1",
        statement: "Sign in to Nemea. This only proves you own this wallet. It cannot move funds and costs no gas.",
      });
      const signature = await signMessage(config, { message });
      const me = await api<MeView>("/auth/siwe/verify", { method: "POST", body: { message, signature } });
      writeSessionHint(true);
      client.setQueryData(qk.me, me);
      void client.invalidateQueries({ queryKey: qk.portfolio });
      void client.invalidateQueries({ queryKey: qk.alerts });
      return me;
    } catch (caught) {
      setError(friendly(caught));
      return null;
    } finally {
      setPending(false);
    }
  }, [client, config]);

  return { signIn, pending, error };
}
