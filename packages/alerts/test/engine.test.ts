import { describe, expect, it } from "vitest";
import { evaluate } from "../src/index.ts";
import { category, global, holding, input, meta, past, prefs, quote } from "./helpers.ts";

const SOL = 5426;
const ETH = 1027;
const USDC = 3408;
const USDT = 825;

describe("price drops", () => {
  it("fires at the 24h threshold and not just below it", () => {
    const at = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -15 })], global: global(-1) }));
    expect(at.emit.map((c) => c.kind)).toEqual(["price_drop_24h"]);
    const below = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -14.9 })] }));
    expect(below.emit).toEqual([]);
  });

  it("uses the user's own thresholds", () => {
    const res = evaluate(input({ preferences: prefs({ drop24hPct: 5 }), holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -6 })] }));
    expect(res.emit).toHaveLength(1);
  });

  it("emits one alert per coin when both windows fire, keeping both numbers as facts", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange1h: -9, percentChange24h: -16 })] }));
    expect(res.emit).toHaveLength(1);
    const labels = res.emit[0]?.facts.map((f) => f.label) ?? [];
    expect(labels).toContain("Change, 1h");
    expect(labels).toContain("Change, 24h");
  });

  it("goes critical at twice the threshold", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -31 })] }));
    expect(res.emit[0]?.severity).toBe("critical");
  });

  it("never alerts on a coin the user does not hold", () => {
    const res = evaluate(input({ holdings: [holding(ETH, "ETH", 1)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -50 }), quote(ETH, "ETH", 2000)] }));
    expect(res.emit).toEqual([]);
  });

  it("does not run price-drop rules on a pegged stablecoin", () => {
    const res = evaluate(input({ peggedUsdIds: new Set([USDC]), holdings: [holding(USDC, "USDC", 1000)], quotes: [quote(USDC, "USDC", 0.99, { percentChange24h: -20, percentChange1h: -20 })] }));
    expect(res.emit.map((c) => c.kind)).not.toContain("price_drop_24h");
  });
});

describe("data quality", () => {
  it("does not alert on a stale quote and says why", () => {
    const old = new Date("2026-09-21T09:00:00.000Z").toISOString();
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -40, cmcLastUpdated: old, fetchedAt: old })] }));
    expect(res.emit).toEqual([]);
    expect(res.suppressed[0]?.reason).toBe("stale_quote");
    expect(res.evaluated.stale).toBe(1);
  });

  it("treats a missing price as no data, not as a zero price", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", null, { percentChange24h: -40 })] }));
    expect(res.emit).toEqual([]);
    expect(res.evaluated.unpriced).toBe(1);
  });

  it("treats a missing percent change as unknown, not as a drop", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange1h: null, percentChange24h: null })] }));
    expect(res.emit).toEqual([]);
  });

  it("copes with an empty portfolio", () => {
    expect(evaluate(input()).emit).toEqual([]);
  });
});

describe("depeg", () => {
  const stables = new Set([USDC, USDT]);
  it("fires below the floor for a held stablecoin, as critical", () => {
    const res = evaluate(input({ peggedUsdIds: stables, holdings: [holding(USDC, "USDC", 5000)], quotes: [quote(USDC, "USDC", 0.9712)] }));
    expect(res.emit).toHaveLength(1);
    expect(res.emit[0]?.kind).toBe("depeg");
    expect(res.emit[0]?.severity).toBe("critical");
  });

  it("does not fire exactly at the floor", () => {
    const res = evaluate(input({ peggedUsdIds: stables, holdings: [holding(USDC, "USDC", 5000)], quotes: [quote(USDC, "USDC", 0.98)] }));
    expect(res.emit).toEqual([]);
  });

  it("does not fire for a stablecoin the user does not hold", () => {
    const res = evaluate(input({ peggedUsdIds: stables, holdings: [holding(ETH, "ETH", 1)], quotes: [quote(ETH, "ETH", 2000), quote(USDT, "USDT", 0.9)] }));
    expect(res.emit).toEqual([]);
  });

  it("respects a user-chosen floor", () => {
    const res = evaluate(input({ preferences: prefs({ depegFloorUsd: 0.995 }), peggedUsdIds: stables, holdings: [holding(USDC, "USDC", 5000)], quotes: [quote(USDC, "USDC", 0.99)] }));
    expect(res.emit).toHaveLength(1);
  });

  it("flags heavy stablecoin volume at ten times normal and not at nine", () => {
    const heavy = evaluate(input({ peggedUsdIds: stables, holdings: [holding(USDC, "USDC", 5000)], quotes: [quote(USDC, "USDC", 1, { volumeChange24hPct: 900 })] }));
    expect(heavy.emit.map((c) => c.kind)).toEqual(["stable_volume_anomaly"]);
    expect(heavy.emit[0]?.severity).toBe("info");
    const light = evaluate(input({ peggedUsdIds: stables, holdings: [holding(USDC, "USDC", 5000)], quotes: [quote(USDC, "USDC", 1, { volumeChange24hPct: 800 })] }));
    expect(light.emit).toEqual([]);
  });
});

