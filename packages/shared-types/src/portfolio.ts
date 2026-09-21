import { z } from "zod";
import { Chain } from "./chains.ts";
import type { QuoteSnapshot } from "./market.ts";

export const HoldingSource = z.enum(["manual", "wallet"]);
export type HoldingSource = z.infer<typeof HoldingSource>;

export const Holding = z.object({
  id: z.string(),
  cmcId: z.number().int(),
  symbol: z.string(),
  name: z.string(),
  amount: z.number().positive(),
  costBasisUsd: z.number().positive().nullable(),
  source: HoldingSource,
  chain: Chain.nullable(),
  contractAddress: z.string().nullable(),
  walletAddress: z.string().nullable(),
});
export type Holding = z.infer<typeof Holding>;

export const HoldingInput = z.object({
  cmcId: z.number().int().positive(),
  amount: z.number().positive().finite(),
  costBasisUsd: z.number().positive().finite().nullable().optional(),
});
export type HoldingInput = z.infer<typeof HoldingInput>;

export type PricedHolding = Holding & {
  quote: QuoteSnapshot | null;
  valueUsd: number | null;
};

export const HoldingTier = z.enum(["top", "small"]);
export type HoldingTier = z.infer<typeof HoldingTier>;

export const TOP_HOLDING_SHARE = 0.8;

export const MAX_HOLDINGS = 100;
