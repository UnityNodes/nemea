import type { Chain } from "@nemea/shared-types";
import { describe, expect, it } from "vitest";
import { BlockscoutProvider, ChainReadError } from "../src/index.ts";
import { VITALIK, fixture, hangingFetch, json, makeFetch, readError, text, type Handler } from "./helpers.ts";

const NAME_BY_HOST: Record<string, string> = {
  "eth.blockscout.com": "eth",
  "base.blockscout.com": "base",
  "arbitrum.blockscout.com": "arbitrum",
};

const fromFixtures: Handler = (url) => {
  const name = NAME_BY_HOST[url.hostname];
  if (!name) return json({ message: "unexpected host" }, 500);
  if (url.pathname.endsWith("/token-balances")) return json(fixture(`blockscout-${name}-token-balances.json`));
  return json(fixture(`blockscout-${name}-address.json`));
};

function provider(handler: Handler, extra: ConstructorParameters<typeof BlockscoutProvider>[0] = {}) {
  const { fetchImpl, calls } = makeFetch(handler);
  const slept: number[] = [];
  const p = new BlockscoutProvider({ fetchImpl, sleep: async (ms) => void slept.push(ms), ...extra });
  return { p, calls, slept };
}

function bySymbol<T extends { symbol: string | null }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((b) => [b.symbol ?? "(none)", b]));
}

const ADDR = "0x0000000000000000000000000000000000000001";

function tokenRow(symbol: string, address: string, value: string, over: Record<string, unknown> = {}) {
  return {
    token: { address_hash: address, decimals: "18", symbol, name: symbol, type: "ERC-20", reputation: "ok", ...over },
    token_id: null,
    value,
  };
}

const CONTRACT = "0x00000000000000000000000000000000000000aB";

describe("BlockscoutProvider against recorded vitalik.eth fixtures", () => {
  it("reads native and ERC-20 balances on Ethereum and skips NFTs and rows it cannot convert", async () => {
    const { p, calls } = provider(fromFixtures);
    const balances = await p.readBalances(VITALIK, "ethereum");
    const s = bySymbol(balances);
    expect(calls.map((c) => c.url.hostname)).toEqual(["eth.blockscout.com", "eth.blockscout.com"]);
    expect(calls.map((c) => c.url.pathname)).toEqual([`/api/v2/addresses/${VITALIK}`, `/api/v2/addresses/${VITALIK}/token-balances`]);

    expect(s.ETH?.contractAddress).toBeNull();
    expect(s.ETH?.rawAmount).toBe("6712603153701629485");
    expect(s.ETH?.amount).toBe(Number("6.712603153701629485"));
    expect(s.ETH?.decimals).toBe(18);

    expect(s.USDC?.contractAddress).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(s.USDC?.amount).toBe(37.192124);
    expect(s.USDC?.rawAmount).toBe("37192124");
    expect(s.USDC?.decimals).toBe(6);
    expect(s.USDT?.amount).toBe(291.368219);
    expect(s.WETH?.contractAddress).toBe("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

    expect(s.MOODENG?.decimals).toBe(9);
    expect(s.MOODENG?.amount).toBe(Number("30002309255.968834506"));

    expect(s["(none)"]?.contractAddress).toBe("0x7b1395239e9dce0f4bc676f9ad0c0a671de02d67");
    expect(s["(none)"]?.decimals).toBe(9);

    expect(s.ENS).toBeUndefined();
    expect(s.OPENSTORE).toBeUndefined();
    expect(balances.some((b) => b.contractAddress === "0x6b491ae7f8e15b6fbec0d4f084f6c42763e9ea4f")).toBe(false);
    expect(balances).toHaveLength(6);
    expect(balances.every((b) => b.provider === "blockscout" && b.chain === "ethereum")).toBe(true);
    expect(balances.every((b) => b.contractAddress === null || b.contractAddress === b.contractAddress.toLowerCase())).toBe(true);
    expect(balances.every((b) => b.amount > 0)).toBe(true);
  });

  it("marks only tokens with reputation ok as not spam", async () => {
    const rows = fixture("blockscout-eth-token-balances.json");
    rows[3].token.reputation = "scam";
    delete rows[2].token.reputation;
    const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json(rows) : json(fixture("blockscout-eth-address.json"))));
    const s = bySymbol(await p.readBalances(VITALIK, "ethereum"));
    expect(s.WETH?.looksLikeSpam).toBe(false);
    expect(s.USDT?.looksLikeSpam).toBe(false);
    expect(s.USDC?.looksLikeSpam).toBe(true);
    expect(s.MOODENG?.looksLikeSpam).toBe(true);
  });

  it("reads Base and ignores token rows whose token is null", async () => {
    const { p, calls } = provider(fromFixtures);
    const balances = await p.readBalances(VITALIK, "base");
    const s = bySymbol(balances);
    expect(calls.every((c) => c.url.hostname === "base.blockscout.com")).toBe(true);
    expect(Object.keys(s).sort()).toEqual(["AERO", "ETH", "USDC", "WETH"]);
    expect(s.USDC?.contractAddress).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    expect(s.USDC?.amount).toBe(43.286078);
    expect(s.ETH?.amount).toBe(3.1287699390066044);
  });

  it("reads Arbitrum", async () => {
    const { p, calls } = provider(fromFixtures);
    const balances = await p.readBalances(VITALIK, "arbitrum");
    expect(calls.every((c) => c.url.hostname === "arbitrum.blockscout.com")).toBe(true);
    const s = bySymbol(balances);
    expect(s.USDC?.contractAddress).toBe("0xaf88d065e77c8cc2239327c5edb3a432268e5831");
    expect(s.USDC?.amount).toBe(158.021811);
    expect(s.ARB?.amount).toBe(Number("23.671066717268252605"));
    expect(balances.some((b) => b.contractAddress === null)).toBe(true);
  });
});

