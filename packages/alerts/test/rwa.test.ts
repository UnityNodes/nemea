import type { RwaSnapshot } from "@nemea/shared-types";
import { describe, expect, it } from "vitest";
import { evaluate } from "../src/engine.ts";
import { RWA_UNIT_MISMATCH_PCT } from "../src/rules.ts";
import { explain } from "../src/explain.ts";
import { NOW, holding, input, prefs, quote } from "./helpers.ts";

function rwa(over: Partial<RwaSnapshot> = {}): RwaSnapshot {
  return {
    rwaId: 2,
    symbol: "NVDA",
    name: "Nvidia Corp",
    assetType: "stock",
    averageTokenizedPriceUsd: 229.45,
    tokenizedVolume24hUsd: 116_000_000,
    wrappers: [{ cmcId: 36992, symbol: "NVDAX", name: "NVIDIA tokenized stock (xStock)", priceUsd: 229.73, issuerName: "Backed Assets" }],
    cmcLastUpdated: NOW.toISOString(),
    fetchedAt: NOW.toISOString(),
    ...over,
  };
}

const wrapperId = 36992;

function run(priceUsd: number | null, asset: RwaSnapshot = rwa(), over = {}) {
  return evaluate(
    input({
      holdings: [holding(wrapperId, "NVDAX", 10)],
      quotes: [quote(wrapperId, "NVDAX", priceUsd)],
      rwaByWrapperId: new Map([[wrapperId, asset]]),
      ...over,
    }),
  );
}

describe("rwa drift", () => {
  it("stays quiet when the wrapper tracks the asset closely", () => {
    const out = run(229.73);
    expect(out.emit.filter((c) => c.kind === "rwa_drift")).toHaveLength(0);
  });

  it("does not leave a double full stop when the asset name already ends in one", () => {
    const out = run(220, rwa({ name: "Tesla, Inc." }));
    const alert = out.emit.find((c) => c.kind === "rwa_drift")!;
    expect(alert.summary).toContain("track Tesla, Inc.");
    expect(alert.summary).not.toContain("Inc..");
  });

  it("alerts when the wrapper drifts past the threshold, naming both prices", () => {
    const out = run(220);
    const alert = out.emit.find((c) => c.kind === "rwa_drift");
    expect(alert).toBeDefined();
    expect(alert!.title).toContain("NVDAX");
    expect(alert!.summary).toContain("Nvidia Corp");
    expect(alert!.facts.some((f) => f.label === "All tokenised NVDA")).toBe(true);
    expect(alert!.facts.some((f) => f.value === "Backed Assets")).toBe(true);
    expect(alert!.dedupeKey).toBe(`rwa_drift:${wrapperId}`);
  });

  it("does not alert on a wrapper that tracks a different unit of the asset, and says why", () => {
    const silver = rwa({ rwaId: 4, symbol: "SILVER", name: "Silver", assetType: "commodity", averageTokenizedPriceUsd: 31.49, wrappers: [] });
    const out = run(2.15, silver);
    expect(out.emit.filter((c) => c.kind === "rwa_drift")).toHaveLength(0);
    const skipped = out.suppressed.find((s) => s.reason === "unit_mismatch");
    expect(skipped).toBeDefined();
    expect(skipped!.detail).toContain("different unit");
  });

  it("treats a gap just inside the mismatch ceiling as a real alert", () => {
    const anchor = 100;
    const asset = rwa({ averageTokenizedPriceUsd: anchor });
    const justInside = anchor * (1 - (RWA_UNIT_MISMATCH_PCT - 1) / 100);
    const out = run(justInside, asset);
    expect(out.emit.some((c) => c.kind === "rwa_drift")).toBe(true);
  });

  it("never alerts without an anchor price or a wrapper price", () => {
    expect(run(null).emit.filter((c) => c.kind === "rwa_drift")).toHaveLength(0);
    expect(run(220, rwa({ averageTokenizedPriceUsd: null })).emit.filter((c) => c.kind === "rwa_drift")).toHaveLength(0);
  });

  it("respects the user's own threshold", () => {
    const loose = run(224, rwa(), { preferences: prefs({ rwaDriftPct: 10 }) });
    expect(loose.emit.filter((c) => c.kind === "rwa_drift")).toHaveLength(0);
    const tight = run(224, rwa(), { preferences: prefs({ rwaDriftPct: 1 }) });
    expect(tight.emit.some((c) => c.kind === "rwa_drift")).toBe(true);
  });

  it("explains itself without jargon and without claiming the real asset moved", () => {
    const alert = run(220).emit.find((c) => c.kind === "rwa_drift")!;
    const out = explain({
      alert: { kind: alert.kind, severity: alert.severity, symbol: alert.symbol, title: alert.title, context: alert.context, createdAt: NOW.toISOString() },
    } as never);
    const text = [out.headline, ...out.sections.map((s) => `${s.heading} ${s.body}`)].join(" ");
    expect(text).toContain("cloakroom");
    expect(text).toMatch(/share in a real company/);
    expect(text).not.toMatch(/\barbitrage\b|\bpremium\b|\bNAV\b/i);
  });
});
