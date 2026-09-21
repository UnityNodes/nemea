import { describe, expect, it } from "vitest";
import { CmcAuthError, CmcClient, CmcHttpError, CmcPlanError, CmcRateLimitError, CmcTimeoutError, SlidingWindowLimiter } from "../src/index.ts";

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function quoteBody(ids: number[], overrides: Record<number, Partial<Record<string, number | null>>> = {}) {
  const data: Record<string, unknown> = {};
  for (const id of ids) {
    data[String(id)] = {
      id,
      name: `Coin ${id}`,
      symbol: `C${id}`,
      cmc_rank: id,
      last_updated: "2026-09-21T06:00:00.000Z",
      quote: {
        USD: {
          price: 100 + id,
          volume_24h: 1_000_000,
          volume_change_24h: 12.5,
          percent_change_1h: -0.4,
          percent_change_24h: -2.1,
          percent_change_7d: 3.3,
          percent_change_30d: 10,
          market_cap: 5_000_000_000,
          last_updated: "2026-09-21T06:00:00.000Z",
          ...overrides[id],
        },
      },
    };
  }
  return { status: { error_code: 0, error_message: null, credit_count: 1 }, data };
}

function make(handler: Handler, extra: Partial<ConstructorParameters<typeof CmcClient>[0]> = {}) {
  const calls: URL[] = [];
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(input);
    calls.push(url);
    return handler(url, init);
  }) as unknown as typeof fetch;
  const client = new CmcClient({ apiKey: "test-key", fetchImpl, ...extra });
  return { client, calls };
}

describe("getQuotes", () => {
  it("sends the key header and parses nullable fields as null, not zero", async () => {
    let seenKey: string | null = null;
    const { client } = make((url, init) => {
      seenKey = new Headers(init?.headers).get("X-CMC_PRO_API_KEY");
      return json(quoteBody([1], { 1: { percent_change_1h: null, volume_change_24h: null } }));
    });
    const { quotes } = await client.getQuotes([1]);
    expect(seenKey).toBe("test-key");
    expect(quotes[0]?.percentChange1h).toBeNull();
    expect(quotes[0]?.volumeChange24hPct).toBeNull();
    expect(quotes[0]?.percentChange24h).toBe(-2.1);
  });

  it("reports ids CMC did not return instead of inventing rows", async () => {
    const { client } = make(() => json(quoteBody([1])));
    const result = await client.getQuotes([1, 999999]);
    expect(result.quotes.map((q) => q.cmcId)).toEqual([1]);
    expect(result.missing).toEqual([999999]);
  });

  it("batches into requests of at most 100 ids and dedupes", async () => {
    const { client, calls } = make((url) => json(quoteBody((url.searchParams.get("id") ?? "").split(",").map(Number))));
    const ids = Array.from({ length: 230 }, (_, i) => i + 1);
    const { quotes } = await client.getQuotes([...ids, ...ids]);
    expect(quotes).toHaveLength(230);
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => (c.searchParams.get("id") ?? "").split(",").length)).toEqual([100, 100, 30]);
  });

  it("serves a repeat call from cache and coalesces concurrent identical calls", async () => {
    const { client, calls } = make(() => json(quoteBody([1, 2])));
    await Promise.all([client.getQuotes([1, 2]), client.getQuotes([2, 1]), client.getQuotes([1, 2])]);
    await client.getQuotes([1, 2]);
    expect(calls).toHaveLength(1);
    const s = client.stats();
    expect(s.cache.coalesced).toBe(2);
    expect(s.cache.hits).toBe(1);
  });

  it("does not cache a failure: the next call goes to the network again", async () => {
    let n = 0;
    const { client, calls } = make(() => {
      n += 1;
      return n === 1 ? json({ status: { error_code: 500, error_message: "boom" } }, 500) : json(quoteBody([1]));
    });
    await expect(client.getQuotes([1])).rejects.toBeInstanceOf(CmcHttpError);
    const second = await client.getQuotes([1]);
    expect(second.quotes).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it("expires cached quotes after the ttl", async () => {
    let t = 1_000_000;
    const { client, calls } = make(() => json(quoteBody([1])), { now: () => t, ttlMs: { quotes: 1000 } });
    await client.getQuotes([1]);
    t += 500;
    await client.getQuotes([1]);
    t += 600;
    await client.getQuotes([1]);
    expect(calls).toHaveLength(2);
  });
});

