import { describe, expect, it } from "vitest";
import { CmcClient, MAX_RWA_IDS_PER_REQUEST, RWA_MAP_PAGE } from "../src/index.ts";

type Handler = (url: URL) => Response;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function make(handler: Handler) {
  const calls: URL[] = [];
  const fetchImpl = (async (input: URL | string) => {
    const url = input instanceof URL ? input : new URL(input);
    calls.push(url);
    return handler(url);
  }) as unknown as typeof fetch;
  return { client: new CmcClient({ apiKey: "test-key", fetchImpl }), calls };
}

function mapPage(ids: number[], hasTokens: (id: number) => boolean) {
  return {
    status: { error_code: 0, error_message: null, credit_count: 0 },
    data: { rwa_assets: ids.map((id) => ({ rwa_id: id, symbol: `A${id}`, name: `Asset ${id}`, rwa_rank: id, has_tokens: hasTokens(id) })) },
  };
}

function quotesBody(ids: number[]) {
  return {
    status: { error_code: 0, error_message: null, credit_count: 1 },
    data: {
      rwa_assets: ids.map((id) => ({
        rwa_id: id,
        symbol: `A${id}`,
        name: `Asset ${id}`,
        asset_type: "stock",
        average_tokenized_price: 100,
        tokenized_volume_24h: 1000,
        last_updated: "2026-09-22T12:00:00.000Z",
        tokens: [{ symbol: `A${id}X`, name: `Asset ${id} wrapper`, price: 101, crypto_id: 10_000 + id, issuer_name: "Backed Assets" }],
      })),
    },
  };
}

describe("rwa map", () => {
  it("pages through the map and reports which assets actually have wrappers", async () => {
    const { client, calls } = make((url) => {
      const start = Number(url.searchParams.get("start"));
      const ids = Array.from({ length: RWA_MAP_PAGE }, (_, i) => start + i);
      return json(mapPage(ids, (id) => id % 5 !== 0));
    });
    const entries = await client.getRwaMap(200);
    expect(entries).toHaveLength(200);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.pathname).toBe("/v5/real-world-assets/map");
    expect(entries.filter((e) => e.hasTokens).length).toBe(160);
  });

  it("costs nothing to read the map", async () => {
    const { client } = make((url) => json(mapPage([Number(url.searchParams.get("start"))], () => true)));
    await client.getRwaMap(1);
    expect(client.stats().counters.creditsSpent).toBe(0);
  });
});

describe("rwa quotes", () => {
  it("keeps batches inside the size the endpoint accepts", async () => {
    const seen: number[][] = [];
    const { client } = make((url) => {
      const ids = (url.searchParams.get("rwa_id") ?? "").split(",").map(Number);
      seen.push(ids);
      return json(quotesBody(ids));
    });
    const ids = Array.from({ length: MAX_RWA_IDS_PER_REQUEST + 25 }, (_, i) => i + 1);
    const assets = await client.getRwaQuotes(ids);
    expect(assets).toHaveLength(ids.length);
    expect(seen.every((batch) => batch.length <= MAX_RWA_IDS_PER_REQUEST)).toBe(true);
  });

  it("reads each wrapper's own CoinMarketCap id, which is what links it to a holding", async () => {
    const { client } = make((url) => json(quotesBody((url.searchParams.get("rwa_id") ?? "").split(",").map(Number))));
    const [asset] = await client.getRwaQuotes([2]);
    expect(asset!.wrappers[0]!.cmcId).toBe(10_002);
    expect(asset!.wrappers[0]!.issuerName).toBe("Backed Assets");
    expect(asset!.averageTokenizedPriceUsd).toBe(100);
  });

  it("keeps a wrapper with no price as null rather than zero", async () => {
    const { client } = make(() =>
      json({
        status: { error_code: 0, error_message: null, credit_count: 1 },
        data: {
          rwa_assets: [
            {
              rwa_id: 2,
              symbol: "NVDA",
              name: "Nvidia Corp",
              asset_type: "stock",
              average_tokenized_price: 229.45,
              last_updated: "2026-09-22T12:00:00.000Z",
              tokens: [{ symbol: "NVDA.D", name: "NVIDIA tokenized stock (Dinari)", price: null, crypto_id: 28616, issuer_name: "Dinari Assets" }],
            },
          ],
        },
      }),
    );
    const [asset] = await client.getRwaQuotes([2]);
    expect(asset!.wrappers[0]!.priceUsd).toBeNull();
  });
});
