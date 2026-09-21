import type { CategorySnapshot, GlobalMetricsSnapshot, Holding, QuoteSnapshot, TokenMeta } from "@nemea/shared-types";
import { TOP_HOLDING_SHARE } from "@nemea/shared-types";
import type { CategoryContribution, DropAttribution } from "./types.ts";

export type Row = {
  holding: Holding;
  quote: QuoteSnapshot | null;
  valueUsd: number | null;
};

export function priceRows(holdings: readonly Holding[], quotes: ReadonlyMap<number, QuoteSnapshot>): Row[] {
  return holdings.map((holding) => {
    const quote = quotes.get(holding.cmcId) ?? null;
    const valueUsd = quote?.priceUsd != null ? quote.priceUsd * holding.amount : null;
    return { holding, quote, valueUsd };
  });
}

export function totalValue(rows: readonly Row[]): number | null {
  const priced = rows.filter((r) => r.valueUsd !== null);
  if (priced.length === 0) return null;
  return priced.reduce((sum, r) => sum + (r.valueUsd as number), 0);
}

export function valueShare(rows: readonly Row[], cmcId: number): number {
  const total = totalValue(rows);
  if (total === null || total <= 0) return 0;
  const mine = rows.filter((r) => r.holding.cmcId === cmcId).reduce((s, r) => s + (r.valueUsd ?? 0), 0);
  return mine / total;
}

export type PortfolioChange = {
  valueNowUsd: number;
  valuePrevUsd: number;
  changePct: number;
  coveragePct: number;
};

export function portfolioChange24h(rows: readonly Row[]): PortfolioChange | null {
  const total = totalValue(rows);
  if (total === null || total <= 0) return null;
  let now = 0;
  let prev = 0;
  let covered = 0;
  for (const r of rows) {
    const pct = r.quote?.percentChange24h;
    if (r.valueUsd === null || pct == null || pct <= -100) continue;
    now += r.valueUsd;
    prev += r.valueUsd / (1 + pct / 100);
    covered += r.valueUsd;
  }
  if (prev <= 0) return null;
  return { valueNowUsd: now, valuePrevUsd: prev, changePct: (now / prev - 1) * 100, coveragePct: (covered / total) * 100 };
}

export function tierHoldings(rows: readonly Row[]): Map<number, "top" | "small"> {
  const byId = new Map<number, number>();
  for (const r of rows) byId.set(r.holding.cmcId, (byId.get(r.holding.cmcId) ?? 0) + (r.valueUsd ?? 0));
  const sorted = [...byId.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const tiers = new Map<number, "top" | "small">();
  let running = 0;
  for (const [id, value] of sorted) {
    if (total <= 0) {
      tiers.set(id, "top");
      continue;
    }
    tiers.set(id, running / total < TOP_HOLDING_SHARE ? "top" : "small");
    running += value;
  }
  return tiers;
}

export function normalizeTag(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const NON_THEMATIC_CATEGORY =
  /(portfolio|bankruptcy estate|^sec\/cftc|^alleged sec|strategic crypto reserve|^made in (america|china)$|^cmc |(capital|fund|group)$|^jump crypto$|^2017\/18 alt season$|ecosystem|launchpad|launchpool)/i;

export function isThematicCategory(name: string): boolean {
  return !NON_THEMATIC_CATEGORY.test(name.trim());
}

export function categoryFor(meta: TokenMeta | undefined, categories: readonly CategorySnapshot[]): CategorySnapshot | null {
  if (!meta) return null;
  const byKey = new Map<string, CategorySnapshot>();
  for (const c of categories) {
    if (!isThematicCategory(c.name)) continue;
    const key = normalizeTag(c.name);
    if (!byKey.has(key)) byKey.set(key, c);
  }
  for (let i = 0; i < meta.tags.length; i++) {
    const group = meta.tagGroups?.[i];
    if (group === "PLATFORM") continue;
    const hit = byKey.get(normalizeTag(meta.tags[i] as string));
    if (hit) return hit;
  }
  return null;
}

export function attributeDrop(
  rows: readonly Row[],
  meta: ReadonlyMap<number, TokenMeta>,
  categories: readonly CategorySnapshot[],
  global: GlobalMetricsSnapshot | null,
): DropAttribution | null {
  const change = portfolioChange24h(rows);
  if (!change) return null;
  const groups = new Map<string, { loss: number; category: CategorySnapshot | null; symbols: Set<string>; ids: Set<number> }>();
  let totalLoss = 0;
  for (const r of rows) {
    const pct = r.quote?.percentChange24h;
    if (r.valueUsd === null || pct == null || pct <= -100) continue;
    const loss = r.valueUsd - r.valueUsd / (1 + pct / 100);
    if (loss >= 0) continue;
    const category = categoryFor(meta.get(r.holding.cmcId), categories);
    const key = category?.name ?? "Other";
    const g = groups.get(key) ?? { loss: 0, category, symbols: new Set<string>(), ids: new Set<number>() };
    g.loss += -loss;
    g.symbols.add(r.holding.symbol);
    g.ids.add(r.holding.cmcId);
    groups.set(key, g);
    totalLoss += -loss;
  }
  const byCategory: CategoryContribution[] = [...groups.entries()]
    .map(([categoryName, g]) => ({
      categoryName,
      lossUsd: g.loss,
      sharePct: totalLoss > 0 ? (g.loss / totalLoss) * 100 : 0,
      categoryChange24hPct: g.category?.avgPriceChange24hPct ?? null,
      symbols: [...g.symbols].sort(),
      cmcIds: [...g.ids],
    }))
    .sort((a, b) => b.lossUsd - a.lossUsd);
  return {
    portfolioChange24hPct: change.changePct,
    lossUsd: change.valuePrevUsd - change.valueNowUsd,
    valueNowUsd: change.valueNowUsd,
    byCategory,
    marketChange24hPct: global?.totalMarketCapChange24hPct ?? null,
  };
}
