import type { AlertFact, CategorySnapshot, QuoteSnapshot } from "@nemea/shared-types";
import { categoryFor, portfolioChange24h, type PortfolioChange, type Row, valueShare } from "./portfolio.ts";
import { multiple, pct, pctAbs, usd } from "./format.ts";
import type { AlertContext, Candidate, DropAttribution, EngineInput, PriceLow } from "./types.ts";
import { attributeDrop } from "./portfolio.ts";

export type RuleContext = {
  input: EngineInput;
  rows: Row[];
  freshQuotes: Map<number, QuoteSnapshot>;
  change: PortfolioChange | null;
  attribution: DropAttribution | null;
  incomplete: boolean;
};

export const SEVERITY_WEIGHT = { critical: 100, warning: 50, info: 10 } as const;

const MIN_PORTFOLIO_COVERAGE_PCT = 80;
const MIN_CATEGORY_SHARE = 0.1;
const CATEGORY_UNDERPERFORM_PTS = 5;
const MIN_VOLUME_FLOOR_USD = 100_000;

function score(severity: keyof typeof SEVERITY_WEIGHT, magnitudePct: number, share: number): number {
  return SEVERITY_WEIGHT[severity] + Math.min(Math.abs(magnitudePct), 50) + share * 20;
}

function baseContext(cmcId: number | null, observed: AlertContext["observed"], ctx: RuleContext, categoryName: string | null = null, categoryChange: number | null = null): AlertContext {
  return {
    cmcId,
    observed,
    categoryName,
    categoryChange24hPct: categoryChange,
    marketChange24hPct: ctx.input.global?.totalMarketCapChange24hPct ?? null,
    attribution: null,
  };
}

function positionFacts(row: Row, ctx: RuleContext): AlertFact[] {
  const facts: AlertFact[] = [{ label: "You hold", value: `${row.holding.amount} ${row.holding.symbol}` }];
  if (row.valueUsd !== null) {
    const share = valueShare(ctx.rows, row.holding.cmcId) * 100;
    facts.push({ label: "Position value", value: `${usd(row.valueUsd)} (${share.toFixed(share >= 10 ? 0 : 1)}% of portfolio)` });
  }
  return facts;
}

function heldRows(ctx: RuleContext): Array<{ row: Row; quote: QuoteSnapshot }> {
  const merged = new Map<number, { row: Row; quote: QuoteSnapshot }>();
  for (const row of ctx.rows) {
    const quote = ctx.freshQuotes.get(row.holding.cmcId);
    if (!quote) continue;
    const seen = merged.get(row.holding.cmcId);
    if (!seen) {
      merged.set(row.holding.cmcId, { row: { ...row, holding: { ...row.holding } }, quote });
      continue;
    }
    seen.row.holding.amount += row.holding.amount;
    seen.row.valueUsd = (seen.row.valueUsd ?? 0) + (row.valueUsd ?? 0);
    if (seen.row.holding.costBasisUsd === null) seen.row.holding.costBasisUsd = row.holding.costBasisUsd;
  }
  return [...merged.values()];
}

function priorPrice(quote: QuoteSnapshot, changePct: number | null): number | null {
  if (quote.priceUsd === null || changePct === null || changePct <= -100) return null;
  return quote.priceUsd / (1 + changePct / 100);
}

