import type { AlertKind, QuoteSnapshot, Severity } from "@nemea/shared-types";
import { priceRows } from "./portfolio.ts";
import {
  SEVERITY_WEIGHT,
  buildRuleContext,
  categoryRules,
  costBasisRules,
  depegRules,
  nearLowRules,
  portfolioRules,
  priceDropRules,
  volumeRules,
} from "./rules.ts";
import type { Candidate, EngineInput, EngineOutput, PastAlert, Suppressed } from "./types.ts";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export const COOLDOWN_MS: Record<AlertKind, number> = {
  price_drop_1h: 6 * HOUR,
  price_drop_24h: DAY,
  below_cost_basis: 3 * DAY,
  near_low: 7 * DAY,
  depeg: 6 * HOUR,
  stable_volume_anomaly: DAY,
  volume_spike: DAY,
  volume_dry_up: DAY,
  category_rotation: DAY,
  portfolio_drop: DAY,
};

export const CRITICAL_PER_DAY_CAP = 3;
export const MAX_MARKET_CONTEXT_AGE_MS = 2 * HOUR;

function isFresh(fetchedAt: string, now: Date, maxAgeMs: number): boolean {
  const t = Date.parse(fetchedAt);
  return Number.isFinite(t) && now.getTime() - t <= maxAgeMs;
}

const WEEK = 7 * DAY;

export function quoteAgeMs(quote: QuoteSnapshot, now: Date): number {
  const stamp = quote.cmcLastUpdated ?? quote.fetchedAt;
  const t = Date.parse(stamp);
  return Number.isFinite(t) ? now.getTime() - t : Number.POSITIVE_INFINITY;
}

function rank(severity: Severity): number {
  return SEVERITY_WEIGHT[severity];
}

function latestFor(past: readonly PastAlert[], dedupeKey: string): PastAlert | null {
  let latest: PastAlert | null = null;
  for (const p of past) {
    if (p.dedupeKey !== dedupeKey || p.simulated) continue;
    if (!latest || Date.parse(p.createdAt) > Date.parse(latest.createdAt)) latest = p;
  }
  return latest;
}

export function evaluate(raw: EngineInput): EngineOutput {
  const maxContextAge = raw.maxMarketContextAgeMs ?? MAX_MARKET_CONTEXT_AGE_MS;
  const input: EngineInput = {
    ...raw,
    global: raw.global && isFresh(raw.global.fetchedAt, raw.now, maxContextAge) ? raw.global : null,
    categories: raw.categories.filter((c) => isFresh(c.fetchedAt, raw.now, maxContextAge)),
  };
  const suppressed: Suppressed[] = [];
  const rows = priceRows(input.holdings, input.quotes);
  const freshQuotes = new Map<number, QuoteSnapshot>();
  let stale = 0;
  let unpriced = 0;
  const heldIds = new Set(input.holdings.map((h) => h.cmcId));
  for (const id of heldIds) {
    const quote = input.quotes.get(id);
    if (!quote || quote.priceUsd === null) {
      unpriced += 1;
      suppressed.push({ kind: "price_drop_24h", cmcId: id, reason: "no_data", detail: "no usable quote from CoinMarketCap" });
      continue;
    }
    if (quoteAgeMs(quote, input.now) > input.maxQuoteAgeMs) {
      stale += 1;
      suppressed.push({ kind: "price_drop_24h", cmcId: id, reason: "stale_quote", detail: `quote older than ${Math.round(input.maxQuoteAgeMs / 60000)} min` });
      continue;
    }
    freshQuotes.set(id, quote);
  }

  const ctx = buildRuleContext(input, rows, freshQuotes, stale + unpriced > 0);
  const candidates: Candidate[] = [
    ...priceDropRules(ctx),
    ...costBasisRules(ctx),
    ...nearLowRules(ctx),
    ...depegRules(ctx),
    ...volumeRules(ctx),
    ...categoryRules(ctx),
    ...portfolioRules(ctx),
  ];

  const now = input.now.getTime();
  const afterCooldown: Candidate[] = [];
  for (const c of candidates) {
    const last = latestFor(input.past, c.dedupeKey);
    if (last) {
      const window = Math.max(COOLDOWN_MS[c.kind], COOLDOWN_MS[last.kind]);
      const within = now - Date.parse(last.createdAt) < window;
      const escalates = rank(c.severity) > rank(last.severity);
      if (within && !escalates) {
        suppressed.push({ kind: c.kind, cmcId: c.cmcId, reason: "cooldown", detail: `already alerted ${new Date(last.createdAt).toISOString()}` });
        continue;
      }
    }
    afterCooldown.push(c);
  }

  const hasPortfolio = afterCooldown.some((c) => c.kind === "portfolio_drop");
  const surviving: Candidate[] = [];
  for (const c of afterCooldown) {
    const isTokenDrop = c.kind === "price_drop_1h" || c.kind === "price_drop_24h";
    if (hasPortfolio && isTokenDrop && c.severity !== "critical") {
      suppressed.push({ kind: c.kind, cmcId: c.cmcId, reason: "rolled_into_portfolio_alert", detail: "covered by the portfolio-level alert" });
      continue;
    }
    surviving.push(c);
  }

  const sent = input.past.filter((p) => !p.simulated);
  const criticalToday = sent.filter((p) => p.severity === "critical" && now - Date.parse(p.createdAt) < DAY).length;
  const nonCriticalWeek = sent.filter((p) => p.severity !== "critical" && now - Date.parse(p.createdAt) < WEEK).length;

  const critical = surviving.filter((c) => c.severity === "critical").sort((a, b) => b.score - a.score);
  const rest = surviving.filter((c) => c.severity !== "critical").sort((a, b) => b.score - a.score);

  const emit: Candidate[] = [];
  let criticalBudget = Math.max(0, CRITICAL_PER_DAY_CAP - criticalToday);
  for (const c of critical) {
    if (criticalBudget <= 0) {
      suppressed.push({ kind: c.kind, cmcId: c.cmcId, reason: "weekly_cap", detail: `daily critical cap of ${CRITICAL_PER_DAY_CAP} reached` });
      continue;
    }
    emit.push(c);
    criticalBudget -= 1;
  }
  let slots = Math.max(0, input.preferences.weeklyCap - nonCriticalWeek);
  for (const c of rest) {
    if (slots <= 0) {
      suppressed.push({ kind: c.kind, cmcId: c.cmcId, reason: "weekly_cap", detail: `weekly cap of ${input.preferences.weeklyCap} reached` });
      continue;
    }
    emit.push(c);
    slots -= 1;
  }

  return {
    emit,
    suppressed,
    evaluated: { holdings: input.holdings.length, pricedFresh: freshQuotes.size, stale, unpriced },
  };
}