describe("BlockscoutProvider price hint", () => {
  it("fills usdRateHint from token.exchange_rate on the recorded fixtures and leaves native at null", async () => {
    const { p } = provider(fromFixtures);
    const s = bySymbol(await p.readBalances(VITALIK, "ethereum"));
    expect(s.WETH?.usdRateHint).toBe(2670.78);
    expect(s.USDC?.usdRateHint).toBe(0.999695);
    expect(s.MOODENG?.usdRateHint).toBe(0.00000437);
    expect(s["(none)"]?.usdRateHint).toBeNull();
    expect(s.ETH?.usdRateHint).toBeNull();
  });

  it.each([null, undefined, "", "  ", "abc", "0", "-1", "NaN", "Infinity", "-Infinity", {}, true])("maps exchange_rate %j to null", async (rate) => {
    const row = tokenRow("X", CONTRACT, "1000000000000000000", { exchange_rate: rate });
    const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json([row]) : json({ coin_balance: null })));
    const balances = await p.readBalances(ADDR, "ethereum");
    expect(balances).toHaveLength(1);
    expect(balances[0]?.usdRateHint).toBeNull();
  });

  it("parses a numeric-string rate and accepts a numeric rate", async () => {
    const rows = [tokenRow("S", CONTRACT, "1", { exchange_rate: "12.5" }), tokenRow("N", "0x00000000000000000000000000000000000000cd", "1", { exchange_rate: 3.5 })];
    const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json(rows) : json({ coin_balance: null })));
    expect((await p.readBalances(ADDR, "ethereum")).map((b) => b.usdRateHint)).toEqual([12.5, 3.5]);
  });

  it("declares that it provides price hints", () => {
    expect(provider(fromFixtures).p.providesUsdRateHint).toBe(true);
  });
});

describe("BlockscoutProvider empty and zero cases", () => {
  it("treats HTTP 404 on both endpoints as an empty wallet, not an error", async () => {
    const { p } = provider(() => json({ message: "Not found" }, 404));
    expect(await p.readBalances(ADDR, "ethereum")).toEqual([]);
  });

  it("returns no native balance when coin_balance is null or zero", async () => {
    for (const coin of [null, "0"]) {
      const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json([]) : json({ coin_balance: coin, hash: ADDR })));
      expect(await p.readBalances(ADDR, "base")).toEqual([]);
    }
  });

  it("skips ERC-20 rows with a zero balance", async () => {
    const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json([tokenRow("ZERO", CONTRACT, "0"), tokenRow("ONE", CONTRACT, "1000000000000000000")]) : json({ coin_balance: null })));
    const balances = await p.readBalances(ADDR, "ethereum");
    expect(balances.map((b) => b.symbol)).toEqual(["ONE"]);
    expect(balances[0]?.amount).toBe(1);
  });

  it("skips ERC-20 rows with unusable decimals or address instead of guessing", async () => {
    const rows = [
      tokenRow("NODEC", CONTRACT, "5", { decimals: null }),
      tokenRow("BADDEC", CONTRACT, "5", { decimals: "abc" }),
      tokenRow("HUGEDEC", CONTRACT, "5", { decimals: "999" }),
      tokenRow("BADADDR", "not-an-address", "5"),
      tokenRow("GOOD", CONTRACT, "5", { decimals: "0" }),
    ];
    const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json(rows) : json({ coin_balance: null })));
    const balances = await p.readBalances(ADDR, "ethereum");
    expect(balances.map((b) => b.symbol)).toEqual(["GOOD"]);
    expect(balances[0]?.amount).toBe(5);
  });

  it("skips non ERC-20 token types", async () => {
    const rows = [tokenRow("NFT", CONTRACT, "1", { type: "ERC-721" }), tokenRow("MULTI", CONTRACT, "3", { type: "ERC-1155" }), tokenRow("F404", CONTRACT, "3", { type: "ERC-404" })];
    const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json(rows) : json({ coin_balance: null })));
    expect(await p.readBalances(ADDR, "ethereum")).toEqual([]);
  });
});