describe("cost basis", () => {
  it("fires when the price crossed below the entry within the last day", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10, { costBasisUsd: 100 })], quotes: [quote(SOL, "SOL", 99, { percentChange24h: -2 })] }));
    expect(res.emit.map((c) => c.kind)).toEqual(["below_cost_basis"]);
  });

  it("stays quiet for a position that has been under water for days", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10, { costBasisUsd: 200 })], quotes: [quote(SOL, "SOL", 95, { percentChange24h: -2 })] }));
    expect(res.emit).toEqual([]);
  });

  it("ignores holdings with no cost basis", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 95, { percentChange24h: -2 })] }));
    expect(res.emit).toEqual([]);
  });
});

describe("near low", () => {
  const low = (scope: "all_time" | "window") => new Map([[SOL, { lowUsd: 100, lowAt: "2026-03-01T00:00:00Z", windowDays: scope === "window" ? 365 : null, scope }]]);
  it("labels an all-time low as all-time and a window low as a window", () => {
    const a = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 105)], lows: low("all_time") }));
    expect(a.emit[0]?.title).toContain("all-time low");
    const w = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 105)], lows: low("window") }));
    expect(w.emit[0]?.title).toContain("365-day low");
    expect(w.emit[0]?.title).not.toContain("all-time");
  });

  it("does not fire outside the distance", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 111)], lows: low("all_time") }));
    expect(res.emit).toEqual([]);
  });

  it("does nothing when no low is known", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 1)] }));
    expect(res.emit).toEqual([]);
  });
});

describe("volume", () => {
  it("flags a five-times volume spike as info when the price is fine", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { volumeChange24hPct: 400 })] }));
    expect(res.emit.map((c) => [c.kind, c.severity])).toEqual([["volume_spike", "info"]]);
  });

  it("does not flag 4.9x", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { volumeChange24hPct: 389 })] }));
    expect(res.emit).toEqual([]);
  });

  it("ignores a spike on a tiny-volume coin", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { volumeChange24hPct: 900, volume24hUsd: 5_000 })] }));
    expect(res.emit).toEqual([]);
  });

  it("flags a volume dry-up only when the price is also falling and the position matters", () => {
    const dry = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { volumeChange24hPct: -80, percentChange24h: -6 })] }));
    expect(dry.emit.map((c) => c.kind)).toEqual(["volume_dry_up"]);
    const flat = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { volumeChange24hPct: -80, percentChange24h: 1 })] }));
    expect(flat.emit).toEqual([]);
  });
});

