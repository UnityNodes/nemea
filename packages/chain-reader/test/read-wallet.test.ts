import type { Chain, TokenMeta } from "@nemea/shared-types";
import { describe, expect, it } from "vitest";
import { ChainReadError, NATIVE_CMC_ID, UNLISTED_REASON, readWallet, type BalanceProvider, type ChainReadErrorKind, type RawBalance } from "../src/index.ts";
import { VITALIK } from "./helpers.ts";

const USDC_ETH = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const SHARED = "0x1111111111111111111111111111111111111111";
const SPAM = "0x2222222222222222222222222222222222222222";
const IMPOSTOR = "0x3333333333333333333333333333333333333333";

function raw(chain: Chain, contract: string | null, symbol: string | null, amount: number, over: Partial<RawBalance> = {}): RawBalance {
  return { chain, contractAddress: contract, symbol, decimals: 18, rawAmount: String(amount), amount, provider: "fake", looksLikeSpam: false, usdRateHint: null, ...over };
}

function meta(cmcId: number, symbol: string, name: string, contracts: { chain: Chain; address: string }[]): TokenMeta {
  return { cmcId, symbol, name, slug: name.toLowerCase(), tags: [], category: null, isStablecoin: false, contracts, dateAdded: null, fetchedAt: "2026-09-21T00:00:00.000Z" };
}

function fakeProvider(name: string, handler: (address: string, chain: Chain) => Promise<RawBalance[]> | RawBalance[], providesUsdRateHint = false): BalanceProvider & { calls: Chain[] } {
  const calls: Chain[] = [];
  return {
    name,
    providesUsdRateHint,
    calls,
    supports: () => true,
    readBalances: async (address, chain) => {
      calls.push(chain);
      return handler(address, chain);
    },
  };
}

function failing(name: string, kind: ChainReadErrorKind, detail: string | null = null) {
  return fakeProvider(name, (_address, chain) => {
    throw new ChainReadError(chain, name, kind, detail);
  });
}

function fakeCmc(metas: TokenMeta[]) {
  const calls: string[][] = [];
  return {
    calls,
    cmc: {
      getInfoBySymbols: async (symbols: readonly string[]) => {
        calls.push([...symbols]);
        const wanted = new Set(symbols.map((x) => x.toUpperCase()));
        return metas.filter((m) => wanted.has(m.symbol.toUpperCase()));
      },
    },
  };
}

function all(p: BalanceProvider[]): Record<Chain, BalanceProvider[]> {
  return { ethereum: p, base: p, arbitrum: p };
}

const ALL_CHAINS: Chain[] = ["ethereum", "base", "arbitrum"];

