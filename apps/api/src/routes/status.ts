import { Router } from "express";
import type { SystemStatus } from "@nemea/shared-types";
import type { AppDeps } from "../app.ts";

const VERSION = "0.1.0";

export function statusRoutes(deps: AppDeps): Router {
  const r = Router();

  r.get("/health", async (_req, res) => {
    try {
      await deps.ping();
      res.json({ ok: true });
    } catch (error) {
      deps.log("health check: database unreachable", error);
      res.status(503).json({ ok: false, reason: "database unreachable" });
    }
  });

  r.get("/status", async (_req, res) => {
    const stats = deps.market.cmc.stats();
    const poll = deps.poller?.status() ?? null;
    let rateLimit: number | null = null;
    let creditLimit: number | null = poll?.creditLimitMonthly ?? null;
    try {
      const info = await deps.market.cmc.getKeyInfo();
      rateLimit = info.rateLimitPerMinute;
      creditLimit = info.creditLimitMonthly;
    } catch (error) {
      deps.log("status: key info unavailable", error);
    }
    const body: SystemStatus = {
      cmcPlan: null,
      rateLimitPerMinute: rateLimit,
      creditLimitMonthly: creditLimit,
      creditsSpentThisRun: stats.counters.creditsSpent,
      receipts: deps.market.cmc.recentReceipts(15),
      channels: deps.delivery.channelsAvailable(),
      pausedUntil: poll?.pausedUntil ?? null,
      estimatedCreditsPerMonth: poll?.plan?.estimatedCreditsPerMonth ?? 0,
      budgetVerdict: poll?.plan?.verdict ?? "unknown",
      cadenceMultiplier: poll?.plan?.multiplier ?? 1,
      lanes: poll?.lanes ?? [],
      cache: { hits: stats.cache.hits, misses: stats.cache.misses },
      version: VERSION,
    };
    res.json(body);
  });

  return r;
}