export function priceDropRules(ctx: RuleContext): Candidate[] {
  const out: Candidate[] = [];
  const prefs = ctx.input.preferences;
  for (const { row, quote } of heldRows(ctx)) {
    if (ctx.input.peggedUsdIds.has(row.holding.cmcId) || quote.priceUsd === null) continue;
    const share = valueShare(ctx.rows, row.holding.cmcId);
    const d1 = quote.percentChange1h;
    const d24 = quote.percentChange24h;
    const hit1 = d1 !== null && d1 <= -prefs.drop1hPct;
    const hit24 = d24 !== null && d24 <= -prefs.drop24hPct;
    if (!hit1 && !hit24) continue;
    const meta = ctx.input.meta.get(row.holding.cmcId);
    const category = categoryFor(meta, ctx.input.categories);
    const useHour = hit1 && (!hit24 || Math.abs(d1 as number) / prefs.drop1hPct >= Math.abs(d24 as number) / prefs.drop24hPct);
    const kind = useHour ? "price_drop_1h" : "price_drop_24h";
    const change = (useHour ? d1 : d24) as number;
    const threshold = useHour ? prefs.drop1hPct : prefs.drop24hPct;
    const severity = Math.abs(change) >= threshold * 2 ? "critical" : "warning";
    const before = priorPrice(quote, change);
    const window = useHour ? "hour" : "24 hours";
    const facts: AlertFact[] = [
      { label: "Price now", value: usd(quote.priceUsd) },
      { label: useHour ? "Change, 1h" : "Change, 24h", value: pct(change) },
    ];
    if (useHour && d24 !== null) facts.push({ label: "Change, 24h", value: pct(d24) });
    if (!useHour && d1 !== null) facts.push({ label: "Change, 1h", value: pct(d1) });
    facts.push(...positionFacts(row, ctx));
    out.push({
      kind,
      severity,
      cmcId: row.holding.cmcId,
      symbol: row.holding.symbol,
      title: `${row.holding.symbol} is down ${pctAbs(change)} in the last ${window}`,
      summary: `${quote.name} moved from about ${before !== null ? usd(before) : "its earlier price"} to ${usd(quote.priceUsd)}. Nothing has happened to your coins — this is the market price only.`,
      facts,
      dedupeKey: `price_drop:${row.holding.cmcId}`,
      score: score(severity, change, share),
      context: baseContext(row.holding.cmcId, { change1hPct: d1, change24hPct: d24, priceUsd: quote.priceUsd, thresholdPct: threshold }, ctx, category?.name ?? null, category?.avgPriceChange24hPct ?? null),
    });
  }
  return out;
}

export function costBasisRules(ctx: RuleContext): Candidate[] {
  const out: Candidate[] = [];
  const done = new Set<number>();
  for (const row of ctx.rows) {
    const quote = ctx.freshQuotes.get(row.holding.cmcId);
    const basis = row.holding.costBasisUsd;
    if (!quote || basis === null || quote.priceUsd === null || done.has(row.holding.cmcId)) continue;
    const before = priorPrice(quote, quote.percentChange24h);
    if (before === null) continue;
    if (!(before >= basis && quote.priceUsd < basis)) continue;
    done.add(row.holding.cmcId);
    const below = (1 - quote.priceUsd / basis) * 100;
    const share = valueShare(ctx.rows, row.holding.cmcId);
    const total = ctx.rows.filter((r) => r.holding.cmcId === row.holding.cmcId).reduce((sum, r) => sum + r.holding.amount, 0);
    out.push({
      kind: "below_cost_basis",
      severity: "warning",
      cmcId: row.holding.cmcId,
      symbol: row.holding.symbol,
      title: `${row.holding.symbol} just fell below the price you paid`,
      summary: `You told us you paid about ${usd(basis)} per coin. The price is now ${usd(quote.priceUsd)}, ${pctAbs(below)} lower. Yesterday it was still above your entry.`,
      facts: [
        { label: "Your cost basis", value: usd(basis) },
        { label: "Price now", value: usd(quote.priceUsd) },
        { label: "Below entry", value: pctAbs(below) },
        { label: "You hold", value: `${total} ${row.holding.symbol}` },
      ],
      dedupeKey: `below_cost_basis:${row.holding.cmcId}`,
      score: score("warning", below, share),
      context: baseContext(row.holding.cmcId, { costBasisUsd: basis, priceUsd: quote.priceUsd, belowPct: below }, ctx),
    });
  }
  return out;
}

function lowLabel(low: PriceLow): string {
  return low.scope === "all_time" ? "all-time low" : `${low.windowDays}-day low`;
}