describe("readWallet provider fallback", () => {
  it("falls back from a plan_unsupported Etherscan to Blockscout on the same chain", async () => {
    const etherscan = failing("etherscan", "plan_unsupported", "Base needs a paid Etherscan key");
    const blockscout = fakeProvider("blockscout", (_a, chain) => [raw(chain, null, "ETH", 0.5)]);
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["base"], providers: all([etherscan, blockscout]), cmc });
    expect(etherscan.calls).toEqual(["base"]);
    expect(blockscout.calls).toEqual(["base"]);
    expect(preview.chainErrors).toEqual([]);
    expect(preview.items).toEqual([{ cmcId: NATIVE_CMC_ID, symbol: "ETH", name: "Ethereum", amount: 0.5, chain: "base", contractAddress: null }]);
  });

  it.each(["plan_unsupported", "network", "timeout", "rate_limited"] as ChainReadErrorKind[])("falls through on %s", async (kind) => {
    const first = failing("first", kind);
    const second = fakeProvider("second", (_a, chain) => [raw(chain, null, "ETH", 1)]);
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([first, second]), cmc });
    expect(second.calls).toEqual(["ethereum"]);
    expect(preview.items).toHaveLength(1);
    expect(preview.chainErrors).toEqual([]);
  });

  it("does not fall through on bad_response and reports that chain as failed", async () => {
    const first = failing("first", "bad_response", "garbage");
    const second = fakeProvider("second", (_a, chain) => [raw(chain, null, "ETH", 1)]);
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([first, second]), cmc });
    expect(second.calls).toEqual([]);
    expect(preview.items).toEqual([]);
    expect(preview.chainErrors).toEqual([{ chain: "ethereum", message: "first: bad_response — garbage" }]);
  });

  it("reports every provider's failure when all of them fail, and keeps the other chains", async () => {
    const etherscan = fakeProvider("etherscan", (_a, chain) => {
      if (chain === "base") throw new ChainReadError(chain, "etherscan", "plan_unsupported", "Base needs a paid Etherscan key");
      return [raw(chain, null, "ETH", 2)];
    });
    const blockscout = fakeProvider("blockscout", (_a, chain) => {
      if (chain === "base") throw new ChainReadError(chain, "blockscout", "timeout", "no answer within 12000ms");
      return [raw(chain, null, "ETH", 99)];
    });
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ALL_CHAINS, providers: all([etherscan, blockscout]), cmc });
    expect(preview.chainErrors).toEqual([{ chain: "base", message: "etherscan: plan_unsupported — Base needs a paid Etherscan key; blockscout: timeout — no answer within 12000ms" }]);
    expect(preview.items.map((i) => [i.chain, i.amount])).toEqual([["ethereum", 2], ["arbitrum", 2]]);
    expect(blockscout.calls).toEqual(["base"]);
  });

  it("omits the dash when a failure has no detail", async () => {
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([failing("a", "timeout"), failing("b", "network")]), cmc });
    expect(preview.chainErrors).toEqual([{ chain: "ethereum", message: "a: timeout; b: network" }]);
  });

  it("lets an unexpected non-ChainReadError bubble up instead of hiding it", async () => {
    const buggy = fakeProvider("buggy", () => {
      throw new TypeError("boom");
    });
    const { cmc } = fakeCmc([]);
    await expect(readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([buggy]), cmc })).rejects.toThrow("boom");
  });

  it("skips providers that do not support the chain and reports when none is left", async () => {
    const onlyEth: BalanceProvider = { name: "only-eth", supports: (c) => c === "ethereum", readBalances: async (_a, chain) => [raw(chain, null, "ETH", 1)] };
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum", "base"], providers: all([onlyEth]), cmc });
    expect(preview.items.map((i) => i.chain)).toEqual(["ethereum"]);
    expect(preview.chainErrors).toEqual([{ chain: "base", message: "no balance provider is configured for this chain" }]);
  });

  it("reports a chain with no provider list at all", async () => {
    const { cmc } = fakeCmc([]);
    const providers = { ethereum: [fakeProvider("p", (_a, c) => [raw(c, null, "ETH", 1)])] } as unknown as Record<Chain, BalanceProvider[]>;
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum", "arbitrum"], providers, cmc });
    expect(preview.items).toHaveLength(1);
    expect(preview.chainErrors.map((e) => e.chain)).toEqual(["arbitrum"]);
  });

  it("reads chains in parallel", async () => {
    let started = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const p = fakeProvider("gated", async (_a, chain) => {
      started += 1;
      if (started === 3) release();
      await gate;
      return [raw(chain, null, "ETH", 1)];
    });
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ALL_CHAINS, providers: all([p]), cmc });
    expect(preview.items).toHaveLength(3);
  });
});

