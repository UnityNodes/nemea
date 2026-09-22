import { DEFAULT_PREFERENCES, type AlertPreferences, type CategorySnapshot, type GlobalMetricsSnapshot, type Holding, type QuoteSnapshot, type TokenMeta } from "@nemea/shared-types";
import type { EngineInput, PastAlert } from "../src/types.ts";

export const NOW = new Date("2026-09-21T12:00:00.000Z");

export function holding(cmcId: number, symbol: string, amount: number, extra: Partial<Holding> = {}): Holding {
  return { id: `h${cmcId}`, cmcId, symbol, name: symbol, amount, costBasisUsd: null, source: "manual", chain: null, contractAddress: null, walletAddress: null, ...extra };
}

export function quote(cmcId: number, symbol: string, priceUsd: number | null, extra: Partial<QuoteSnapshot> = {}): QuoteSnapshot {
  return {
    cmcId,
    symbol,
    name: symbol,
    priceUsd,
    percentChange1h: 0,
    percentChange24h: 0,
    percentChange7d: 0,
    percentChange30d: 0,
    volume24hUsd: 5_000_000,
    volumeChange24hPct: 0,
    marketCapUsd: 1e9,
    cmcRank: cmcId,
    cmcLastUpdated: new Date(NOW.getTime() - 60_000).toISOString(),
    fetchedAt: new Date(NOW.getTime() - 30_000).toISOString(),
    ...extra,
  };
}

export function meta(cmcId: number, symbol: string, tags: string[] = [], extra: Partial<TokenMeta> = {}): TokenMeta {
  return { cmcId, symbol, name: symbol, slug: symbol.toLowerCase(), tags, category: "token", isStablecoin: tags.includes("stablecoin"), contracts: [], dateAdded: null, fetchedAt: NOW.toISOString(), ...extra };
}

export function category(id: string, name: string, avg: number | null): CategorySnapshot {
  return { id, name, avgPriceChange24hPct: avg, marketCapChange24hPct: avg, volumeChange24hPct: null, numTokens: 50, fetchedAt: NOW.toISOString() };
}

export function global(change: number | null): GlobalMetricsSnapshot {
  return {
    totalMarketCapUsd: 3e12,
    totalMarketCapChange24hPct: change,
    totalVolume24hUsd: 1e11,
    btcDominance: 58,
    ethDominance: 12,
    btcDominanceChange24hPct: 0,
    stablecoinVolume24hUsd: null,
    stablecoinMarketCapUsd: null,
    cmcLastUpdated: NOW.toISOString(),
    fetchedAt: NOW.toISOString(),
  };
}

export function input(over: Omit<Partial<EngineInput>, "quotes" | "meta"> & { quotes?: QuoteSnapshot[]; metas?: TokenMeta[] } = {}): EngineInput {
  const { quotes = [], metas = [], ...rest } = over;
  return {
    now: NOW,
    holdings: [],
    quotes: new Map(quotes.map((q) => [q.cmcId, q])),
    meta: new Map(metas.map((m) => [m.cmcId, m])),
    global: global(-1),
    categories: [],
    preferences: { ...DEFAULT_PREFERENCES },
    peggedUsdIds: new Set<number>(),
    lows: new Map(),
    rwaByWrapperId: new Map(),
    past: [],
    maxQuoteAgeMs: 30 * 60_000,
    ...rest,
  };
}

export function prefs(over: Partial<AlertPreferences>): AlertPreferences {
  return { ...DEFAULT_PREFERENCES, ...over };
}

export function past(kind: PastAlert["kind"], dedupeKey: string, hoursAgo: number, severity: PastAlert["severity"] = "warning", simulated = false): PastAlert {
  return { kind, severity, cmcId: null, dedupeKey, createdAt: new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString(), simulated };
}