export function nearLowRules(ctx: RuleContext): Candidate[] {
  const out: Candidate[] = [];
  const within = ctx.input.preferences.nearLowWithinPct;
  for (const { row, quote } of heldRows(ctx)) {
    const low = ctx.input.lows.get(row.holding.cmcId);
    if (!low || quote.priceUsd === null || ctx.input.peggedUsdIds.has(row.holding.cmcId)) continue;
    const distance = (quote.priceUsd / low.lowUsd - 1) * 100;
    if (distance > within) continue;
    const share = valueShare(ctx.rows, row.holding.cmcId);
    const severity = distance <= 0 ? "warning" : "info";
    out.push({
      kind: "near_low",
      severity,
      cmcId: row.holding.cmcId,
      symbol: row.holding.symbol,
      title: distance <= 0 ? `${row.holding.symbol} is at a new ${lowLabel(low)}` : `${row.holding.symbol} is within ${pctAbs(distance)} of its ${lowLabel(low)}`,
      summary: `The lowest price CoinMarketCap shows for ${quote.name} over this period is ${usd(low.lowUsd)}${low.lowAt ? ` (${low.lowAt.slice(0, 10)})` : ""}. It trades at ${usd(quote.priceUsd)} now.`,
      facts: [
        { label: "Price now", value: usd(quote.priceUsd) },
        { label: lowLabel(low), value: usd(low.lowUsd) },
        { label: "Distance above low", value: distance <= 0 ? "at or below" : pctAbs(distance) },
        ...positionFacts(row, ctx),
      ],
      dedupeKey: `near_low:${row.holding.cmcId}`,
      score: score(severity, Math.max(0, within - distance), share),
      context: baseContext(row.holding.cmcId, { priceUsd: quote.priceUsd, lowUsd: low.lowUsd, lowScope: low.scope, lowWindowDays: low.windowDays, distancePct: distance }, ctx),
    });
  }
  return out;
}

export function depegRules(ctx: RuleContext): Candidate[] {
  const out: Candidate[] = [];
  const floor = ctx.input.preferences.depegFloorUsd;
  for (const { row, quote } of heldRows(ctx)) {
    if (!ctx.input.peggedUsdIds.has(row.holding.cmcId) || quote.priceUsd === null) continue;
    if (quote.priceUsd >= floor) continue;
    const off = (1 - quote.priceUsd) * 100;
    const share = valueShare(ctx.rows, row.holding.cmcId);
    out.push({
      kind: "depeg",
      severity: "critical",
      cmcId: row.holding.cmcId,
      symbol: row.holding.symbol,
      title: `${row.holding.symbol} is trading at ${usd(quote.priceUsd)}, off its $1 peg`,
      summary: `A stablecoin is meant to stay at $1. ${quote.name} is ${pctAbs(off)} below that on CoinMarketCap right now. Small dips often fix themselves; a large one deserves attention.`,
      facts: [
        { label: "Price now", value: usd(quote.priceUsd) },
        { label: "Below $1 by", value: pctAbs(off) },
        { label: "Your alert level", value: usd(floor) },
        ...positionFacts(row, ctx),
      ],
      dedupeKey: `depeg:${row.holding.cmcId}`,
      score: score("critical", off * 5, share),
      context: baseContext(row.holding.cmcId, { priceUsd: quote.priceUsd, floorUsd: floor, offPegPct: off, volumeChange24hPct: quote.volumeChange24hPct }, ctx),
    });
  }
  return out;
}

