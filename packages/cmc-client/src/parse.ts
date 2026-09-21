import type { CategorySnapshot, Chain, GlobalMetricsSnapshot, PricePoint, QuoteSnapshot, TokenMeta } from "@nemea/shared-types";
import { CmcSchemaError } from "./errors.ts";

type Json = Record<string, unknown>;

function obj(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function pick(value: unknown, id: number): Json | null {
  if (Array.isArray(value)) {
    const match = value.map(obj).find((v) => v !== null && v.id === id);
    return match ?? null;
  }
  return obj(value);
}

function entryFor(data: unknown, id: number): Json | null {
  if (Array.isArray(data)) return pick(data, id);
  const keyed = obj(data);
  return keyed ? pick(keyed[String(id)], id) : null;
}

function usdQuote(quote: unknown): Json | null {
  if (Array.isArray(quote)) {
    const list = quote.map(obj).filter((q): q is Json => q !== null);
    return list.find((q) => q.symbol === "USD") ?? null;
  }
  return obj(obj(quote)?.USD);
}

export function parseQuotes(body: unknown, requestedIds: readonly number[], fetchedAt: string): { quotes: QuoteSnapshot[]; missing: number[] } {
  const data = obj(body)?.data;
  if (!Array.isArray(data) && !obj(data)) throw new CmcSchemaError("quotes/latest", "data is neither an array nor an object");
  const quotes: QuoteSnapshot[] = [];
  const missing: number[] = [];
  for (const id of requestedIds) {
    const entry = entryFor(data, id);
    const usd = usdQuote(entry?.quote);
    if (!entry || !usd) {
      missing.push(id);
      continue;
    }
    quotes.push({
      cmcId: id,
      symbol: str(entry.symbol) ?? String(id),
      name: str(entry.name) ?? str(entry.symbol) ?? String(id),
      priceUsd: num(usd.price),
      percentChange1h: num(usd.percent_change_1h),
      percentChange24h: num(usd.percent_change_24h),
      percentChange7d: num(usd.percent_change_7d),
      percentChange30d: num(usd.percent_change_30d),
      volume24hUsd: num(usd.volume_24h),
      volumeChange24hPct: num(usd.volume_change_24h),
      marketCapUsd: num(usd.market_cap),
      cmcRank: num(entry.cmc_rank),
      cmcLastUpdated: str(usd.last_updated) ?? str(entry.last_updated),
      fetchedAt,
    });
  }
  return { quotes, missing };
}

const CHAIN_BY_PLATFORM_NAME: Record<string, Chain> = {
  ethereum: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  "arbitrum one": "arbitrum",
};

export function parseInfo(body: unknown, fetchedAt: string): TokenMeta[] {
  const data = obj(body)?.data;
  if (!Array.isArray(data) && !obj(data)) throw new CmcSchemaError("cryptocurrency/info", "data is neither an array nor an object");
  const out: TokenMeta[] = [];
  for (const raw of Array.isArray(data) ? data : Object.values(obj(data) as Json)) {
    const entries = Array.isArray(raw) ? raw : [raw];
    for (const candidate of entries) {
      const e = obj(candidate);
      const id = num(e?.id);
      if (!e || id === null) continue;
      const tags = Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === "string") : [];
      const rawGroups = e["tag-groups"];
      const tagGroups = Array.isArray(rawGroups) && rawGroups.length === tags.length ? rawGroups.map((g) => (typeof g === "string" ? g : "")) : undefined;
      const contracts: TokenMeta["contracts"] = [];
      const list = Array.isArray(e.contract_address) ? e.contract_address : [];
      for (const c of list) {
        const ce = obj(c);
        const platformName = str(obj(ce?.platform)?.name)?.toLowerCase();
        const address = str(ce?.contract_address);
        const chain = platformName ? CHAIN_BY_PLATFORM_NAME[platformName] : undefined;
        if (chain && address) contracts.push({ chain, address: address.toLowerCase() });
      }
      const platform = obj(e.platform);
      const platformChain = str(platform?.name) ? CHAIN_BY_PLATFORM_NAME[(platform?.name as string).toLowerCase()] : undefined;
      const platformAddress = str(platform?.token_address);
      if (platformChain && platformAddress && !contracts.some((c) => c.chain === platformChain && c.address === platformAddress.toLowerCase())) {
        contracts.push({ chain: platformChain, address: platformAddress.toLowerCase() });
      }
      out.push({
        cmcId: id,
        symbol: str(e.symbol) ?? String(id),
        name: str(e.name) ?? str(e.symbol) ?? String(id),
        slug: str(e.slug) ?? String(id),
        tags,
        ...(tagGroups ? { tagGroups } : {}),
        category: str(e.category),
        isStablecoin: tags.includes("stablecoin"),
        contracts,
        dateAdded: str(e.date_added),
        fetchedAt,
      });
    }
  }
  return out;
}

