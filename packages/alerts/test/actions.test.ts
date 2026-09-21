import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "@nemea/shared-types";
import { buildActions, NATIVE_TOKEN_ADDRESS, type ActionInput } from "../src/index.ts";
import { category, holding, meta, prefs, quote } from "./helpers.ts";

const USDC = 3408;
const USDT = 825;
const ETH = 1027;
const SOL = 5426;

const usdcMeta = meta(USDC, "USDC", ["stablecoin"], {
  contracts: [
    { chain: "ethereum", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
    { chain: "base", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
    { chain: "arbitrum", address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
  ],
});
const usdtMeta = meta(USDT, "USDT", ["stablecoin"], {
  contracts: [
    { chain: "ethereum", address: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
    { chain: "arbitrum", address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" },
  ],
});

function base(over: Partial<ActionInput> = {}): ActionInput {
  return {
    alert: { kind: "price_drop_24h", cmcId: ETH, context: { cmcId: ETH, observed: {}, categoryName: null, categoryChange24hPct: null, marketChange24hPct: null, attribution: null } },
    holdings: [holding(ETH, "ETH", 2)],
    meta: new Map([[ETH, meta(ETH, "ETH")]]),
    quotes: new Map([
      [USDC, quote(USDC, "USDC", 1)],
      [USDT, quote(USDT, "USDT", 1)],
    ]),
    categories: [],
    preferences: prefs({ protectionLevel: 2 }),
    stableTargets: [usdcMeta, usdtMeta],
    peggedUsdIds: new Set([USDC, USDT]),
    fraction: 0.5,
    ...over,
  };
}

describe("protective swap suggestions (level 2)", () => {
  it("stays alert-only at level 1", () => {
    const res = buildActions(base({ preferences: { ...DEFAULT_PREFERENCES, protectionLevel: 1 } }));
    expect(res.suggestions).toEqual([]);
    expect(res.unavailableReason).toContain("alert-only");
  });

  it("builds Uniswap and 1inch links for native ETH on every network when the network is unknown", () => {
    const res = buildActions(base());
    expect(res.suggestions.map((s) => s.chain).sort()).toEqual(["arbitrum", "base", "ethereum"]);
    const eth = res.suggestions.find((s) => s.chain === "ethereum");
    expect(eth?.suggestedAmount).toBe(1);
    const uni = new URL(eth?.uniswapUrl ?? "");
    expect(uni.searchParams.get("chain")).toBe("ethereum");
    expect(uni.searchParams.get("inputCurrency")).toBe("ETH");
    expect(uni.searchParams.get("outputCurrency")).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(uni.searchParams.get("exactAmount")).toBe("1");
    expect(eth?.oneInchUrl).toBe(`https://app.1inch.io/#/1/simple/swap/${NATIVE_TOKEN_ADDRESS}/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`);
    expect(eth?.notes.join(" ")).toContain("Nemea does not know which network");
  });

  it("uses the exact network and contract of a wallet-imported holding", () => {
    const wallet = holding(SOL, "WETH", 3, { source: "wallet", chain: "base", contractAddress: "0x4200000000000000000000000000000000000006", walletAddress: "0xabc" });
    const res = buildActions(base({ holdings: [wallet], alert: { ...base().alert, cmcId: SOL } }));
    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0]).toMatchObject({ chain: "base", fromAddress: "0x4200000000000000000000000000000000000006", toSymbol: "USDC", suggestedAmount: 1.5 });
    expect(res.suggestions[0]?.oneInchUrl).toContain("/#/8453/");
  });

  it("swaps a depegged stablecoin into a different stablecoin that is on peg", () => {
    const usdc = holding(USDC, "USDC", 1000, { source: "wallet", chain: "ethereum", contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" });
    const res = buildActions(
      base({
        holdings: [usdc],
        alert: { ...base().alert, kind: "depeg", cmcId: USDC },
        quotes: new Map([
          [USDC, quote(USDC, "USDC", 0.95)],
          [USDT, quote(USDT, "USDT", 1)],
        ]),
      }),
    );
    expect(res.suggestions[0]?.toSymbol).toBe("USDT");
    expect(res.suggestions[0]?.toAddress).toBe("0xdac17f958d2ee523a2206206994597c13d831ec7");
  });

  it("never suggests swapping into a stablecoin that is itself off peg, and says so", () => {
    const usdc = holding(USDC, "USDC", 1000, { source: "wallet", chain: "ethereum", contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" });
    const res = buildActions(
      base({
        holdings: [usdc],
        alert: { ...base().alert, kind: "depeg", cmcId: USDC },
        quotes: new Map([
          [USDC, quote(USDC, "USDC", 0.95)],
          [USDT, quote(USDT, "USDT", 0.96)],
        ]),
      }),
    );
    expect(res.suggestions).toEqual([]);
    expect(res.unavailableReason).toContain("on peg");
  });

  it("does not invent a target on a network where the stablecoin has no contract", () => {
    const usdc = holding(USDC, "USDC", 1000, { source: "wallet", chain: "base", contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" });
    const res = buildActions(
      base({
        holdings: [usdc],
        stableTargets: [usdcMeta, usdtMeta],
        alert: { ...base().alert, kind: "depeg", cmcId: USDC },
        quotes: new Map([
          [USDC, quote(USDC, "USDC", 0.95)],
          [USDT, quote(USDT, "USDT", 1)],
        ]),
      }),
    );
    expect(res.suggestions).toEqual([]);
  });

  it("does not offer a swap target whose quote is old, even if it looked on peg", () => {
    const usdc = holding(USDC, "USDC", 1000, { source: "wallet", chain: "ethereum", contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" });
    const old = new Date("2026-09-21T06:00:00.000Z").toISOString();
    const res = buildActions(
      base({
        holdings: [usdc],
        alert: { ...base().alert, kind: "depeg", cmcId: USDC },
        quotes: new Map([
          [USDC, quote(USDC, "USDC", 0.95)],
          [USDT, quote(USDT, "USDT", 1, { cmcLastUpdated: old, fetchedAt: old })],
        ]),
        now: new Date("2026-09-21T12:00:00.000Z"),
        maxQuoteAgeMs: 30 * 60_000,
      }),
    );
    expect(res.suggestions).toEqual([]);
    expect(res.unavailableReason).toContain("on peg");
  });

  it("writes a short, exact amount in the swap link", () => {
    const eth = holding(ETH, "ETH", 0.6000000000000001);
    const res = buildActions(base({ holdings: [eth], fraction: 0.5 }));
    const url = new URL(res.suggestions[0]?.uniswapUrl ?? "");
    expect(url.searchParams.get("exactAmount")).toBe("0.3");
  });

  it("refuses a malformed contract address instead of building a link from it", () => {
    const bad = holding(SOL, "WETH", 3, { source: "wallet", chain: "base", contractAddress: "0x1/../evil" });
    const res = buildActions(base({ holdings: [bad], alert: { ...base().alert, cmcId: SOL } }));
    expect(res.suggestions).toEqual([]);
  });

  it("rejects a share outside 0..1", () => {
    for (const fraction of [0, -0.5, 1.5, Number.NaN]) {
      expect(buildActions(base({ fraction })).suggestions).toEqual([]);
    }
  });

  it("picks the coins behind a portfolio drop, biggest first, non-stable only", () => {
    const holdings = [holding(ETH, "ETH", 1), holding(SOL, "SOL", 20), holding(USDC, "USDC", 9000)];
    const res = buildActions(
      base({
        holdings,
        quotes: new Map([
          [ETH, quote(ETH, "ETH", 1000)],
          [SOL, quote(SOL, "SOL", 100)],
          [USDC, quote(USDC, "USDC", 1)],
          [USDT, quote(USDT, "USDT", 1)],
        ]),
        meta: new Map([
          [ETH, meta(ETH, "ETH")],
          [SOL, meta(SOL, "SOL", [], { contracts: [{ chain: "ethereum", address: "0xd31a59c85ae9d8edefec411d448f90841571b89c" }] })],
        ]),
        alert: {
          kind: "portfolio_drop",
          cmcId: null,
          context: {
            cmcId: null,
            observed: {},
            categoryName: null,
            categoryChange24hPct: null,
            marketChange24hPct: null,
            attribution: { portfolioChange24hPct: -20, lossUsd: 500, valueNowUsd: 12000, marketChange24hPct: -5, byCategory: [{ categoryName: "Layer 1", lossUsd: 400, sharePct: 80, categoryChange24hPct: -18, symbols: ["SOL", "ETH"], cmcIds: [SOL, ETH] }] },
          },
        },
      }),
    );
    const symbols = [...new Set(res.suggestions.map((s) => s.fromSymbol))];
    expect(symbols).toEqual(["SOL", "ETH"]);
    expect(symbols).not.toContain("USDC");
  });

  it("selects only holdings in the alert's category for a rotation alert", () => {
    const holdings = [holding(ETH, "ETH", 1), holding(SOL, "SOL", 20)];
    const res = buildActions(
      base({
        holdings,
        quotes: new Map([
          [ETH, quote(ETH, "ETH", 1000)],
          [SOL, quote(SOL, "SOL", 100)],
          [USDC, quote(USDC, "USDC", 1)],
        ]),
        meta: new Map([
          [ETH, meta(ETH, "ETH", ["smart-contracts"])],
          [SOL, meta(SOL, "SOL", ["layer-1"], { contracts: [{ chain: "ethereum", address: "0xd31a59c85ae9d8edefec411d448f90841571b89c" }] })],
        ]),
        categories: [category("c1", "Layer 1", -14)],
        alert: { kind: "category_rotation", cmcId: null, context: { cmcId: null, observed: {}, categoryName: "Layer 1", categoryChange24hPct: -14, marketChange24hPct: -2, attribution: null } },
      }),
    );
    expect([...new Set(res.suggestions.map((s) => s.fromSymbol))]).toEqual(["SOL"]);
  });
});
