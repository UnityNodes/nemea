import { z } from "zod";

export const CHAINS = ["ethereum", "base", "arbitrum"] as const;
export const Chain = z.enum(CHAINS);
export type Chain = z.infer<typeof Chain>;

export const CHAIN_IDS: Record<Chain, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
};

export const CHAIN_LABELS: Record<Chain, string> = {
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
};

export const EvmAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "not an EVM address");
export type EvmAddress = z.infer<typeof EvmAddress>;