describe("category rotation", () => {
  const holdings = [holding(SOL, "SOL", 10), holding(ETH, "ETH", 1)];
  const metas = [meta(SOL, "SOL", ["layer-1"]), meta(ETH, "ETH", ["smart-contracts"])];
  const quotes = [quote(SOL, "SOL", 100, { percentChange24h: -3 }), quote(ETH, "ETH", 1000, { percentChange24h: -1 })];

  it("fires when the group falls well below the market", () => {
    const res = evaluate(input({ holdings, metas, quotes, categories: [category("c1", "Layer 1", -14)], global: global(-2) }));
    expect(res.emit.map((c) => c.kind)).toEqual(["category_rotation"]);
    expect(res.emit[0]?.title).toContain("Layer 1");
  });

  it("does not call it a rotation when the whole market fell just as much", () => {
    const res = evaluate(input({ holdings, metas, quotes, categories: [category("c1", "Layer 1", -14)], global: global(-13) }));
    expect(res.emit).toEqual([]);
  });

  it("ignores a category whose CoinMarketCap timestamp is old, and keeps one with no timestamp", () => {
    const old = { ...category("c1", "Layer 1", -14), cmcLastUpdated: "2021-03-01T00:00:00.000Z" };
    const stale = evaluate(input({ holdings, metas, quotes, categories: [old], global: global(-2) }));
    expect(stale.emit).toEqual([]);
    const unknown = { ...category("c1", "Layer 1", -14), cmcLastUpdated: null };
    const kept = evaluate(input({ holdings, metas, quotes, categories: [unknown], global: global(-2) }));
    expect(kept.emit.map((c) => c.kind)).toEqual(["category_rotation"]);
  });

  it("is silent when the market figure is missing", () => {
    const res = evaluate(input({ holdings, metas, quotes, categories: [category("c1", "Layer 1", -14)], global: global(null) }));
    expect(res.emit).toEqual([]);
  });

  it("ignores a group the user barely holds", () => {
    const small = [holding(SOL, "SOL", 0.01), holding(ETH, "ETH", 1)];
    const res = evaluate(input({ holdings: small, metas, quotes, categories: [category("c1", "Layer 1", -14)], global: global(-2) }));
    expect(res.emit).toEqual([]);
  });
});

describe("portfolio drop", () => {
  const holdings = [holding(SOL, "SOL", 10), holding(ETH, "ETH", 1)];
  const metas = [meta(SOL, "SOL", ["layer-1"]), meta(ETH, "ETH", ["smart-contracts"])];
  it("explains the drop through the category that caused most of it", () => {
    const quotes = [quote(SOL, "SOL", 100, { percentChange24h: -22 }), quote(ETH, "ETH", 1000, { percentChange24h: -2 })];
    const res = evaluate(input({ holdings, metas, quotes, categories: [category("c1", "Layer 1", -18)], global: global(-6) }));
    const p = res.emit.find((c) => c.kind === "portfolio_drop");
    expect(p).toBeDefined();
    expect(p?.summary).toContain("Layer 1");
    expect(p?.context.attribution?.byCategory[0]?.categoryName).toBe("Layer 1");
    expect(p?.context.attribution?.byCategory[0]?.sharePct).toBeGreaterThan(80);
  });

  it("rolls token-level drops into the portfolio alert instead of sending both", () => {
    const quotes = [quote(SOL, "SOL", 100, { percentChange24h: -22 }), quote(ETH, "ETH", 1000, { percentChange24h: -16 })];
    const res = evaluate(input({ holdings, metas, quotes, global: global(-6) }));
    expect(res.emit.map((c) => c.kind)).toEqual(["portfolio_drop"]);
    expect(res.suppressed.filter((s) => s.reason === "rolled_into_portfolio_alert")).toHaveLength(2);
  });

  it("keeps a critical single-coin alert next to the portfolio alert", () => {
    const quotes = [quote(SOL, "SOL", 100, { percentChange24h: -45 }), quote(ETH, "ETH", 1000, { percentChange24h: -1 })];
    const res = evaluate(input({ holdings, metas, quotes, global: global(-6) }));
    expect(res.emit.map((c) => c.kind).sort()).toEqual(["portfolio_drop", "price_drop_24h"]);
  });

  it("does not send a portfolio alert that just repeats the one coin the portfolio is made of", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -20 })] }));
    expect(res.emit.map((c) => c.kind)).toEqual(["price_drop_24h"]);
  });

  it("does not send a portfolio alert when one coin is nearly the whole portfolio", () => {
    const h = [holding(SOL, "SOL", 100), holding(ETH, "ETH", 0.1)];
    const res = evaluate(input({ holdings: h, quotes: [quote(SOL, "SOL", 100, { percentChange24h: -20 }), quote(ETH, "ETH", 1000, { percentChange24h: 0 })] }));
    expect(res.emit.map((c) => c.kind)).toEqual(["price_drop_24h"]);
  });

  it("does not report a portfolio move when too little of it could be priced", () => {
    const quotes = [quote(SOL, "SOL", 100, { percentChange24h: -30 }), quote(ETH, "ETH", 1000, { percentChange24h: null })];
    const h = [holding(SOL, "SOL", 1), holding(ETH, "ETH", 1)];
    const res = evaluate(input({ holdings: h, metas, quotes, preferences: prefs({ drop24hPct: 90 }) }));
    expect(res.emit.find((c) => c.kind === "portfolio_drop")).toBeUndefined();
  });
});

