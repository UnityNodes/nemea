import type { CategorySnapshot, GlobalMetricsSnapshot, PricePoint, QuoteSnapshot, TokenMeta } from "@nemea/shared-types";
import { TtlCache, type CacheStats } from "./cache.ts";
import {
  CmcAuthError,
  CmcError,
  CmcHttpError,
  CmcPlanError,
  CmcRateLimitError,
  CmcTimeoutError,
  type CmcRateScope,
} from "./errors.ts";
import { SlidingWindowLimiter } from "./limiter.ts";
import {
  creditCount,
  parseCategories,
  parseGlobalMetrics,
  parseHistorical,
  parseInfo,
  parseKeyInfo,
  parsePriceStatsAllTime,
  parseQuotes,
  type KeyInfo,
} from "./parse.ts";
import type { PriceLow } from "./low.ts";

export const ENDPOINTS = {
  quotesLatest: "/v3/cryptocurrency/quotes/latest",
  quotesHistorical: "/v3/cryptocurrency/quotes/historical",
  info: "/v2/cryptocurrency/info",
  globalMetrics: "/v1/global-metrics/quotes/latest",
  categories: "/v1/cryptocurrency/categories",
  priceStats: "/v2/cryptocurrency/price-performance-stats/latest",
  keyInfo: "/v1/key/info",
} as const;

export type CallReceipt = {
  at: string;
  endpoint: string;
  httpStatus: number | null;
  ok: boolean;
  creditCount: number | null;
  ms: number;
  detail: string;
};

const RECEIPT_LIMIT = 50;

export type CmcClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  requestsPerMinute?: number;
  limiterWaitMs?: number;
  ttlMs?: Partial<typeof DEFAULT_TTL_MS>;
};

export const DEFAULT_TTL_MS = {
  quotes: 45_000,
  info: 24 * 3600_000,
  global: 60_000,
  categories: 5 * 60_000,
  historical: 6 * 3600_000,
  keyInfo: 5 * 60_000,
  priceLow: 6 * 3600_000,
  planRestricted: 3600_000,
};

export const MAX_IDS_PER_REQUEST = 100;

export type ClientCounters = {
  requests: number;
  creditsSpent: number;
  rateLimited: number;
  planRestricted: number;
  failed: number;
};

export type QuotesResult = { quotes: QuoteSnapshot[]; missing: number[] };

function classifyRateScope(message: string, errorCode: number | null): CmcRateScope {
  if (errorCode === 1008) return "minute";
  if (errorCode === 1009) return "daily";
  if (errorCode === 1010) return "monthly";
  if (errorCode === 1011) return "ip";
  const m = message.toLowerCase();
  if (m.includes("minute")) return "minute";
  if (m.includes("daily") || m.includes("day")) return "daily";
  if (m.includes("month")) return "monthly";
  return "unknown";
}

function retryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