describe("error mapping", () => {
  it("maps 429 to a rate-limit error with scope and Retry-After", async () => {
    const { client } = make(() => json({ status: { error_code: 1008, error_message: "You've exceeded your API Key's HTTP request rate limit. Rate limits reset every minute." } }, 429, { "retry-after": "12" }));
    const err = await client.getQuotes([1]).catch((e) => e);
    expect(err).toBeInstanceOf(CmcRateLimitError);
    expect((err as CmcRateLimitError).scope).toBe("minute");
    expect((err as CmcRateLimitError).retryAfterMs).toBe(12_000);
    expect(client.stats().counters.rateLimited).toBe(1);
  });

  it("maps a monthly credit exhaustion to scope monthly", async () => {
    const { client } = make(() => json({ status: { error_code: 1010, error_message: "You've exceeded your API monthly credit limit." } }, 429));
    const err = await client.getQuotes([1]).catch((e) => e);
    expect((err as CmcRateLimitError).scope).toBe("monthly");
  });

  it("maps plan-restricted endpoints to CmcPlanError, not a generic failure", async () => {
    const { client } = make(() => json({ status: { error_code: 1006, error_message: "Your API Key subscription plan doesn't support this endpoint." } }, 403));
    const err = await client.getHistorical(1, { days: 7, interval: "hourly" }).catch((e) => e);
    expect(err).toBeInstanceOf(CmcPlanError);
    expect((err as CmcPlanError).endpoint).toContain("quotes/historical");
  });

  it("treats an unpaid or expired plan (402) as a key problem, not as a missing endpoint", async () => {
    const { client } = make(() => json({ status: { error_code: 1003, error_message: "Your API Key subscription plan requires payment." } }, 402));
    const err = await client.getQuotes([1]).catch((e) => e);
    expect(err).toBeInstanceOf(CmcAuthError);
    expect(err).not.toBeInstanceOf(CmcPlanError);
  });

  it("maps a bad key to CmcAuthError", async () => {
    const { client } = make(() => json({ status: { error_code: 1001, error_message: "This API Key is invalid." } }, 401));
    await expect(client.getQuotes([1])).rejects.toBeInstanceOf(CmcAuthError);
  });

  it("times out instead of waiting forever", async () => {
    const { client } = make(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError")));
        }),
      { timeoutMs: 30 },
    );
    await expect(client.getQuotes([1])).rejects.toBeInstanceOf(CmcTimeoutError);
  });

  it("treats a 200 whose status.error_code is non-zero as an error", async () => {
    const { client } = make(() => json({ status: { error_code: 400, error_message: "Invalid value for id" }, data: null }, 200));
    await expect(client.getQuotes([1])).rejects.toBeInstanceOf(CmcHttpError);
  });

  it("uses the official host when the base URL is an empty string, as an unfilled .env line gives", async () => {
    const { client, calls } = make(() => json(quoteBody([1])), { baseUrl: "" });
    await client.getQuotes([1]);
    expect(calls[0]?.host).toBe("pro-api.coinmarketcap.com");
  });

  it("rejects an empty key at construction", () => {
    expect(() => new CmcClient({ apiKey: "" })).toThrow(CmcAuthError);
  });
});

describe("local rate limiter", () => {
  it("lets N calls through per minute and refuses the N+1th within the wait budget", async () => {
    let t = 0;
    const limiter = new SlidingWindowLimiter(3, 100, () => t, async (ms) => void (t += ms));
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    await expect(limiter.acquire()).rejects.toBeInstanceOf(CmcRateLimitError);
    t += 60_001;
    await expect(limiter.acquire()).resolves.toBeUndefined();
  });

  it("waits for a slot when the wait budget allows it", async () => {
    let t = 0;
    const limiter = new SlidingWindowLimiter(1, 120_000, () => t, async (ms) => void (t += ms));
    await limiter.acquire();
    await limiter.acquire();
    expect(t).toBe(60_000);
  });

  it("stops the client from calling out once the local budget is spent", async () => {
    const { client, calls } = make(() => json(quoteBody([1, 2, 3])), { requestsPerMinute: 2, limiterWaitMs: 10 });
    await client.getQuotes([1]);
    await client.getQuotes([2]);
    await expect(client.getQuotes([3])).rejects.toBeInstanceOf(CmcRateLimitError);
    expect(calls).toHaveLength(2);
  });
});

