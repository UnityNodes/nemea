import { describe, expect, it } from "vitest";
import {
  DESIRED_CADENCE,
  creditsForIds,
  estimateMonthlyCredits,
  idsDueOnTick,
  planCadence,
  scaleCadence,
  type Workload,
} from "../src/budget.ts";

const small: Workload = {
  stablecoinIds: [825, 3408, 4943, 29470],
  topIds: [1, 1027, 5426, 825],
  smallIds: [7083, 4943, 12345],
};

describe("credit estimator", () => {
  it("costs one credit per tick for up to 100 ids and adds global and category calls", () => {
    const est = estimateMonthlyCredits(DESIRED_CADENCE, small);
    expect(est.perMonth).toBe(43_200 + 2_880 + 1_440);
  });

  it("charges an extra credit per started hundred ids", () => {
    expect(creditsForIds(0)).toBe(0);
    expect(creditsForIds(1)).toBe(1);
    expect(creditsForIds(100)).toBe(1);
    expect(creditsForIds(101)).toBe(2);
    const many = Array.from({ length: 150 }, (_, i) => i + 1);
    const est = estimateMonthlyCredits(DESIRED_CADENCE, { stablecoinIds: many, topIds: [], smallIds: [] });
    expect(est.perMonth).toBe(2 * 43_200 + 2_880 + 1_440);
  });

  it("dedupes ids that sit in several lanes on the same tick", () => {
    const due = idsDueOnTick(0, DESIRED_CADENCE, small);
    expect(due.sort((a, b) => a - b)).toEqual([1, 1027, 3408, 4943, 5426, 7083, 12345, 29470, 825].sort((a, b) => a - b));
    expect(new Set(due).size).toBe(due.length);
  });

  it("only polls stablecoins on ordinary ticks", () => {
    expect(idsDueOnTick(1, DESIRED_CADENCE, small).sort((a, b) => a - b)).toEqual([825, 3408, 4943, 29470].sort((a, b) => a - b));
  });
});

describe("cadence planner", () => {
  it("keeps the desired cadence when the plan is big enough and there are many coins, where tiers really save calls", () => {
    const many = Array.from({ length: 150 }, (_, i) => 10_000 + i);
    const workload = { stablecoinIds: [825], topIds: many.slice(0, 50), smallIds: many.slice(50) };
    const plan = planCadence(450_000, workload);
    expect(plan.verdict).toBe("fits");
    expect(plan.multiplier).toBe(1);
    expect(plan.cadence).toEqual(DESIRED_CADENCE);
  });

  it("polls every coin every minute on a big plan when there are few coins, because that costs the same as polling only stablecoins", () => {
    const plan = planCadence(300_000, small);
    expect(plan.verdict).toBe("fits");
    expect(plan.cadence.stablecoinsSec).toBe(60);
    expect(plan.cadence.topSec).toBe(60);
    expect(plan.cadence.smallSec).toBe(60);
    expect(plan.estimatedCreditsPerMonth).toBe(43_200 + 2_880 + 1_440);
  });

  it("stretches the cadence on a 10k plan instead of pretending one-minute polling fits", () => {
    const plan = planCadence(10_000, small);
    expect(plan.verdict).toBe("stretched");
    expect(plan.multiplier).toBe(6);
    expect(plan.cadence.stablecoinsSec).toBe(360);
    expect(plan.estimatedCreditsPerMonth).toBeLessThanOrEqual(8_500);
  });

  it("puts the free 15k plan on a four-minute depeg cadence and says so", () => {
    const plan = planCadence(15_000, small);
    expect(plan.verdict).toBe("stretched");
    expect(plan.multiplier).toBe(4);
    expect(plan.cadence.stablecoinsSec).toBe(240);
    expect(plan.estimatedCreditsPerMonth).toBeLessThanOrEqual(12_750);
  });

  it("lets top and small holdings ride along on the depeg poll when the plan is stretched, since cost is per call", () => {
    const plan = planCadence(15_000, small);
    expect(plan.cadence.topSec).toBe(plan.cadence.stablecoinsSec);
    expect(plan.cadence.smallSec).toBe(plan.cadence.stablecoinsSec);
    const est = estimateMonthlyCredits(plan.cadence, small);
    const stableCalls = 30 * 24 * 3600 / plan.cadence.stablecoinsSec;
    const globalCalls = 30 * 24 * 3600 / plan.cadence.globalSec;
    const categoryCalls = 30 * 24 * 3600 / plan.cadence.categoriesSec;
    expect(est.perMonth).toBe(stableCalls + globalCalls + categoryCalls);
  });

  it("keeps real tiers when there are more than a hundred distinct coins, because then each tier costs calls (stretched plan)", () => {
    const many = Array.from({ length: 150 }, (_, i) => 10_000 + i);
    const plan = planCadence(450_000, { stablecoinIds: [825], topIds: many.slice(0, 50), smallIds: many.slice(50) });
    expect(plan.verdict).toBe("fits");
    const stretched = planCadence(60_000, { stablecoinIds: [825], topIds: many.slice(0, 50), smallIds: many.slice(50) });
    expect(stretched.cadence.smallSec).toBeGreaterThan(stretched.cadence.stablecoinsSec);
  });

  it("refuses to claim success when even the slowest cadence does not fit", () => {
    const plan = planCadence(100, small);
    expect(plan.verdict).toBe("insufficient");
    expect(plan.estimatedCreditsPerMonth).toBeGreaterThan(100 * 0.85);
  });

  it("reports unknown, not fits, when the plan limit is unknown", () => {
    expect(planCadence(null, small).verdict).toBe("unknown");
  });

  it("never scales a lane below the base tick", () => {
    const c = scaleCadence(DESIRED_CADENCE, 0.01);
    expect(c.stablecoinsSec).toBe(60);
  });
});