describe("BlockscoutProvider pagination", () => {
  function pagedHandler(pages: number) {
    return (url: URL) => {
      if (!url.pathname.endsWith("/token-balances")) return json({ coin_balance: null });
      const page = Number(url.searchParams.get("page") ?? "1");
      const items = [tokenRow(`P${page}`, `0x${String(page).padStart(40, "0")}`, "1000000000000000000")];
      if (page < pages) return json({ items, next_page_params: { page: page + 1, items_count: 50, token_type: "ERC-20", value: null } });
      return json({ items, next_page_params: null });
    };
  }

  it("follows next_page_params across pages and forwards them as a query string", async () => {
    const { p, calls } = provider(pagedHandler(3));
    const balances = await p.readBalances(ADDR, "ethereum");
    expect(balances.map((b) => b.symbol)).toEqual(["P1", "P2", "P3"]);
    const tokenCalls = calls.filter((c) => c.url.pathname.endsWith("/token-balances"));
    expect(tokenCalls).toHaveLength(3);
    expect(tokenCalls[1]?.url.searchParams.get("page")).toBe("2");
    expect(tokenCalls[1]?.url.searchParams.get("items_count")).toBe("50");
    expect(tokenCalls[1]?.url.searchParams.has("value")).toBe(false);
  });

  it("fails with bad_response instead of returning a truncated list when pages keep coming", async () => {
    const { p, calls } = provider(pagedHandler(10));
    const error = await readError(p.readBalances(ADDR, "ethereum"));
    expect(error.kind).toBe("bad_response");
    expect(error.chain).toBe("ethereum");
    expect(calls.filter((c) => c.url.pathname.endsWith("/token-balances"))).toHaveLength(3);
  });

  it("rejects an object body that has no items list", async () => {
    const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json({ message: "weird" }) : json({ coin_balance: null })));
    expect((await readError(p.readBalances(ADDR, "ethereum"))).kind).toBe("bad_response");
  });
});