describe("hardening", () => {
  it("keeps the one-minute budget when the plan limit is changed mid-minute", async () => {
    const { client, calls } = make(() => json(quoteBody([1, 2, 3, 4])), { requestsPerMinute: 2, limiterWaitMs: 10 });
    await client.getQuotes([1]);
    await client.getQuotes([2]);
    client.setRequestsPerMinute(2);
    await expect(client.getQuotes([3])).rejects.toBeInstanceOf(CmcRateLimitError);
    expect(calls).toHaveLength(2);
  });

  it("reports a body that dies half way as a failure, with a receipt", async () => {
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("{")); c.error(new Error("socket hang up")); } });
    const { client } = make(() => new Response(stream, { status: 200 }));
    await expect(client.getQuotes([1])).rejects.toBeInstanceOf(CmcHttpError);
    expect(client.recentReceipts()[0]).toMatchObject({ ok: false });
    expect(client.stats().counters.failed).toBe(1);
  });

  it("serves history from cache for the whole ttl even when the clock crosses the hour, and does not pile up keys", async () => {
    let t = Date.parse("2026-09-21T12:50:00Z");
    const { client, calls } = make(() => json({ status: { error_code: 0 }, data: { "1": { id: 1, quotes: [{ timestamp: "2026-09-20T00:00:00Z", quote: { USD: { price: 1 } } }] } } }), { now: () => t });
    await client.getHistorical(1, { days: 30, interval: "daily" });
    t += 20 * 60_000;
    await client.getHistorical(1, { days: 30, interval: "daily" });
    expect(calls).toHaveLength(1);
  });
});