export class CmcClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly ttl: typeof DEFAULT_TTL_MS;
  private readonly cache: TtlCache;
  private limiter: SlidingWindowLimiter;
  private readonly limiterWaitMs: number;
  private readonly counters: ClientCounters = { requests: 0, creditsSpent: 0, rateLimited: 0, planRestricted: 0, failed: 0 };
  private readonly receipts: CallReceipt[] = [];

  constructor(private readonly opts: CmcClientOptions) {
    if (!opts.apiKey) throw new CmcAuthError("CMC API key is empty");
    this.baseUrl = opts.baseUrl ?? "https://pro-api.coinmarketcap.com";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.ttl = { ...DEFAULT_TTL_MS, ...opts.ttlMs };
    this.cache = new TtlCache(this.now);
    this.limiterWaitMs = opts.limiterWaitMs ?? 5_000;
    this.limiter = new SlidingWindowLimiter(opts.requestsPerMinute ?? 30, this.limiterWaitMs, this.now);
  }

  setRequestsPerMinute(perMinute: number): void {
    this.limiter = new SlidingWindowLimiter(perMinute, this.limiterWaitMs, this.now);
  }

  stats(): { cache: CacheStats; counters: ClientCounters; requestsInLastMinute: number } {
    return { cache: this.cache.snapshot(), counters: { ...this.counters }, requestsInLastMinute: this.limiter.inWindow() };
  }

  recentReceipts(limit = 20): CallReceipt[] {
    return this.receipts.slice(-limit).reverse();
  }

  private record(receipt: CallReceipt): void {
    this.receipts.push(receipt);
    if (this.receipts.length > RECEIPT_LIMIT) this.receipts.shift();
  }

  private async call(path: string, params: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    await this.limiter.acquire();
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    this.counters.requests += 1;
    const started = this.now();
    const stamp = new Date(started).toISOString();
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { "X-CMC_PRO_API_KEY": this.opts.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.counters.failed += 1;
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      this.record({ at: stamp, endpoint: path, httpStatus: null, ok: false, creditCount: null, ms: this.now() - started, detail: timedOut ? "timeout" : "network error" });
      if (timedOut) throw new CmcTimeoutError(path, this.timeoutMs);
      throw new CmcHttpError(`CMC ${path} network error: ${error instanceof Error ? error.message : String(error)}`);
    }
    let body: unknown = null;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const status = (body as { status?: { error_code?: number; error_message?: string | null } } | null)?.status;
    const errorCode = typeof status?.error_code === "number" && status.error_code !== 0 ? status.error_code : null;
    const message = status?.error_message ?? res.statusText ?? "unknown error";
    const ok = res.ok && errorCode === null;
    const credits = ok ? creditCount(body) : null;
    this.record({ at: stamp, endpoint: path, httpStatus: res.status, ok, creditCount: credits, ms: this.now() - started, detail: ok ? "ok" : message });
    if (ok) {
      this.counters.creditsSpent += credits ?? 0;
      return body;
    }
    if (res.status === 429 || errorCode === 1008 || errorCode === 1009 || errorCode === 1010 || errorCode === 1011) {
      this.counters.rateLimited += 1;
      throw new CmcRateLimitError(`CMC ${path} rate limited: ${message}`, classifyRateScope(message, errorCode), retryAfterMs(res.headers), res.status, errorCode);
    }
    if (res.status === 401 || res.status === 402 || errorCode === 1001 || errorCode === 1002 || errorCode === 1003 || errorCode === 1004 || errorCode === 1005 || errorCode === 1007) {
      this.counters.failed += 1;
      throw new CmcAuthError(`CMC ${path} rejected the API key: ${message}`, res.status, errorCode);
    }
    if (res.status === 403 || errorCode === 1006) {
      this.counters.planRestricted += 1;
      throw new CmcPlanError(`CMC ${path} is not available on this plan: ${message}`, path, res.status, errorCode);
    }
    this.counters.failed += 1;
    throw new CmcHttpError(`CMC ${path} failed with HTTP ${res.status}: ${message}`, res.status, errorCode);
  }

  async getQuotes(ids: readonly number[]): Promise<QuotesResult> {
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    const quotes: QuoteSnapshot[] = [];
    const missing: number[] = [];
    for (let i = 0; i < unique.length; i += MAX_IDS_PER_REQUEST) {
      const chunk = unique.slice(i, i + MAX_IDS_PER_REQUEST);
      const key = `quotes:${chunk.join(",")}`;
      const result = await this.cache.getOrLoad(key, this.ttl.quotes, async () => {
        const body = await this.call(ENDPOINTS.quotesLatest, { id: chunk.join(","), convert: "USD", skip_invalid: true });
        return parseQuotes(body, chunk, new Date(this.now()).toISOString());
      });
      quotes.push(...result.quotes);
      missing.push(...result.missing);
    }
    return { quotes, missing };
  }

  async getInfoByIds(ids: readonly number[]): Promise<TokenMeta[]> {
    const unique = [...new Set(ids)].sort((a, b) => a - b);
    const out: TokenMeta[] = [];
    for (let i = 0; i < unique.length; i += MAX_IDS_PER_REQUEST) {
      const chunk = unique.slice(i, i + MAX_IDS_PER_REQUEST);
      const metas = await this.cache.getOrLoad(`info:id:${chunk.join(",")}`, this.ttl.info, async () => {
        const body = await this.call(ENDPOINTS.info, { id: chunk.join(","), skip_invalid: true });
        return parseInfo(body, new Date(this.now()).toISOString());
      });
      out.push(...metas);
    }
    return out;
  }

  async getInfoByAddresses(addresses: readonly string[]): Promise<TokenMeta[]> {
    const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].sort();
    const out: TokenMeta[] = [];
    for (let i = 0; i < unique.length; i += MAX_IDS_PER_REQUEST) {
      const chunk = unique.slice(i, i + MAX_IDS_PER_REQUEST);
      const metas = await this.cache.getOrLoad(`info:addr:${chunk.join(",")}`, this.ttl.info, async () => {
        const body = await this.call(ENDPOINTS.info, { address: chunk.join(","), skip_invalid: true });
        return parseInfo(body, new Date(this.now()).toISOString());
      });
      out.push(...metas);
    }
    return out;
  }

  async getInfoBySymbol(symbol: string): Promise<TokenMeta[]> {
    const clean = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9._-]{1,20}$/.test(clean)) throw new CmcError(`not a token symbol: ${JSON.stringify(symbol)}`);
    return this.cache.getOrLoad(`info:sym:${clean}`, this.ttl.info, async () => {
      const body = await this.call(ENDPOINTS.info, { symbol: clean, skip_invalid: true });
      return parseInfo(body, new Date(this.now()).toISOString());
    });
  }

  async getGlobalMetrics(): Promise<GlobalMetricsSnapshot> {
    return this.cache.getOrLoad("global", this.ttl.global, async () => {
      const body = await this.call(ENDPOINTS.globalMetrics, { convert: "USD" });
      return parseGlobalMetrics(body, new Date(this.now()).toISOString());
    });
  }

  async getCategories(): Promise<CategorySnapshot[]> {
    return this.cache.getOrLoad("categories", this.ttl.categories, async () => {
      const body = await this.call(ENDPOINTS.categories, {});
      return parseCategories(body, new Date(this.now()).toISOString());
    });
  }

  async getHistorical(id: number, opts: { days: number; interval: "hourly" | "daily" }): Promise<PricePoint[]> {
    const end = this.now();
    const bucket = 3600_000;
    const alignedEnd = Math.floor(end / bucket) * bucket;
    const start = alignedEnd - opts.days * 24 * 3600_000 + 2 * 3600_000;
    return this.cache.getOrLoad(`hist:${id}:${opts.days}:${opts.interval}:${alignedEnd}`, this.ttl.historical, async () => {
      const body = await this.call(ENDPOINTS.quotesHistorical, {
        id,
        time_start: new Date(start).toISOString(),
        time_end: new Date(alignedEnd).toISOString(),
        interval: opts.interval === "hourly" ? "1h" : "1d",
        convert: "USD",
      });
      return parseHistorical(body, id);
    });
  }

  async getKeyInfo(): Promise<KeyInfo> {
    return this.cache.getOrLoad("keyinfo", this.ttl.keyInfo, async () => parseKeyInfo(await this.call(ENDPOINTS.keyInfo, {})));
  }

  async getPriceLow(id: number, opts: { windowDays: number } = { windowDays: 365 }): Promise<PriceLow | null> {
    return this.cache.getOrLoad(`low:${id}:${opts.windowDays}`, this.ttl.priceLow, async () => {
      const restricted = this.cache.peek<true>("plan-restricted:priceStats");
      if (!restricted) {
        try {
          const body = await this.call(ENDPOINTS.priceStats, { id, time_period: "all_time", convert: "USD" });
          const stats = parsePriceStatsAllTime(body, id);
          if (stats) return { lowUsd: stats.lowUsd, lowAt: stats.lowAt, windowDays: null, scope: "all_time" as const };
        } catch (error) {
          if (!(error instanceof CmcPlanError)) throw error;
          await this.cache.getOrLoad("plan-restricted:priceStats", this.ttl.planRestricted, async () => true as const);
        }
      }
      const points = await this.getHistorical(id, { days: opts.windowDays, interval: "daily" });
      if (points.length === 0) return null;
      const lowest = points.reduce((min, p) => (p.priceUsd < min.priceUsd ? p : min));
      return { lowUsd: lowest.priceUsd, lowAt: lowest.ts, windowDays: opts.windowDays, scope: "window" as const };
    });
  }
}
