import { describe, expect, it } from "vitest";
import { evaluate, explain, findSimilarDrops, summarizePegExcursions, type Candidate, type ExplainInput } from "../src/index.ts";
import { category, global, holding, input, meta, quote } from "./helpers.ts";

const SOL = 5426;
const ETH = 1027;
const USDC = 3408;

function day(n: number): string {
  return new Date(Date.UTC(2026, 0, 1 + n)).toISOString();
}

function series(prices: number[]) {
  return prices.map((priceUsd, i) => ({ ts: day(i), priceUsd }));
}

function candidate(kind: Candidate["kind"], over: Parameters<typeof input>[0]): Candidate {
  const res = evaluate(input(over));
  const c = res.emit.find((x) => x.kind === kind);
  if (!c) throw new Error(`no ${kind} candidate; got ${res.emit.map((e) => e.kind).join(",")}`);
  return c;
}

function explainInput(c: Candidate, extra: Partial<ExplainInput> = {}): ExplainInput {
  return { alert: c, name: c.symbol, quoteNow: null, similarDrops: null, pegHistory: null, historyUnavailableReason: null, ...extra };
}

function text(e: ReturnType<typeof explain>): string {
  return [e.headline, ...e.sections.map((s) => `${s.heading} ${s.body}`), e.calmNote, ...e.dataGaps].join("\n");
}

const NO_ADVICE = /\byou should (buy|sell|hold)\b|\bbuy now\b|\bsell now\b|\bguaranteed?\b|\bwill (recover|rebound|go up|crash)\b/i;

describe("similar drops", () => {
  const calm = Array.from({ length: 40 }, () => 100);

  it("finds a drop and how long the recovery took", () => {
    const prices = [...calm, 80, 85, 90, 100, 101, ...calm, 102, 103];
    const s = findSimilarDrops(series(prices), 15);
    expect(s?.events).toHaveLength(1);
    expect(s?.events[0]?.dropPct).toBeCloseTo(-20, 5);
    expect(s?.events[0]?.recoveredAfterDays).toBe(3);
    expect(s?.medianRecoveryDays).toBe(3);
  });

  it("counts a drop that never recovered", () => {
    const prices = [...calm, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79];
    const s = findSimilarDrops(series(prices), 15);
    expect(s?.events).toHaveLength(1);
    expect(s?.events[0]?.recoveredAfterDays).toBeNull();
    expect(s?.notRecoveredCount).toBe(1);
    expect(s?.recoveredCount).toBe(0);
    expect(s?.medianRecoveryDays).toBeNull();
  });

  it("does not count the drop that is happening right now as history", () => {
    const s = findSimilarDrops(series([...calm, 100, 100, 100, 70]), 15);
    expect(s?.events).toEqual([]);
  });

  it("counts a multi-day slide once", () => {
    const s = findSimilarDrops(series([...calm, 80, 62, 50, 45, ...calm]), 15);
    expect(s?.events).toHaveLength(1);
  });

  it("returns null, not an empty claim, when there is too little history", () => {
    expect(findSimilarDrops(series([1, 2, 3]), 15)).toBeNull();
  });

  it("does not count drops smaller than the threshold", () => {
    const s = findSimilarDrops(series([...calm, 90, 100, ...calm]), 15);
    expect(s?.events).toEqual([]);
  });
});

describe("peg history", () => {
  const ok = Array.from({ length: 30 }, () => 1);
  it("counts stretches below the floor and how long they lasted", () => {
    const s = summarizePegExcursions(series([...ok, 0.97, 0.96, 0.99, ...ok, 0.9, 0.99, ...ok]), 0.98);
    expect(s?.episodes).toBe(2);
    expect(s?.longestDaysBelow).toBe(2);
    expect(s?.lowestCloseUsd).toBe(0.9);
    expect(s?.stillBelow).toBe(false);
  });

  it("reports when the coin is still below at the end of the data", () => {
    const s = summarizePegExcursions(series([...ok, 0.97, 0.96]), 0.98);
    expect(s?.stillBelow).toBe(true);
    expect(s?.episodes).toBe(1);
  });

  it("says never depegged when it never did", () => {
    expect(summarizePegExcursions(series(ok), 0.98)?.episodes).toBe(0);
  });
});