export function volumeRules(ctx: RuleContext): Candidate[] {
  const out: Candidate[] = [];
  const prefs = ctx.input.preferences;
  for (const { row, quote } of heldRows(ctx)) {
    const change = quote.volumeChange24hPct;
    if (change === null || quote.priceUsd === null) continue;
    const pegged = ctx.input.peggedUsdIds.has(row.holding.cmcId);
    const share = valueShare(ctx.rows, row.holding.cmcId);
    const volume = quote.volume24hUsd;
    const spikeAt = ((pegged ? prefs.stableVolumeMultiple : prefs.volumeSpikeMultiple) - 1) * 100;
    if (change >= spikeAt && (volume === null || volume >= MIN_VOLUME_FLOOR_USD)) {
      const stressed = pegged ? quote.priceUsd < 0.995 : (quote.percentChange24h ?? 0) <= -5;
      const severity = stressed ? "warning" : "info";
      out.push({
        kind: pegged ? "stable_volume_anomaly" : "volume_spike",
        severity,
        cmcId: row.holding.cmcId,
        symbol: row.holding.symbol,
        title: pegged ? `${row.holding.symbol}: unusually heavy trading (${multiple(change)} normal)` : `${row.holding.symbol}: trading volume is ${multiple(change)} its recent level`,
        summary: `Trading in ${quote.name} jumped to ${multiple(change)} of the previous day's volume${volume !== null ? ` (${usd(volume)} in 24h)` : ""}. Heavy trading means many people are moving at once; it is not a price prediction.`,
        facts: [
          { label: "24h volume vs previous 24h", value: pct(change, 0) },
          ...(volume !== null ? [{ label: "24h volume", value: usd(volume) }] : []),
          { label: "Price now", value: usd(quote.priceUsd) },
          ...positionFacts(row, ctx),
        ],
        dedupeKey: `${pegged ? "stable_volume_anomaly" : "volume_spike"}:${row.holding.cmcId}`,
        score: score(severity, Math.min(change / 20, 50), share),
        context: baseContext(row.holding.cmcId, { volumeChange24hPct: change, volume24hUsd: volume, priceUsd: quote.priceUsd, change24hPct: quote.percentChange24h }, ctx),
      });
    }
    if (!pegged && change <= -prefs.volumeDryUpPct && (quote.percentChange24h ?? 0) <= -3 && share >= MIN_CATEGORY_SHARE) {
      out.push({
        kind: "volume_dry_up",
        severity: "warning",
        cmcId: row.holding.cmcId,
        symbol: row.holding.symbol,
        title: `${row.holding.symbol}: trading has slowed sharply while the price fell`,
        summary: `Volume in ${quote.name} is ${pctAbs(change)} lower than the day before while the price is down ${pctAbs(quote.percentChange24h ?? 0)}. With fewer buyers and sellers around, prices can move more on smaller trades. CoinMarketCap's data shows volume, not order books, so this is a proxy for thin liquidity.`,
        facts: [
          { label: "24h volume vs previous 24h", value: pct(change, 0) },
          { label: "Change, 24h", value: pct(quote.percentChange24h ?? 0) },
          ...positionFacts(row, ctx),
        ],
        dedupeKey: `volume_dry_up:${row.holding.cmcId}`,
        score: score("warning", Math.abs(change) / 2, share),
        context: baseContext(row.holding.cmcId, { volumeChange24hPct: change, change24hPct: quote.percentChange24h, priceUsd: quote.priceUsd }, ctx),
      });
    }
  }
  return out;
}

export function categoryRules(ctx: RuleContext): Candidate[] {
  const out: Candidate[] = [];
  const market = ctx.input.global?.totalMarketCapChange24hPct ?? null;
  const total = ctx.rows.reduce((s, r) => s + (r.valueUsd ?? 0), 0);
  if (total <= 0) return out;
  const byCategory = new Map<string, { category: CategorySnapshot; value: number; symbols: Set<string> }>();
  for (const row of ctx.rows) {
    if (row.valueUsd === null || ctx.input.peggedUsdIds.has(row.holding.cmcId)) continue;
    const category = categoryFor(ctx.input.meta.get(row.holding.cmcId), ctx.input.categories);
    if (!category || category.avgPriceChange24hPct === null) continue;
    const g = byCategory.get(category.id) ?? { category, value: 0, symbols: new Set<string>() };
    g.value += row.valueUsd;
    g.symbols.add(row.holding.symbol);
    byCategory.set(category.id, g);
  }
  for (const { category, value, symbols } of byCategory.values()) {
    const change = category.avgPriceChange24hPct as number;
    const share = value / total;
    if (change > -ctx.input.preferences.categoryDropPct || share < MIN_CATEGORY_SHARE) continue;
    if (market === null || change - market > -CATEGORY_UNDERPERFORM_PTS) continue;
    out.push({
      kind: "category_rotation",
      severity: "warning",
      cmcId: null,
      symbol: null,
      title: `${category.name} coins are down ${pctAbs(change)} today`,
      summary: `Coins in the "${category.name}" group are down ${pctAbs(change)} on average, while the whole market is ${pct(market)}. Money seems to be leaving this group. You hold ${[...symbols].sort().join(", ")} from it (${(share * 100).toFixed(0)}% of your portfolio).`,
      facts: [
        { label: `${category.name}, 24h average`, value: pct(change) },
        { label: "Whole market, 24h", value: pct(market) },
        { label: "Your exposure", value: `${(share * 100).toFixed(0)}% of portfolio` },
      ],
      dedupeKey: `category_rotation:${category.id}`,
      score: score("warning", change - market, share),
      context: baseContext(null, { categoryChange24hPct: change, marketChange24hPct: market, exposureShare: share }, ctx, category.name, change),
    });
  }
  return out;
}

