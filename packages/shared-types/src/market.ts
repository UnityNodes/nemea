import { z } from "zod";
import { Chain } from "./chains.ts";

const nullableNumber = z.number().nullable();

export const QuoteSnapshot = z.object({
  cmcId: z.number().int(),
  symbol: z.string(),
  name: z.string(),
  priceUsd: nullableNumber,
  percentChange1h: nullableNumber,
  percentChange24h: nullableNumber,
  percentChange7d: nullableNumber,
  percentChange30d: nullableNumber,
  volume24hUsd: nullableNumber,
  volumeChange24hPct: nullableNumber,
  marketCapUsd: nullableNumber,
  cmcRank: z.number().int().nullable(),
  cmcLastUpdated: z.string().nullable(),
  fetchedAt: z.string(),
});
export type QuoteSnapshot = z.infer<typeof QuoteSnapshot>;

export const TokenContract = z.object({
  chain: Chain,
  address: z.string(),
});
export type TokenContract = z.infer<typeof TokenContract>;

export const TokenMeta = z.object({
  cmcId: z.number().int(),
  symbol: z.string(),
  name: z.string(),
  slug: z.string(),
  tags: z.array(z.string()),
  category: z.string().nullable(),
  isStablecoin: z.boolean(),
  contracts: z.array(TokenContract),
  dateAdded: z.string().nullable(),
  fetchedAt: z.string(),
});
export type TokenMeta = z.infer<typeof TokenMeta>;

export const GlobalMetricsSnapshot = z.object({
  totalMarketCapUsd: nullableNumber,
  totalMarketCapChange24hPct: nullableNumber,
  totalVolume24hUsd: nullableNumber,
  btcDominance: nullableNumber,
  ethDominance: nullableNumber,
  btcDominanceChange24hPct: nullableNumber,
  stablecoinVolume24hUsd: nullableNumber,
  stablecoinMarketCapUsd: nullableNumber,
  cmcLastUpdated: z.string().nullable(),
  fetchedAt: z.string(),
});
export type GlobalMetricsSnapshot = z.infer<typeof GlobalMetricsSnapshot>;

export const CategorySnapshot = z.object({
  id: z.string(),
  name: z.string(),
  avgPriceChange24hPct: nullableNumber,
  marketCapChange24hPct: nullableNumber,
  volumeChange24hPct: nullableNumber,
  numTokens: z.number().int().nullable(),
  fetchedAt: z.string(),
});
export type CategorySnapshot = z.infer<typeof CategorySnapshot>;

export const PricePoint = z.object({
  ts: z.string(),
  priceUsd: z.number(),
});
export type PricePoint = z.infer<typeof PricePoint>;