describe("readWallet input validation", () => {
  it.each(["", "vitalik.eth", "0x123", "d8dA6BF26964aF9D7eEd9e03E53415D37aA96045", `${VITALIK}00`, "0xZZdA6BF26964aF9D7eEd9e03E53415D37aA96045", ` ${VITALIK}`])("rejects the address %j without touching a provider", async (address) => {
    const p = fakeProvider("p", () => []);
    const { cmc, calls } = fakeCmc([]);
    await expect(readWallet({ address, chains: ["ethereum"], providers: all([p]), cmc })).rejects.toThrow(/not an EVM address/);
    expect(p.calls).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("rejects an empty chain list and an unknown chain", async () => {
    const p = fakeProvider("p", () => []);
    const { cmc } = fakeCmc([]);
    await expect(readWallet({ address: VITALIK, chains: [], providers: all([p]), cmc })).rejects.toThrow(/no chain requested/);
    await expect(readWallet({ address: VITALIK, chains: ["ethereum", "polygon" as Chain], providers: all([p]), cmc })).rejects.toThrow(/unsupported chain: polygon/);
    expect(p.calls).toEqual([]);
  });

  it("reads a duplicated chain once", async () => {
    const p = fakeProvider("p", (_a, c) => [raw(c, null, "ETH", 1)]);
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["base", "base"], providers: all([p]), cmc });
    expect(p.calls).toEqual(["base"]);
    expect(preview.items).toHaveLength(1);
  });

  it("returns the address it was given", async () => {
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([fakeProvider("p", () => [])]), cmc });
    expect(preview.address).toBe(VITALIK);
  });
});

