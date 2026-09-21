import { DISCLAIMER, type AlertRecord, type Explanation, type QuoteSnapshot, type SimulateScenario, type CategorySnapshot } from "@nemea/shared-types";
import { CmcPlanError, CmcRateLimitError } from "@nemea/cmc-client";
import { CALM_NOTE, categoryFor, evaluate, explain, findSimilarDrops, priceRows, summarizePegExcursions, totalValue, type Candidate, type EngineInput, type EngineOutput, type PegSummary, type SimilarDropsSummary } from "@nemea/alerts";
import { HttpError } from "../http.ts";
import { MAX_QUOTE_AGE_MS } from "../config.ts";
import type { DeliveryService } from "./delivery/index.ts";
import type { MarketService } from "./market.ts";
import type { AlertRow, Repo, UserRow } from "./repo.ts";
import { PEGGED_IDS } from "./watchlist.ts";

export function toAlertRecord(row: AlertRow): AlertRecord {
  return {
    id: row.id,
    kind: row.kind as AlertRecord["kind"],
    severity: row.severity,
    cmcId: row.cmcId,
    symbol: row.symbol,
    title: row.title,
    summary: row.summary,
    facts: row.facts,
    dedupeKey: row.dedupeKey,
    simulated: row.simulated,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    disclaimer: DISCLAIMER,
  };
}