describe("alert fatigue", () => {
  const dropQuotes = (ids: number[]) => ids.map((id) => quote(id, `T${id}`, 10, { percentChange24h: -17 }));

  it("suppresses a repeat of the same alert inside its cooldown", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -16 })], past: [past("price_drop_24h", `price_drop_24h:${SOL}`, 5)] }));
    expect(res.emit).toEqual([]);
    expect(res.suppressed.map((s) => s.reason)).toContain("cooldown");
  });

  it("alerts again once the cooldown has passed", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -16 })], past: [past("price_drop_24h", `price_drop_24h:${SOL}`, 30)] }));
    expect(res.emit).toHaveLength(1);
  });

  it("lets a worse situation through the cooldown", () => {
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -35 })], past: [past("price_drop_24h", `price_drop_24h:${SOL}`, 5, "warning")] }));
    expect(res.emit[0]?.severity).toBe("critical");
  });

  it("stops non-critical alerts once the weekly cap is used up", () => {
    const usedUp = [past("volume_spike", "volume_spike:1", 30), past("near_low", "near_low:2", 60), past("below_cost_basis", "below_cost_basis:3", 100)];
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -16 })], past: usedUp }));
    expect(res.emit).toEqual([]);
    expect(res.suppressed.map((s) => s.reason)).toContain("weekly_cap");
  });

  it("does not count simulated alerts against the cap", () => {
    const sims = [past("volume_spike", "a", 1, "warning", true), past("near_low", "b", 1, "warning", true), past("volume_spike", "c", 1, "warning", true)];
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -16 })], past: sims }));
    expect(res.emit).toHaveLength(1);
  });

  it("does not count alerts older than a week", () => {
    const old = [past("volume_spike", "a", 24 * 8), past("near_low", "b", 24 * 9), past("volume_spike", "c", 24 * 10)];
    const res = evaluate(input({ holdings: [holding(SOL, "SOL", 10)], quotes: [quote(SOL, "SOL", 100, { percentChange24h: -16 })], past: old }));
    expect(res.emit).toHaveLength(1);
  });

  it("lets a critical depeg through even when the weekly cap is used up", () => {
    const usedUp = [past("volume_spike", "a", 30), past("near_low", "b", 60), past("below_cost_basis", "c", 100)];
    const res = evaluate(input({ peggedUsdIds: new Set([USDC]), holdings: [holding(USDC, "USDC", 5000)], quotes: [quote(USDC, "USDC", 0.95)], past: usedUp }));
    expect(res.emit.map((c) => c.kind)).toEqual(["depeg"]);
  });

  it("caps critical alerts per day too", () => {
    const prior = [past("depeg", "depeg:1", 1, "critical"), past("depeg", "depeg:2", 2, "critical"), past("depeg", "depeg:3", 3, "critical")];
    const res = evaluate(input({ peggedUsdIds: new Set([USDC]), holdings: [holding(USDC, "USDC", 5000)], quotes: [quote(USDC, "USDC", 0.9)], past: prior }));
    expect(res.emit).toEqual([]);
  });

  it("on a crash day with many holdings sends at most a handful of alerts", () => {
    const ids = Array.from({ length: 12 }, (_, i) => 100 + i);
    const res = evaluate(input({ holdings: ids.map((id) => holding(id, `T${id}`, 10)), quotes: dropQuotes(ids), global: global(-12) }));
    expect(res.emit.length).toBeLessThanOrEqual(3);
    expect(res.emit.map((c) => c.kind)).toContain("portfolio_drop");
  });

  it("picks the most important non-critical alerts first when there is not room for all", () => {
    const res = evaluate(
      input({
        preferences: prefs({ weeklyCap: 1 }),
        holdings: [holding(SOL, "SOL", 10), holding(ETH, "ETH", 1)],
        quotes: [quote(SOL, "SOL", 100, { percentChange24h: -16 }), quote(ETH, "ETH", 1000, { volumeChange24hPct: 500 })],
      }),
    );
    expect(res.emit.map((c) => c.kind)).toEqual(["price_drop_24h"]);
  });
});