describe("explain: price drops", () => {
  const holdings = [holding(SOL, "SOL", 10), holding(ETH, "ETH", 1)];
  const metas = [meta(SOL, "SOL", ["layer-1"]), meta(ETH, "ETH", ["smart-contracts"])];
  const make = (solChange: number, market: number | null, cat: number | null = null) =>
    candidate("price_drop_24h", {
      holdings,
      metas,
      quotes: [quote(SOL, "SOL", 100, { percentChange24h: solChange }), quote(ETH, "ETH", 5000, { percentChange24h: 0 })],
      categories: cat === null ? [] : [category("c1", "Layer 1", cat)],
      global: global(market),
    });

  it("says everyone is down when the market moved with the coin", () => {
    const e = explain(explainInput(make(-18, -14)));
    expect(text(e)).toContain("Everyone");
  });

  it("says the neighbourhood moved when its category fell with it", () => {
    const e = explain(explainInput(make(-18, -2, -17)));
    expect(text(e)).toContain("neighbourhood");
    expect(text(e)).toContain("Layer 1");
  });

  it("says it is specific to the coin when it fell far more than the market and its group", () => {
    const e = explain(explainInput(make(-25, -2, -3)));
    expect(text(e)).toContain("much more than the market");
    expect(text(e)).toContain("We cannot see the news");
  });

  it("admits it cannot compare when there is no market data", () => {
    const e = explain(explainInput(make(-18, null)));
    expect(text(e)).toContain("could not load market-wide numbers");
  });

  it("reports history when it has it and lists a data gap when it does not", () => {
    const calm = Array.from({ length: 40 }, () => 100);
    const sim = findSimilarDrops(series([...calm, 80, 90, 100, ...calm]), 12);
    const withHistory = explain(explainInput(make(-18, -14), { similarDrops: sim }));
    expect(text(withHistory)).toContain("Has this happened before?");
    expect(withHistory.dataGaps).toEqual([]);
    const without = explain(explainInput(make(-18, -14), { historyUnavailableReason: "Price history is not included in this CoinMarketCap plan." }));
    expect(text(without)).not.toContain("Has this happened before?");
    expect(without.dataGaps).toEqual(["Price history is not included in this CoinMarketCap plan."]);
  });

  it("does not invent a recovery when there was none", () => {
    const calm = Array.from({ length: 40 }, () => 100);
    const sim = findSimilarDrops(series([...calm, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79]), 12);
    const e = explain(explainInput(make(-18, -14), { similarDrops: sim }));
    expect(text(e)).toContain("had not got back");
    expect(text(e)).not.toContain("climbed back");
  });

  it("mentions where the price is now compared with the alert", () => {
    const c = make(-18, -14);
    const e = explain(explainInput(c, { quoteNow: quote(SOL, "SOL", 110) }));
    expect(text(e)).toContain("Since the alert");
    expect(text(e)).toContain("+10%");
  });

  it("is calm and never gives buy or sell advice", () => {
    for (const e of [explain(explainInput(make(-18, -14))), explain(explainInput(make(-25, -2, -3)))]) {
      expect(text(e)).toContain("Nothing has been sold");
      expect(text(e)).not.toMatch(NO_ADVICE);
    }
  });
});

describe("explain: other kinds", () => {
  it("explains a depeg from a stablecoin's own history", () => {
    const c = candidate("depeg", { peggedUsdIds: new Set([USDC]), holdings: [holding(USDC, "USDC", 5000)], quotes: [quote(USDC, "USDC", 0.96, { volumeChange24hPct: 300 })] });
    const ok = Array.from({ length: 30 }, () => 1);
    const peg = summarizePegExcursions(series([...ok, 0.95, 0.97, ...ok]), 0.98);
    const e = explain(explainInput(c, { pegHistory: peg }));
    expect(text(e)).toContain("gift card");
    expect(text(e)).toContain("+300%");
    expect(text(e)).toContain("1 separate stretch");
    expect(text(e)).not.toMatch(NO_ADVICE);
  });

  it("explains a portfolio drop through its biggest category", () => {
    const c = candidate("portfolio_drop", {
      holdings: [holding(SOL, "SOL", 10), holding(ETH, "ETH", 1)],
      metas: [meta(SOL, "SOL", ["layer-1"]), meta(ETH, "ETH", ["smart-contracts"])],
      quotes: [quote(SOL, "SOL", 100, { percentChange24h: -25 }), quote(ETH, "ETH", 1000, { percentChange24h: -1 })],
      categories: [category("c1", "Layer 1", -19)],
      global: global(-7),
    });
    const e = explain(explainInput(c));
    expect(e.headline).toContain("because Layer 1 is down 19%");
    expect(text(e)).toContain("Where the drop came from");
    expect(text(e)).toContain("Compared with the whole market");
  });

  it("labels a window low honestly and lists it as a data gap", () => {
    const c = candidate("near_low", {
      holdings: [holding(SOL, "SOL", 10)],
      quotes: [quote(SOL, "SOL", 105)],
      lows: new Map([[SOL, { lowUsd: 100, lowAt: "2026-03-01T00:00:00Z", windowDays: 365, scope: "window" as const }]]),
    });
    const e = explain(explainInput(c));
    expect(text(e)).toContain("not the all-time low");
    expect(e.dataGaps.length).toBe(1);
  });

  it("gives every alert kind a headline, sections and the calm note", () => {
    const cases: Candidate[] = [
      candidate("below_cost_basis", { holdings: [holding(SOL, "SOL", 10, { costBasisUsd: 100 })], quotes: [quote(SOL, "SOL", 99, { percentChange24h: -2 })] }),
      candidate("volume_spike", { holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { volumeChange24hPct: 500 })] }),
      candidate("volume_dry_up", { holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { volumeChange24hPct: -85, percentChange24h: -6 })] }),
      candidate("stable_volume_anomaly", { peggedUsdIds: new Set([USDC]), holdings: [holding(USDC, "USDC", 5000)], quotes: [quote(USDC, "USDC", 1, { volumeChange24hPct: 1200 })] }),
      candidate("category_rotation", {
        holdings: [holding(SOL, "SOL", 10), holding(ETH, "ETH", 1)],
        metas: [meta(SOL, "SOL", ["layer-1"]), meta(ETH, "ETH", ["smart-contracts"])],
        quotes: [quote(SOL, "SOL", 100, { percentChange24h: -3 }), quote(ETH, "ETH", 1000, { percentChange24h: -1 })],
        categories: [category("c1", "Layer 1", -14)],
        global: global(-2),
      }),
    ];
    for (const c of cases) {
      const e = explain(explainInput(c));
      expect(e.headline.length).toBeGreaterThan(10);
      expect(e.sections.length).toBeGreaterThanOrEqual(2);
      expect(e.calmNote).toContain("Nothing has been sold");
      expect(text(e)).not.toMatch(NO_ADVICE);
      expect(text(e)).not.toMatch(/undefined|NaN|null/);
    }
  });
});