export class Evaluator {
  constructor(
    private readonly repo: Repo,
    readonly market: MarketService,
    private readonly delivery: DeliveryService,
    private readonly log: (message: string, error?: unknown) => void,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async loadInput(user: UserRow): Promise<EngineInput> {
    const holdings = await this.repo.holdingsOf(user.id);
    const ids = [...new Set(holdings.map((h) => h.cmcId))];
    const [quotes, meta, global, categories, lows, past] = await Promise.all([
      this.market.quotesFor(ids),
      this.market.metaFor([...ids, ...PEGGED_IDS]),
      this.market.global(),
      this.market.categories(),
      this.market.lows(ids),
      this.repo.pastAlerts(user.id, 8),
    ]);
    return { now: this.now(), holdings, quotes, meta, global, categories, preferences: user.preferences, peggedUsdIds: PEGGED_IDS, lows, past, maxQuoteAgeMs: MAX_QUOTE_AGE_MS };
  }

  async persist(user: UserRow, emit: readonly Candidate[], simulated: boolean): Promise<AlertRow[]> {
    const rows: AlertRow[] = [];
    for (const c of emit) {
      const row = await this.repo.insertAlert(user.id, { kind: c.kind, severity: c.severity, cmcId: c.cmcId, symbol: c.symbol, title: c.title, summary: c.summary, facts: c.facts, context: c.context, dedupeKey: c.dedupeKey, simulated });
      rows.push(row);
    }
    for (const row of rows) await this.delivery.deliver(user, row);
    return rows;
  }

  async evaluateUser(user: UserRow): Promise<{ alerts: AlertRow[]; output: EngineOutput }> {
    const input = await this.loadInput(user);
    if (input.holdings.length === 0) return { alerts: [], output: { emit: [], suppressed: [], evaluated: { holdings: 0, pricedFresh: 0, stale: 0, unpriced: 0 } } };
    const output = evaluate(input);
    const alerts = await this.persist(user, output.emit, false);
    return { alerts, output };
  }

  async simulate(user: UserRow, scenario: SimulateScenario, cmcId: number | undefined): Promise<AlertRow> {
    const input = await this.loadInput(user);
    if (input.holdings.length === 0) throw new HttpError(400, "empty_portfolio", "Add at least one coin first, then simulate an alert on it.");
    const rows = priceRows(input.holdings, input.quotes);
    const byValue = [...rows].filter((r) => r.valueUsd !== null).sort((a, b) => (b.valueUsd as number) - (a.valueUsd as number));
    const nonStable = byValue.filter((r) => !PEGGED_IDS.has(r.holding.cmcId));
    const quotes = new Map<number, QuoteSnapshot>(input.quotes);
    const stamp = this.now().toISOString();
    const fresh = (q: QuoteSnapshot, patch: Partial<QuoteSnapshot>): QuoteSnapshot => ({ ...q, ...patch, cmcLastUpdated: stamp, fetchedAt: stamp });
    let categories: CategorySnapshot[] = [...input.categories];
    let global = input.global;
    let preferences = { ...input.preferences };
    let wanted: (c: Candidate) => boolean;

    if (scenario === "drop" || scenario === "volume_spike") {
      const target = cmcId !== undefined ? nonStable.find((r) => r.holding.cmcId === cmcId) : nonStable[0];
      if (!target) throw new HttpError(400, "no_target", "No priced non-stablecoin holding to simulate on. Add a coin such as ETH first.");
      const q = quotes.get(target.holding.cmcId) as QuoteSnapshot;
      if (scenario === "drop") {
        const change = -Math.round(preferences.drop24hPct * 1.5 * 10) / 10;
        quotes.set(q.cmcId, fresh(q, { percentChange24h: change, percentChange1h: null, priceUsd: (q.priceUsd as number) * (1 + change / 100) }));
        preferences = { ...preferences, portfolioDropPct: 90 };
        wanted = (c) => c.kind === "price_drop_24h" && c.cmcId === q.cmcId;
      } else {
        quotes.set(q.cmcId, fresh(q, { volumeChange24hPct: (preferences.volumeSpikeMultiple * 1.5 - 1) * 100, volume24hUsd: Math.max(q.volume24hUsd ?? 0, 5_000_000) }));
        wanted = (c) => c.kind === "volume_spike" && c.cmcId === q.cmcId;
      }
    } else if (scenario === "depeg") {
      const target = byValue.find((r) => PEGGED_IDS.has(r.holding.cmcId) && (cmcId === undefined || r.holding.cmcId === cmcId));
      if (!target) throw new HttpError(400, "no_stablecoin", "You hold no watched stablecoin (USDT, USDC, DAI, USDe). Add one to simulate a depeg.");
      const q = quotes.get(target.holding.cmcId) as QuoteSnapshot;
      quotes.set(q.cmcId, fresh(q, { priceUsd: 0.955, percentChange24h: -4.5, volumeChange24hPct: 420 }));
      wanted = (c) => c.kind === "depeg" && c.cmcId === q.cmcId;
    } else {
      if (nonStable.length < 2) throw new HttpError(400, "not_diversified", "A portfolio-level simulation needs at least two non-stablecoin holdings.");
      const drop = -Math.round(preferences.portfolioDropPct * 2.2 * 10) / 10;
      for (const r of nonStable) {
        const q = quotes.get(r.holding.cmcId) as QuoteSnapshot;
        quotes.set(q.cmcId, fresh(q, { percentChange24h: drop, priceUsd: (q.priceUsd as number) * (1 + drop / 100) }));
      }
      const top = categoryFor(input.meta.get(nonStable[0]?.holding.cmcId as number), categories);
      if (top) categories = categories.map((c) => (c.id === top.id ? { ...c, avgPriceChange24hPct: drop * 0.9, marketCapChange24hPct: drop * 0.9 } : c));
      global = input.global ? { ...input.global, totalMarketCapChange24hPct: drop * 0.6 } : input.global;
      preferences = { ...preferences, drop24hPct: 90, drop1hPct: 90 };
      wanted = (c) => c.kind === "portfolio_drop";
    }

    const output = evaluate({ ...input, quotes, categories, global, preferences, past: [] });
    const chosen = output.emit.find(wanted);
    if (!chosen) throw new HttpError(409, "simulation_empty", "The simulation did not cross any alert threshold with your current settings.");
    const [row] = await this.persist(user, [chosen], true);
    return row as AlertRow;
  }

  async explainAlert(user: UserRow, row: AlertRow): Promise<{ alert: AlertRecord; explanation: Explanation }> {
    const ids = row.cmcId !== null ? [row.cmcId] : [];
    const [meta, quotes] = await Promise.all([this.market.metaFor(ids), this.market.quotesFor(ids)]);
    let similar: SimilarDropsSummary | null = null;
    let peg: PegSummary | null = null;
    let unavailable: string | null = null;
    if (row.cmcId !== null && (row.kind === "price_drop_1h" || row.kind === "price_drop_24h" || row.kind === "depeg")) {
      try {
        const points = await this.market.cmc.getHistorical(row.cmcId, { days: 365, interval: "daily" });
        if (row.kind === "depeg") peg = summarizePegExcursions(points, user.preferences.depegFloorUsd);
        else similar = findSimilarDrops(points, Math.max(5, Math.abs(Number(row.context.observed[row.kind === "price_drop_1h" ? "change1hPct" : "change24hPct"] ?? 10)) * 0.7));
        if (!similar && !peg) unavailable = "CoinMarketCap returned too little price history to compare with.";
      } catch (error) {
        unavailable =
          error instanceof CmcPlanError
            ? "Price history is not included in the CoinMarketCap plan Nemea is running on, so we cannot say whether this has happened before."
            : error instanceof CmcRateLimitError
              ? "CoinMarketCap is rate-limiting Nemea right now, so price history could not be loaded. Try again in a minute."
              : "Price history could not be loaded from CoinMarketCap right now.";
        this.log(`explain: history for ${row.cmcId} failed`, error);
      }
    }
    const explanation = explain({
      alert: { kind: row.kind as AlertRecord["kind"], severity: row.severity, symbol: row.symbol, title: row.title, facts: row.facts, context: row.context },
      name: row.cmcId !== null ? (meta.get(row.cmcId)?.name ?? row.symbol) : null,
      quoteNow: row.simulated || row.cmcId === null ? null : (quotes.get(row.cmcId) ?? null),
      similarDrops: similar,
      pegHistory: peg,
      historyUnavailableReason: unavailable,
    });
    if (row.simulated) {
      explanation.sections.unshift({
        heading: "This is a simulation",
        body: "You asked Nemea to show what an alert looks like. The price move in this alert is made up for the demo; your real holdings and CoinMarketCap's real history are used for everything else. Real alerts look exactly like this.",
      });
      explanation.calmNote = `${CALM_NOTE} And because this one is a simulation, nothing actually happened at all.`;
    }
    return { alert: toAlertRecord(row), explanation };
  }

  async portfolioValue(userId: string): Promise<{ valueUsd: number | null; change24hPct: number | null; holdings: number }> {
    const holdings = await this.repo.holdingsOf(userId);
    const quotes = await this.market.quotesFor(holdings.map((h) => h.cmcId));
    const rows = priceRows(holdings, quotes);
    const value = totalValue(rows);
    let now = 0;
    let prev = 0;
    for (const r of rows) {
      const pct = r.quote?.percentChange24h;
      if (r.valueUsd === null || pct == null || pct <= -100) continue;
      now += r.valueUsd;
      prev += r.valueUsd / (1 + pct / 100);
    }
    return { valueUsd: value, change24hPct: prev > 0 ? (now / prev - 1) * 100 : null, holdings: holdings.length };
  }
}