describe("BlockscoutProvider failures", () => {
  it("retries once on 429 when Retry-After is at most 2 seconds", async () => {
    let first = true;
    const { p, slept, calls } = provider((url) => {
      if (url.pathname.endsWith("/token-balances")) return json([]);
      if (first) {
        first = false;
        return json({ message: "slow down" }, 429, { "retry-after": "1" });
      }
      return json({ coin_balance: "1000000000000000000" });
    });
    const balances = await p.readBalances(ADDR, "ethereum");
    expect(slept).toEqual([1000]);
    expect(balances[0]?.amount).toBe(1);
    expect(calls).toHaveLength(3);
  });

  it("does not retry on 429 when Retry-After is above 2 seconds", async () => {
    const { p, slept, calls } = provider(() => json({}, 429, { "retry-after": "3" }));
    const error = await readError(p.readBalances(ADDR, "ethereum"));
    expect(error.kind).toBe("rate_limited");
    expect(slept).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("does not retry on 429 without a Retry-After header or with an unparseable one", async () => {
    const variants: Record<string, string>[] = [{}, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }];
    for (const headers of variants) {
      const { p, slept, calls } = provider(() => json({}, 429, headers));
      expect((await readError(p.readBalances(ADDR, "ethereum"))).kind).toBe("rate_limited");
      expect(slept).toEqual([]);
      expect(calls).toHaveLength(1);
    }
  });

  it("gives up with rate_limited when the retry is throttled too", async () => {
    const { p, slept, calls } = provider(() => json({}, 429, { "retry-after": "1" }));
    const error = await readError(p.readBalances(ADDR, "base"));
    expect(error.kind).toBe("rate_limited");
    expect(error.chain).toBe("base");
    expect(slept).toEqual([1000]);
    expect(calls).toHaveLength(2);
  });

  it("classifies a server error as network", async () => {
    const { p } = provider(() => text("upstream down", 503));
    const error = await readError(p.readBalances(ADDR, "ethereum"));
    expect(error.kind).toBe("network");
    expect(error.detail).toBe("HTTP 503");
  });

  it("classifies a failing fetch as network", async () => {
    const { p } = provider(() => {
      throw new Error("ECONNRESET");
    });
    const error = await readError(p.readBalances(ADDR, "ethereum"));
    expect(error.kind).toBe("network");
    expect(error.detail).toBe("ECONNRESET");
  });

  it("aborts a hanging request after timeoutMs and reports timeout", async () => {
    const p = new BlockscoutProvider({ fetchImpl: hangingFetch, timeoutMs: 30 });
    const error = await readError(p.readBalances(ADDR, "arbitrum"));
    expect(error.kind).toBe("timeout");
    expect(error.chain).toBe("arbitrum");
    expect(error.provider).toBe("blockscout");
  });

  it("passes an abort signal on every request", async () => {
    const { p, calls } = provider(fromFixtures);
    await p.readBalances(VITALIK, "ethereum");
    expect(calls.every((c) => c.init?.signal instanceof AbortSignal)).toBe(true);
  });

  it("rejects a non-JSON body", async () => {
    const { p } = provider(() => text("<html>oops</html>"));
    expect((await readError(p.readBalances(ADDR, "ethereum"))).kind).toBe("bad_response");
  });

  it("rejects an address response without coin_balance", async () => {
    const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json([]) : json({ hash: ADDR })));
    expect((await readError(p.readBalances(ADDR, "ethereum"))).kind).toBe("bad_response");
  });

  it.each([5, "1.5", "-3", "abc"])("rejects coin_balance %j", async (coin) => {
    const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json([]) : json({ coin_balance: coin })));
    expect((await readError(p.readBalances(ADDR, "ethereum"))).kind).toBe("bad_response");
  });

  it("rejects an ERC-20 whose balance is not a raw-unit string", async () => {
    const { p } = provider((url) => (url.pathname.endsWith("/token-balances") ? json([tokenRow("BAD", CONTRACT, "1.5")]) : json({ coin_balance: null })));
    expect((await readError(p.readBalances(ADDR, "ethereum"))).kind).toBe("bad_response");
  });

  it("puts the chain in every error", async () => {
    const { p } = provider(() => text("x", 500));
    const error = await readError(p.readBalances(ADDR, "arbitrum"));
    expect(error).toBeInstanceOf(ChainReadError);
    expect(error.message).toContain("Arbitrum");
  });
});

describe("BlockscoutProvider configuration", () => {
  it("gives a busy wallet thirty seconds before giving up, and honours an override", () => {
    expect(new BlockscoutProvider().timeoutMs).toBe(30_000);
    expect(new BlockscoutProvider({ timeoutMs: 5 }).timeoutMs).toBe(5);
  });

  it("supports the three chains and rejects an unknown one", () => {
    const { p } = provider(fromFixtures);
    for (const chain of ["ethereum", "base", "arbitrum"] as Chain[]) expect(p.supports(chain)).toBe(true);
    expect(p.supports("polygon" as Chain)).toBe(false);
  });

  it("refuses to read a chain it has no host for", async () => {
    const { p } = provider(fromFixtures);
    expect((await readError(p.readBalances(ADDR, "polygon" as Chain))).kind).toBe("bad_response");
  });

  it("uses a base URL override for one chain and defaults for the others", async () => {
    const { p, calls } = provider((url) => (url.pathname.endsWith("/token-balances") ? json([]) : json({ coin_balance: null })), { baseUrls: { base: "https://mirror.example/" } });
    await p.readBalances(ADDR, "base");
    await p.readBalances(ADDR, "ethereum");
    expect(calls.map((c) => c.url.origin)).toEqual(["https://mirror.example", "https://mirror.example", "https://eth.blockscout.com", "https://eth.blockscout.com"]);
  });
});