describe("other endpoints", () => {
  it("parses contract addresses per chain from info", async () => {
    const { client } = make(() =>
      json({
        status: { error_code: 0, credit_count: 1 },
        data: {
          "3408": {
            id: 3408,
            name: "USDC",
            symbol: "USDC",
            slug: "usd-coin",
            category: "token",
            tags: ["stablecoin", "defi"],
            date_added: "2018-10-08T00:00:00.000Z",
            contract_address: [
              { contract_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", platform: { name: "Ethereum" } },
              { contract_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", platform: { name: "Base" } },
              { contract_address: "So11111111111111111111111111111111111111112", platform: { name: "Solana" } },
            ],
          },
        },
      }),
    );
    const [meta] = await client.getInfoByIds([3408]);
    expect(meta?.isStablecoin).toBe(true);
    expect(meta?.contracts).toEqual([
      { chain: "ethereum", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
      { chain: "base", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
    ]);
  });

  it("looks up many symbols in one call and keeps every coin that shares a symbol, leaving the matching to the caller", async () => {
    const { client, calls } = make(() =>
      json({
        status: { error_code: 0, credit_count: 1 },
        data: {
          USDC: [{ id: 3408, name: "USDC", symbol: "USDC", slug: "usd-coin", tags: ["stablecoin"], contract_address: [{ contract_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", platform: { name: "Ethereum" } }] }],
          PEPE: [
            { id: 24478, name: "Pepe", symbol: "PEPE", slug: "pepe", tags: [], contract_address: [{ contract_address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", platform: { name: "Ethereum" } }] },
            { id: 99, name: "Fake Pepe", symbol: "PEPE", slug: "fake-pepe", tags: [], contract_address: [{ contract_address: "0xdead", platform: { name: "Ethereum" } }] },
          ],
          ZZZ: [],
        },
      }),
    );
    const metas = await client.getInfoBySymbols(["usdc", "PEPE", "zzz", "bad symbol!", "USDC"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.searchParams.get("symbol")).toBe("PEPE,USDC,ZZZ");
    expect(calls[0]?.searchParams.get("skip_invalid")).toBe("true");
    expect(metas.map((m) => m.cmcId).sort((a, b) => a - b)).toEqual([99, 3408, 24478]);
  });

  it("splits a long symbol list into requests of 25", async () => {
    const { client, calls } = make(() => json({ status: { error_code: 0 }, data: {} }));
    await client.getInfoBySymbols(Array.from({ length: 60 }, (_, i) => `T${i}`));
    expect(calls.map((c) => (c.searchParams.get("symbol") ?? "").split(",").length)).toEqual([25, 25, 10]);
  });

  it("rejects a symbol that could smuggle query params", async () => {
    const { client, calls } = make(() => json({ status: { error_code: 0 }, data: {} }));
    await expect(client.getInfoBySymbol("ETH&convert=EUR")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("parses global metrics and leaves missing fields null", async () => {
    const { client } = make(() =>
      json({
        status: { error_code: 0, credit_count: 1 },
        data: { btc_dominance: 58.2, eth_dominance: 12.1, quote: { USD: { total_market_cap: 3.2e12, total_market_cap_yesterday_percentage_change: -3.4 } } },
      }),
    );
    const g = await client.getGlobalMetrics();
    expect(g.btcDominance).toBe(58.2);
    expect(g.totalMarketCapChange24hPct).toBe(-3.4);
    expect(g.stablecoinVolume24hUsd).toBeNull();
  });

  it("parses categories", async () => {
    const { client } = make(() =>
      json({ status: { error_code: 0 }, data: [{ id: "abc", name: "Layer 1", avg_price_change: -7.5, market_cap_change: -6, volume_change: 20, num_tokens: 150, last_updated: "2026-09-21T06:00:00.000Z" }, { id: null, name: "broken" }] }),
    );
    const cats = await client.getCategories();
    expect(cats).toHaveLength(1);
    expect(cats[0]?.avgPriceChange24hPct).toBe(-7.5);
  });

  it("parses historical points from the id-keyed shape", async () => {
    const { client } = make(() =>
      json({
        status: { error_code: 0 },
        data: { "1": { id: 1, quotes: [{ timestamp: "2026-09-20T00:00:00Z", quote: { USD: { price: 60000 } } }, { timestamp: "2026-09-20T01:00:00Z", quote: { USD: { price: null } } }] } },
      }),
    );
    const points = await client.getHistorical(1, { days: 1, interval: "hourly" });
    expect(points).toEqual([{ ts: "2026-09-20T00:00:00Z", priceUsd: 60000 }]);
  });
});

describe("string error codes and all-invalid ids", () => {
  it("understands error_code sent as a string", async () => {
    const { client } = make(() => json({ status: { error_code: "1010", error_message: "monthly credit limit" } }, 429));
    const err = await client.getQuotes([1]).catch((e) => e);
    expect(err).toBeInstanceOf(CmcRateLimitError);
    expect((err as CmcRateLimitError).scope).toBe("monthly");
    expect((err as CmcRateLimitError).errorCode).toBe(1010);
  });

  it("treats a string 0 as success", async () => {
    const { client } = make(() => json({ status: { error_code: "0", credit_count: 1 }, data: [{ id: 1, symbol: "BTC", quote: [{ symbol: "USD", price: 5 }] }] }));
    expect((await client.getQuotes([1])).quotes).toHaveLength(1);
  });

  it("returns every id as missing when CMC says it found none of them, instead of failing", async () => {
    const { client } = make(() => json({ status: { error_code: "400", error_message: "No data found for 'id': '999999999'", credit_count: 0 } }, 400));
    expect(await client.getQuotes([999999999])).toEqual({ quotes: [], missing: [999999999] });
  });

  it("still fails on other 400s", async () => {
    const { client } = make(() => json({ status: { error_code: "400", error_message: "Invalid value for id" } }, 400));
    await expect(client.getQuotes([1])).rejects.toBeInstanceOf(CmcHttpError);
  });
});

describe("v3 response shape", () => {
  const v3 = {
    status: { error_code: 0, error_message: null, credit_count: 1 },
    data: [
      {
        id: 1,
        name: "Bitcoin",
        symbol: "BTC",
        cmc_rank: 1,
        last_updated: "2026-09-21T06:00:00.000Z",
        quote: [
          { id: 2781, symbol: "USD", price: 62000, volume_24h: 3e10, volume_change_24h: -4.2, percent_change_1h: 0.1, percent_change_24h: -1.5, percent_change_7d: 2, percent_change_30d: 5, market_cap: 1.2e12, last_updated: "2026-09-21T06:00:00.000Z" },
        ],
      },
      {
        id: 3408,
        name: "USDC",
        symbol: "USDC",
        cmc_rank: 6,
        quote: [{ id: 2781, symbol: "USD", price: 0.9997, volume_24h: 5e9, percent_change_24h: 0, last_updated: "2026-09-21T06:00:00.000Z" }],
      },
    ],
  };

  it("parses an array-shaped data with an array-shaped quote", async () => {
    const { client, calls } = make(() => json(v3));
    const { quotes, missing } = await client.getQuotes([1, 3408, 825]);
    expect(calls[0]?.pathname).toBe("/v3/cryptocurrency/quotes/latest");
    expect(quotes.map((q) => [q.cmcId, q.priceUsd])).toEqual([
      [1, 62000],
      [3408, 0.9997],
    ]);
    expect(quotes[1]?.percentChange1h).toBeNull();
    expect(missing).toEqual([825]);
  });

  it("does not mistake a non-USD quote for USD", async () => {
    const body = { status: { error_code: 0 }, data: [{ id: 1, symbol: "BTC", quote: [{ symbol: "EUR", price: 57000 }] }] };
    const { client } = make(() => json(body));
    const { quotes, missing } = await client.getQuotes([1]);
    expect(quotes).toHaveLength(0);
    expect(missing).toEqual([1]);
  });
});

describe("receipts", () => {
  it("records every real call, newest first, including failures", async () => {
    let n = 0;
    const { client } = make(() => {
      n += 1;
      return n === 1 ? json(quoteBody([1])) : json({ status: { error_code: 1008, error_message: "rate" } }, 429);
    });
    await client.getQuotes([1]);
    await client.getQuotes([2]).catch(() => undefined);
    const r = client.recentReceipts();
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ endpoint: "/v3/cryptocurrency/quotes/latest", httpStatus: 429, ok: false });
    expect(r[1]).toMatchObject({ httpStatus: 200, ok: true, creditCount: 1 });
  });
});

describe("getPriceLow", () => {
  const stats = {
    status: { error_code: 0, credit_count: 1 },
    data: { "1": { id: 1, periods: { all_time: { quote: { USD: { low: 65.53, low_timestamp: "2013-07-05T00:00:00Z" } } } } } },
  };
  const history = {
    status: { error_code: 0, credit_count: 3 },
    data: {
      "1": {
        id: 1,
        quotes: [
          { timestamp: "2026-01-01T00:00:00Z", quote: { USD: { price: 70000 } } },
          { timestamp: "2026-03-01T00:00:00Z", quote: { USD: { price: 41000 } } },
          { timestamp: "2026-06-01T00:00:00Z", quote: { USD: { price: 58000 } } },
        ],
      },
    },
  };

  it("uses the all-time low when the plan allows price-performance-stats", async () => {
    const { client } = make(() => json(stats));
    expect(await client.getPriceLow(1)).toEqual({ lowUsd: 65.53, lowAt: "2013-07-05T00:00:00Z", windowDays: null, scope: "all_time" });
  });

  it("takes the date of the low from the period, not from the quote's reference time", async () => {
    const both = {
      status: { error_code: 0 },
      data: { "1": { id: 1, periods: { all_time: { low_timestamp: "2013-07-05T00:00:00Z", quote: { USD: { low: 65.53, low_timestamp: "2026-09-21T12:00:00Z" } } } } } },
    };
    const { client } = make(() => json(both));
    expect((await client.getPriceLow(1))?.lowAt).toBe("2013-07-05T00:00:00Z");
  });

  it("asks for a history window that stays inside one year even when the hour has just rolled over", async () => {
    let seen: URL | null = null;
    const { client } = make((url) => {
      seen = url;
      return json({ status: { error_code: 0 }, data: { "1": { id: 1, quotes: [] } } });
    }, { now: () => Date.parse("2026-09-21T12:59:00Z") });
    await client.getHistorical(1, { days: 365, interval: "daily" });
    const start = Date.parse(seen!.searchParams.get("time_start")!);
    expect(Date.parse("2026-09-21T12:59:00Z") - start).toBeLessThan(365 * 24 * 3600_000);
  });

  it("falls back to a labelled window low when the plan forbids it, and stops retrying the forbidden endpoint", async () => {
    const { client, calls } = make((url) =>
      url.pathname.includes("price-performance-stats") ? json({ status: { error_code: 1006, error_message: "plan" } }, 403) : json(history),
    );
    const low = await client.getPriceLow(1);
    expect(low).toEqual({ lowUsd: 41000, lowAt: "2026-03-01T00:00:00Z", windowDays: 365, scope: "window" });
    await client.getPriceLow(2).catch(() => undefined);
    expect(calls.filter((c) => c.pathname.includes("price-performance-stats"))).toHaveLength(1);
  });

  it("returns null, not zero, when there is no history at all", async () => {
    const { client } = make((url) =>
      url.pathname.includes("price-performance-stats") ? json({ status: { error_code: 1006, error_message: "plan" } }, 403) : json({ status: { error_code: 0 }, data: { "1": { id: 1, quotes: [] } } }),
    );
    expect(await client.getPriceLow(1)).toBeNull();
  });
});