export function parseGlobalMetrics(body: unknown, fetchedAt: string): GlobalMetricsSnapshot {
  const data = obj(obj(body)?.data);
  if (!data) throw new CmcSchemaError("global-metrics/quotes/latest", "data is not an object");
  const usd = usdQuote(data.quote);
  return {
    totalMarketCapUsd: num(usd?.total_market_cap),
    totalMarketCapChange24hPct: num(usd?.total_market_cap_yesterday_percentage_change),
    totalVolume24hUsd: num(usd?.total_volume_24h),
    btcDominance: num(data.btc_dominance),
    ethDominance: num(data.eth_dominance),
    btcDominanceChange24hPct: num(data.btc_dominance_24h_percentage_change),
    stablecoinVolume24hUsd: num(usd?.stablecoin_volume_24h) ?? num(data.stablecoin_volume_24h),
    stablecoinMarketCapUsd: num(usd?.stablecoin_market_cap) ?? num(data.stablecoin_market_cap),
    cmcLastUpdated: str(data.last_updated) ?? str(usd?.last_updated),
    fetchedAt,
  };
}

export function parseCategories(body: unknown, fetchedAt: string): CategorySnapshot[] {
  const list = obj(body)?.data;
  if (!Array.isArray(list)) throw new CmcSchemaError("cryptocurrency/categories", "data is not an array");
  const out: CategorySnapshot[] = [];
  for (const raw of list) {
    const c = obj(raw);
    const id = str(c?.id);
    const name = str(c?.name);
    if (!c || !id || !name) continue;
    out.push({
      id,
      name,
      avgPriceChange24hPct: num(c.avg_price_change),
      marketCapChange24hPct: num(c.market_cap_change),
      volumeChange24hPct: num(c.volume_change),
      numTokens: num(c.num_tokens),
      fetchedAt,
    });
  }
  return out;
}

export function parseHistorical(body: unknown, id: number): PricePoint[] {
  const raw = obj(body)?.data;
  if (!Array.isArray(raw) && !obj(raw)) throw new CmcSchemaError("quotes/historical", "data is neither an array nor an object");
  const single = obj(raw);
  const holder = single && Array.isArray(single.quotes) ? single : entryFor(raw, id);
  const quotes = holder?.quotes;
  if (!Array.isArray(quotes)) throw new CmcSchemaError("quotes/historical", "quotes is not an array");
  const points: PricePoint[] = [];
  for (const q of quotes) {
    const qe = obj(q);
    const usd = usdQuote(qe?.quote);
    const ts = str(qe?.timestamp) ?? str(usd?.timestamp);
    const price = num(usd?.price);
    if (ts && price !== null) points.push({ ts, priceUsd: price });
  }
  return points;
}

export type KeyInfo = {
  creditLimitMonthly: number | null;
  rateLimitPerMinute: number | null;
  creditsUsedMonth: number | null;
  creditsLeftMonth: number | null;
  creditsUsedToday: number | null;
};

export function parseKeyInfo(body: unknown): KeyInfo {
  const data = obj(obj(body)?.data);
  if (!data) throw new CmcSchemaError("key/info", "data is not an object");
  const plan = obj(data.plan);
  const usage = obj(data.usage);
  return {
    creditLimitMonthly: num(plan?.credit_limit_monthly),
    rateLimitPerMinute: num(plan?.rate_limit_minute),
    creditsUsedMonth: num(obj(usage?.current_month)?.credits_used),
    creditsLeftMonth: num(obj(usage?.current_month)?.credits_left),
    creditsUsedToday: num(obj(usage?.current_day)?.credits_used),
  };
}

export function creditCount(body: unknown): number {
  return num(obj(obj(body)?.status)?.credit_count) ?? 0;
}

export type PriceStats = {
  lowUsd: number;
  lowAt: string | null;
};

export function parsePriceStatsAllTime(body: unknown, id: number): PriceStats | null {
  const raw = obj(body)?.data;
  const entry = entryFor(raw, id);
  const periods = obj(entry?.periods);
  const allTime = obj(periods?.all_time);
  const usd = usdQuote(allTime?.quote);
  const low = num(usd?.low);
  if (low === null) return null;
  return { lowUsd: low, lowAt: str(allTime?.low_timestamp) ?? str(usd?.low_timestamp) };
}
