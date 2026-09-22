import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import replay from "../lib/replay-summary.json" with { type: "json" };

describe("track record on /status", () => {
  it("comes from pnpm replay and never claims to be live", () => {
    expect(replay.evidenceCommand).toBe("pnpm replay");
    expect(replay.evidenceFile).toBe("docs/evidence/replay.json");
    expect(replay.coinsWatched.length).toBeGreaterThan(0);
    expect(Number.isFinite(replay.totalAlertsFired)).toBe(true);
    expect(replay.totalAlertsFired).toBeGreaterThanOrEqual(replay.priceDropAlerts);
  });

  it("shows every watched coin's move on its worst day, fired or not", () => {
    if (!replay.busiestDay) return;
    const watchedNonStable = replay.coinsWatched.filter((s) => s !== "USDC");
    expect(replay.busiestDay.changes.map((c) => c.symbol).sort()).toEqual([...watchedNonStable].sort());
    expect(replay.busiestDay.changes.some((c) => c.fired)).toBe(true);
  });

  it("matches the full evidence file this session generated, so the panel cannot drift from it", () => {
    const evidencePath = path.join(import.meta.dirname, "..", "..", "..", "docs", "evidence", "replay.json");
    const full = JSON.parse(readFileSync(evidencePath, "utf8")) as { totalAlertsFired: number; priceDropAlerts: number; suppressedByCooldown: number };
    expect(replay.totalAlertsFired).toBe(full.totalAlertsFired);
    expect(replay.priceDropAlerts).toBe(full.priceDropAlerts);
    expect(replay.suppressedByCooldown).toBe(full.suppressedByCooldown);
  });
});