const MAX_SINGLE_COIN_SHARE = 0.85;

function isDiversified(rows: readonly Row[]): boolean {
  const byId = new Map<number, number>();
  for (const r of rows) if (r.valueUsd !== null) byId.set(r.holding.cmcId, (byId.get(r.holding.cmcId) ?? 0) + r.valueUsd);
  if (byId.size < 2) return false;
  const total = [...byId.values()].reduce((a, b) => a + b, 0);
  return total > 0 && Math.max(...byId.values()) / total < MAX_SINGLE_COIN_SHARE;
}

export function portfolioRules(ctx: RuleContext): Candidate[] {
  const change = ctx.change;
  const prefs = ctx.input.preferences;
  if (!change || ctx.incomplete || change.coveragePct < MIN_PORTFOLIO_COVERAGE_PCT) return [];
  if (!isDiversified(ctx.rows)) return [];
  if (change.changePct > -prefs.portfolioDropPct) return [];
  const attribution = ctx.attribution;
  const severity = change.changePct <= -prefs.portfolioDropPct * 2 ? "critical" : "warning";
  const top = attribution?.byCategory[0];
  const because = top
    ? ` About ${top.sharePct.toFixed(0)}% of the drop comes from ${top.categoryName}${top.categoryChange24hPct !== null && top.categoryChange24hPct < 0 ? `, which is down ${pctAbs(top.categoryChange24hPct)} on average across CoinMarketCap` : ""}.`
    : "";
  const context = baseContext(null, { change24hPct: change.changePct, valueNowUsd: change.valueNowUsd, coveragePct: change.coveragePct }, ctx, top?.categoryName ?? null, top?.categoryChange24hPct ?? null);
  context.attribution = attribution;
  return [
    {
      kind: "portfolio_drop",
      severity,
      cmcId: null,
      symbol: null,
      title: `Your portfolio is down ${pctAbs(change.changePct)} in 24 hours`,
      summary: `Your holdings are worth about ${usd(change.valueNowUsd)} now, from about ${usd(change.valuePrevUsd)} a day ago.${because}`,
      facts: [
        { label: "Portfolio, 24h", value: pct(change.changePct) },
        { label: "Value now", value: usd(change.valueNowUsd) },
        { label: "Value 24h ago", value: usd(change.valuePrevUsd) },
        ...(attribution?.byCategory.slice(0, 3).map((c) => ({ label: `From ${c.categoryName}`, value: `${c.sharePct.toFixed(0)}% of the drop (${c.symbols.join(", ")})` })) ?? []),
      ],
      dedupeKey: "portfolio_drop",
      score: score(severity, change.changePct, 1),
      context,
    },
  ];
}

export function buildRuleContext(input: EngineInput, rows: Row[], freshQuotes: Map<number, QuoteSnapshot>, incomplete: boolean): RuleContext {
  const freshRows = rows.map((r) => {
    const q = freshQuotes.get(r.holding.cmcId);
    return q ? r : { ...r, quote: null, valueUsd: null };
  });
  return {
    input,
    rows: freshRows,
    freshQuotes,
    change: portfolioChange24h(freshRows),
    attribution: attributeDrop(freshRows, input.meta, input.categories, input.global),
    incomplete,
  };
}