describe("readWallet CoinMarketCap matching", () => {
  it("uses CMC's symbol and name, lowercases the contract and maps native ETH to id 1027", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, null, "WEIRD", 3), raw(chain, USDC_ETH.toUpperCase().replace("0X", "0x"), "usdc", 250, { looksLikeSpam: false })]);
    const { cmc } = fakeCmc([meta(3408, "USDC", "USD Coin", [{ chain: "ethereum", address: USDC_ETH }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.items).toEqual([
      { cmcId: 3408, symbol: "USDC", name: "USD Coin", amount: 250, chain: "ethereum", contractAddress: USDC_ETH },
      { cmcId: 1027, symbol: "ETH", name: "Ethereum", amount: 3, chain: "ethereum", contractAddress: null },
    ]);
    expect(preview.skipped).toEqual([]);
  });

  it("skips a token CMC does not list, with a reason that says why", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, SPAM, "AIRDROP", 1_000_000, { looksLikeSpam: false })]);
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.items).toEqual([]);
    expect(preview.skipped).toEqual([{ chain: "ethereum", contractAddress: SPAM, symbol: "AIRDROP", reason: UNLISTED_REASON }]);
    expect(UNLISTED_REASON).toBe("Not listed on CoinMarketCap — usually airdrop spam, ignored");
  });

  it("mentions the provider when it flagged the token as spam", async () => {
    const p = fakeProvider("blockscout", (_a, chain) => [raw(chain, SPAM, "SPAMMY", 5, { looksLikeSpam: true, provider: "blockscout" })]);
    const { cmc } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.skipped[0]?.symbol).toBe("SPAMMY");
    expect(preview.skipped[0]?.reason).toContain(UNLISTED_REASON);
    expect(preview.skipped[0]?.reason).toContain("blockscout does not vouch for this token");
  });

  it("matches on (chain, address): the same address listed on another chain must not match (negative control)", async () => {
    const p = fakeProvider("p", (_a, chain) => (chain === "base" ? [raw("base", SHARED, "REAL", 7)] : chain === "ethereum" ? [raw("ethereum", SHARED, "REAL", 9)] : []));
    const { cmc } = fakeCmc([meta(555, "REAL", "Real Token", [{ chain: "ethereum", address: SHARED }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum", "base"], providers: all([p]), cmc });
    expect(preview.items).toEqual([{ cmcId: 555, symbol: "REAL", name: "Real Token", amount: 9, chain: "ethereum", contractAddress: SHARED }]);
    expect(preview.skipped).toEqual([{ chain: "base", contractAddress: SHARED, symbol: "REAL", reason: UNLISTED_REASON }]);
  });

  it("does not match a token that only shares CMC's symbol (negative control)", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, IMPOSTOR, "USDC", 1_000_000)]);
    const { cmc } = fakeCmc([meta(3408, "USDC", "USD Coin", [{ chain: "ethereum", address: USDC_ETH }, { chain: "base", address: USDC_BASE }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum", "base"], providers: all([p]), cmc });
    expect(preview.items).toEqual([]);
    expect(preview.skipped.map((s) => s.contractAddress)).toEqual([IMPOSTOR, IMPOSTOR]);
  });

  it("matches the right listing when one CMC id has several chains", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, chain === "ethereum" ? USDC_ETH : USDC_BASE, "USDC", 10)]);
    const { cmc } = fakeCmc([meta(3408, "USDC", "USD Coin", [{ chain: "ethereum", address: USDC_ETH }, { chain: "base", address: USDC_BASE }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum", "base"], providers: all([p]), cmc });
    expect(preview.items.map((i) => [i.chain, i.contractAddress])).toEqual([["ethereum", USDC_ETH], ["base", USDC_BASE]]);
  });

  it("compares addresses case-insensitively against CMC contracts", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, USDC_ETH, "USDC", 1)]);
    const { cmc } = fakeCmc([meta(3408, "USDC", "USD Coin", [{ chain: "ethereum", address: USDC_ETH.toUpperCase().replace("0X", "0x") }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.items).toHaveLength(1);
  });

  it("dedupes the same (chain, address) reported twice and keeps the first amount", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, USDC_ETH, "USDC", 10), raw(chain, USDC_ETH.toUpperCase().replace("0X", "0x"), "USDC", 99)]);
    const { cmc } = fakeCmc([meta(3408, "USDC", "USD Coin", [{ chain: "ethereum", address: USDC_ETH }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.items.map((i) => i.amount)).toEqual([10]);
  });

  it("sends one CMC request with the unique symbols across chains and case spellings", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, SHARED, "s", 1), raw(chain, SPAM, "X", 1), raw(chain, IMPOSTOR, "S", 1)]);
    const { cmc, calls } = fakeCmc([]);
    await readWallet({ address: VITALIK, chains: ALL_CHAINS, providers: all([p]), cmc });
    expect(calls).toEqual([["S", "X"]]);
  });

  it("does not call CMC when there are only native balances", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, null, "ETH", 1)]);
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ALL_CHAINS, providers: all([p]), cmc });
    expect(calls).toEqual([]);
    expect(preview.items).toHaveLength(3);
  });

  it("ignores balances whose amount is not positive", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, null, "ETH", 0), raw(chain, SPAM, "Z", 0), raw(chain, SHARED, "N", Number.NaN), raw(chain, IMPOSTOR, "NEG", -1)]);
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.items).toEqual([]);
    expect(preview.skipped).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("sorts items by chain order, then by amount descending", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, null, "ETH", 1), raw(chain, SHARED, "A", 50), raw(chain, SPAM, "B", 5)]);
    const { cmc } = fakeCmc([meta(10, "A", "A coin", ALL_CHAINS.map((c) => ({ chain: c, address: SHARED }))), meta(20, "B", "B coin", ALL_CHAINS.map((c) => ({ chain: c, address: SPAM })))]);
    const preview = await readWallet({ address: VITALIK, chains: ["arbitrum", "base", "ethereum"], providers: all([p]), cmc });
    expect(preview.items.map((i) => `${i.chain}:${i.symbol}:${i.amount}`)).toEqual([
      "ethereum:A:50", "ethereum:B:5", "ethereum:ETH:1",
      "base:A:50", "base:B:5", "base:ETH:1",
      "arbitrum:A:50", "arbitrum:B:5", "arbitrum:ETH:1",
    ]);
  });

  it("rethrows a CMC failure instead of pretending nothing matched", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, USDC_ETH, "USDC", 1)]);
    const cmc = { getInfoBySymbols: async () => { throw new Error("CMC rate limited"); } };
    await expect(readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc })).rejects.toThrow("CMC rate limited");
  });

  it("keeps chain errors and matched items together when one chain failed", async () => {
    const p = fakeProvider("p", (_a, chain) => {
      if (chain === "base") throw new ChainReadError(chain, "p", "timeout");
      return [raw(chain, USDC_ETH, "USDC", 4)];
    });
    const { cmc } = fakeCmc([meta(3408, "USDC", "USD Coin", [{ chain: "ethereum", address: USDC_ETH }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum", "base"], providers: all([p]), cmc });
    expect(preview.items.map((i) => i.chain)).toEqual(["ethereum"]);
    expect(preview.chainErrors).toEqual([{ chain: "base", message: "p: timeout" }]);
  });
});

const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;

function priced(chain: Chain, n: number, amount: number, rate: number | null, over: Partial<RawBalance> = {}): RawBalance {
  return raw(chain, addr(n), `T${n}`, amount, { usdRateHint: rate, provider: "hinted", ...over });
}

function hintedProvider(handler: (chain: Chain) => RawBalance[]) {
  return fakeProvider("hinted", (_a, chain) => handler(chain), true);
}

describe("readWallet pre-filter before CoinMarketCap", () => {
  it("drops tokens with no rate and tokens under $1, and sends only the rest to CMC", async () => {
    const p = hintedProvider((chain) => [
      priced(chain, 1, 100, 0.5),
      priced(chain, 2, 5, null),
      priced(chain, 3, 99, 0.01),
      priced(chain, 4, 1_000_000, 0.0000001),
      priced(chain, 5, 3, 10),
    ]);
    const { cmc, calls } = fakeCmc([meta(1, "T1", "A coin", [{ chain: "ethereum", address: addr(1) }]), meta(5, "T5", "E coin", [{ chain: "ethereum", address: addr(5) }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([["T1", "T5"]]);
    expect(preview.items.map((i) => [i.cmcId, i.amount])).toEqual([[1, 100], [5, 3]]);
    expect(preview.skipped).toEqual([{ chain: "ethereum", contractAddress: null, symbol: null, reason: "3 tokens with no market price or worth under $1 were ignored (mostly airdrop spam)" }]);
  });

  it("keeps a token worth exactly $1.00 and drops one worth $0.99", async () => {
    const p = hintedProvider((chain) => [priced(chain, 1, 2, 0.5), priced(chain, 2, 99, 0.01)]);
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([["T1"]]);
    expect(preview.skipped.filter((s) => s.contractAddress === null)).toEqual([{ chain: "ethereum", contractAddress: null, symbol: null, reason: "1 tokens with no market price or worth under $1 were ignored (mostly airdrop spam)" }]);
    expect(preview.skipped.filter((s) => s.contractAddress === addr(1))).toHaveLength(1);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -5, 0])("drops a token whose rate hint is %s", async (rate) => {
    const p = hintedProvider((chain) => [priced(chain, 1, 1000, rate)]);
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([]);
    expect(preview.skipped.map((s) => s.reason)).toEqual(["1 tokens with no market price or worth under $1 were ignored (mostly airdrop spam)"]);
  });

  it("keeps only the 60 largest by hinted value per chain and counts the rest", async () => {
    const p = hintedProvider((chain) => Array.from({ length: 70 }, (_, i) => priced(chain, i + 1, 1, 10 + i)));
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    const expected = Array.from({ length: 60 }, (_, i) => `T${70 - i}`);
    expect(calls).toEqual([expected]);
    expect(preview.skipped.filter((s) => s.contractAddress === null)).toEqual([{ chain: "ethereum", contractAddress: null, symbol: null, reason: "10 smaller tokens beyond the 60 largest were not checked" }]);
    expect(calls[0]).not.toContain("T1");
    expect(calls[0]).toContain("T11");
  });

  it("emits both aggregate entries when tokens were dropped and capped, without one entry per dropped token", async () => {
    const p = hintedProvider((chain) => [...Array.from({ length: 62 }, (_, i) => priced(chain, i + 1, 1, 100 + i)), ...Array.from({ length: 500 }, (_, i) => priced(chain, 1000 + i, 1, null))]);
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls[0]).toHaveLength(60);
    const aggregates = preview.skipped.filter((s) => s.contractAddress === null);
    expect(aggregates.map((s) => s.reason)).toEqual([
      "500 tokens with no market price or worth under $1 were ignored (mostly airdrop spam)",
      "2 smaller tokens beyond the 60 largest were not checked",
    ]);
    expect(aggregates.every((s) => s.chain === "ethereum" && s.symbol === null)).toBe(true);
    expect(preview.skipped).toHaveLength(2 + 60);
  });

  it("emits no aggregate entry when nothing was dropped", async () => {
    const p = hintedProvider((chain) => [priced(chain, 1, 10, 1)]);
    const { cmc } = fakeCmc([meta(1, "T1", "A", [{ chain: "ethereum", address: addr(1) }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.skipped).toEqual([]);
    expect(preview.items).toHaveLength(1);
  });

  it("filters per chain: the cap and the aggregate counts are independent", async () => {
    const p = hintedProvider((chain) => {
      if (chain === "ethereum") return [priced(chain, 1, 1, 50), priced(chain, 2, 1, null), priced(chain, 3, 1, null)];
      if (chain === "base") return Array.from({ length: 61 }, (_, i) => priced(chain, 100 + i, 1, 10 + i));
      return [priced(chain, 200, 1, 20)];
    });
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ALL_CHAINS, providers: all([p]), cmc });
    const list = calls[0] ?? [];
    expect(calls).toHaveLength(1);
    expect(list).toHaveLength(1 + 60 + 1);
    expect(list[0]).toBe("T1");
    expect(preview.skipped.filter((s) => s.contractAddress === null).map((s) => [s.chain, s.reason])).toEqual([
      ["ethereum", "2 tokens with no market price or worth under $1 were ignored (mostly airdrop spam)"],
      ["base", "1 smaller tokens beyond the 60 largest were not checked"],
    ]);
  });

  it("drops a legitimate token that has no rate and counts it (documented behaviour)", async () => {
    const p = hintedProvider((chain) => [priced(chain, 1, 500, null, { symbol: "REAL" })]);
    const { cmc, calls } = fakeCmc([meta(1, "REAL", "Real Coin", [{ chain: "ethereum", address: addr(1) }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([]);
    expect(preview.items).toEqual([]);
    expect(preview.skipped).toEqual([{ chain: "ethereum", contractAddress: null, symbol: null, reason: "1 tokens with no market price or worth under $1 were ignored (mostly airdrop spam)" }]);
  });

  it("never filters native ETH, whatever its hint", async () => {
    const p = hintedProvider((chain) => [raw(chain, null, "ETH", 0.00001, { usdRateHint: null }), raw(chain, null, "ETH", 0.00002, { usdRateHint: 0.0001 })]);
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.items.map((i) => [i.cmcId, i.contractAddress, i.amount])).toEqual([[NATIVE_CMC_ID, null, 0.00002], [NATIVE_CMC_ID, null, 0.00001]]);
    expect(preview.skipped).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("uses the hint only as a filter: amounts come from the raw balance and the hint is never exposed", async () => {
    const p = hintedProvider((chain) => [priced(chain, 1, 1234.5, 0.0123), priced(chain, 2, 50, 4.56)]);
    const { cmc } = fakeCmc([meta(1, "T1", "A coin", [{ chain: "ethereum", address: addr(1) }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.items).toEqual([{ cmcId: 1, symbol: "T1", name: "A coin", amount: 1234.5, chain: "ethereum", contractAddress: addr(1) }]);
    const text = JSON.stringify(preview);
    for (const leaked of ["0.0123", "4.56", "usdRateHint", "hintValue", "15.18"]) expect(text).not.toContain(leaked);
  });

  it("still requires a CMC (chain, address) match for a token the hint kept", async () => {
    const p = hintedProvider((chain) => [priced(chain, 1, 1_000_000, 5, { symbol: "FAKE" })]);
    const { cmc } = fakeCmc([meta(9, "FAKE", "Fake", [{ chain: "base", address: addr(1) }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.items).toEqual([]);
    expect(preview.skipped).toEqual([{ chain: "ethereum", contractAddress: addr(1), symbol: "FAKE", reason: UNLISTED_REASON }]);
  });

  it("takes the hint behaviour from the provider that answered, not the first one tried", async () => {
    const hintedFails = fakeProvider("hinted", (_a, chain) => {
      throw new ChainReadError(chain, "hinted", "timeout");
    }, true);
    const unhinted = fakeProvider("plain", (_a, chain) => [raw(chain, addr(1), "A", 1, { usdRateHint: null })]);
    const { cmc, calls } = fakeCmc([]);
    await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([hintedFails, unhinted]), cmc });
    expect(calls).toEqual([["A"]]);
  });
});

describe("readWallet cap for providers without a price hint", () => {
  it("keeps tokens that have no hint but sends at most the first 40 per chain and counts the rest", async () => {
    const p = fakeProvider("etherscan-like", (_a, chain) => Array.from({ length: 45 }, (_, i) => raw(chain, addr(i + 1), `T${i}`, 1, { usdRateHint: null })));
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([Array.from({ length: 40 }, (_, i) => `T${i}`)]);
    expect(preview.skipped.filter((s) => s.contractAddress === null)).toEqual([{ chain: "ethereum", contractAddress: null, symbol: null, reason: "5 tokens beyond the first 40 were not checked" }]);
    expect(preview.skipped).toHaveLength(1 + 40);
  });

  it("does not drop small or unpriced tokens on the unhinted path", async () => {
    const p = fakeProvider("etherscan-like", (_a, chain) => [raw(chain, addr(1), "DUST", 0.000001, { usdRateHint: null })]);
    const { cmc, calls } = fakeCmc([meta(7, "DUST", "Dust", [{ chain: "ethereum", address: addr(1) }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([["DUST"]]);
    expect(preview.items.map((i) => i.cmcId)).toEqual([7]);
    expect(preview.skipped).toEqual([]);
  });

  it("applies the 40 cap per chain", async () => {
    const p = fakeProvider("etherscan-like", (_a, chain) => Array.from({ length: 41 }, (_, i) => raw(chain, addr((chain === "base" ? 1000 : 0) + i + 1), `${chain === "base" ? "B" : "E"}${i}`, 1)));
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum", "base"], providers: all([p]), cmc });
    expect(calls[0]).toHaveLength(80);
    expect(preview.skipped.filter((s) => s.contractAddress === null).map((s) => s.chain)).toEqual(["ethereum", "base"]);
  });
});

describe("readWallet symbol lookup", () => {
  const PEPE_REAL = addr(0x7e9e);
  const PEPE_FAKE_A = addr(0xfa1e);
  const PEPE_FAKE_B = addr(0xfb1e);

  it("finds the right coin when it is not the first one sharing the symbol", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, PEPE_REAL, "PEPE", 1000)]);
    const { cmc, calls } = fakeCmc([
      meta(901, "PEPE", "Pepe Clone A", [{ chain: "ethereum", address: PEPE_FAKE_A }]),
      meta(902, "PEPE", "Pepe Clone B", [{ chain: "base", address: PEPE_REAL }]),
      meta(24478, "PEPE", "Pepe", [{ chain: "ethereum", address: PEPE_REAL }]),
      meta(903, "PEPE", "Pepe Clone C", [{ chain: "ethereum", address: PEPE_FAKE_B }]),
    ]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([["PEPE"]]);
    expect(preview.items).toEqual([{ cmcId: 24478, symbol: "PEPE", name: "Pepe", amount: 1000, chain: "ethereum", contractAddress: PEPE_REAL }]);
    expect(preview.skipped).toEqual([]);
  });

  it("does not match a spam coin that shares the symbol but has a different contract (negative control)", async () => {
    const p = fakeProvider("blockscout", (_a, chain) => [raw(chain, PEPE_FAKE_A, "PEPE", 5_000_000, { looksLikeSpam: true, provider: "blockscout" })]);
    const { cmc } = fakeCmc([
      meta(24478, "PEPE", "Pepe", [{ chain: "ethereum", address: PEPE_REAL }]),
      meta(902, "PEPE", "Pepe Clone B", [{ chain: "base", address: PEPE_FAKE_A }]),
    ]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.items).toEqual([]);
    expect(preview.skipped).toEqual([{ chain: "ethereum", contractAddress: PEPE_FAKE_A, symbol: "PEPE", reason: `${UNLISTED_REASON} (blockscout does not vouch for this token)` }]);
  });

  it("looks up two tokens that share a symbol on one chain with a single symbol and matches each by contract", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, PEPE_REAL, "PEPE", 10), raw(chain, PEPE_FAKE_A, "pepe", 20)]);
    const { cmc, calls } = fakeCmc([meta(24478, "PEPE", "Pepe", [{ chain: "ethereum", address: PEPE_REAL }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([["PEPE"]]);
    expect(preview.items.map((i) => [i.cmcId, i.contractAddress])).toEqual([[24478, PEPE_REAL]]);
    expect(preview.skipped.map((x) => x.contractAddress)).toEqual([PEPE_FAKE_A]);
  });

  it("leaves a token unmatched when CMC lists it under a different symbol than the explorer reports", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, USDC_ETH, "USDC.e", 10)]);
    const { cmc, calls } = fakeCmc([meta(3408, "USDC", "USD Coin", [{ chain: "ethereum", address: USDC_ETH }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([["USDC.E"]]);
    expect(preview.items).toEqual([]);
    expect(preview.skipped).toEqual([{ chain: "ethereum", contractAddress: USDC_ETH, symbol: "USDC.e", reason: UNLISTED_REASON }]);
  });

  it.each([null, "", " ", "has space", "a/b", "x".repeat(21), "\u{1F4A9}", "USD C", "$$$"])("skips a token with the unusable symbol %j without asking CMC about it", async (symbol) => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, addr(1), symbol, 5), raw(chain, addr(2), "GOOD", 7)]);
    const { cmc, calls } = fakeCmc([meta(1, "GOOD", "Good", [{ chain: "ethereum", address: addr(2) }])]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([["GOOD"]]);
    expect(preview.items.map((i) => i.contractAddress)).toEqual([addr(2)]);
    expect(preview.skipped).toEqual([{ chain: "ethereum", contractAddress: addr(1), symbol, reason: "No usable token symbol, ignored" }]);
  });

  it("accepts the boundary symbols of 1 and 20 characters and the punctuation . _ -", async () => {
    const symbols = ["A", "A".repeat(20), "USDC.e", "a_b", "x-y"];
    const p = fakeProvider("p", (_a, chain) => symbols.map((sym, i) => raw(chain, addr(i + 1), sym, 1)));
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([["A", "A".repeat(20), "USDC.E", "A_B", "X-Y"]]);
    expect(preview.skipped.every((x) => x.reason === UNLISTED_REASON)).toBe(true);
  });

  it("does not call CMC when every kept token lacks a usable symbol", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, addr(1), null, 5), raw(chain, addr(2), "", 5)]);
    const { cmc, calls } = fakeCmc([]);
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(calls).toEqual([]);
    expect(preview.skipped.map((x) => x.reason)).toEqual(["No usable token symbol, ignored", "No usable token symbol, ignored"]);
  });

  it("asks about the symbols of kept tokens only, deduped across chains, in one call", async () => {
    const p = hintedProvider((chain) => [
      priced(chain, 1, 10, 1, { symbol: "shared" }),
      priced(chain, chain === "base" ? 3 : 2, 10, 1, { symbol: chain === "base" ? "BASEONLY" : "ETHONLY" }),
      priced(chain, 99, 10, null, { symbol: "DROPPED" }),
    ]);
    const { cmc, calls } = fakeCmc([]);
    await readWallet({ address: VITALIK, chains: ["ethereum", "base"], providers: all([p]), cmc });
    expect(calls).toEqual([["SHARED", "ETHONLY", "BASEONLY"]]);
  });

  it("never calls getInfoByAddresses", async () => {
    const p = fakeProvider("p", (_a, chain) => [raw(chain, USDC_ETH, "USDC", 1)]);
    const cmc = {
      getInfoBySymbols: async () => [] as TokenMeta[],
      getInfoByAddresses: async () => {
        throw new Error("address lookup is unusable");
      },
    };
    const preview = await readWallet({ address: VITALIK, chains: ["ethereum"], providers: all([p]), cmc });
    expect(preview.skipped).toHaveLength(1);
  });
});
