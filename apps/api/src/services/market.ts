import type { CmcClient } from "@nemea/cmc-client";
import type { CategorySnapshot, GlobalMetricsSnapshot, QuoteSnapshot, TokenMeta } from "@nemea/shared-types";
import type { PriceLow } from "@nemea/alerts";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { marketSnapshots, priceLows, quoteLatest, tokenMeta } from "../db/schema.ts";

const LOW_TTL_MS = 24 * 3600_000;

export class MarketService {
  constructor(
    private readonly db: Db,
    readonly cmc: CmcClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async quotesFor(ids: readonly number[]): Promise<Map<number, QuoteSnapshot>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.select().from(quoteLatest).where(inArray(quoteLatest.cmcId, [...new Set(ids)]));
    return new Map(rows.map((r) => [r.cmcId, r.data]));
  }

  async refreshQuotes(ids: readonly number[]): Promise<{ updated: number; missing: number[] }> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return { updated: 0, missing: [] };
    const { quotes, missing } = await this.cmc.getQuotes(unique);
    const at = this.now();
    for (const q of quotes) {
      await this.db
        .insert(quoteLatest)
        .values({ cmcId: q.cmcId, data: q, fetchedAt: at })
        .onConflictDoUpdate({ target: quoteLatest.cmcId, set: { data: q, fetchedAt: at } });
    }
    return { updated: quotes.length, missing };
  }

  async ensureQuotes(ids: readonly number[], maxAgeMs: number): Promise<Map<number, QuoteSnapshot>> {
    const have = await this.quotesFor(ids);
    const t = this.now().getTime();
    const stale = [...new Set(ids)].filter((id) => {
      const q = have.get(id);
      return !q || t - Date.parse(q.fetchedAt) > maxAgeMs;
    });
    if (stale.length > 0) {
      await this.refreshQuotes(stale);
      return this.quotesFor(ids);
    }
    return have;
  }

  async metaFor(ids: readonly number[]): Promise<Map<number, TokenMeta>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.select().from(tokenMeta).where(inArray(tokenMeta.cmcId, [...new Set(ids)]));
    return new Map(rows.map((r) => [r.cmcId, r.data]));
  }

  async saveMeta(metas: readonly TokenMeta[]): Promise<void> {
    const at = this.now();
    for (const m of metas) {
      await this.db
        .insert(tokenMeta)
        .values({ cmcId: m.cmcId, data: m, fetchedAt: at })
        .onConflictDoUpdate({ target: tokenMeta.cmcId, set: { data: m, fetchedAt: at } });
    }
  }

  async ensureMeta(ids: readonly number[]): Promise<Map<number, TokenMeta>> {
    const have = await this.metaFor(ids);
    const missing = [...new Set(ids)].filter((id) => !have.has(id));
    if (missing.length > 0) {
      const fetched = await this.cmc.getInfoByIds(missing);
      await this.saveMeta(fetched);
      for (const m of fetched) have.set(m.cmcId, m);
    }
    return have;
  }

  async global(): Promise<GlobalMetricsSnapshot | null> {
    const [row] = await this.db.select().from(marketSnapshots).where(eq(marketSnapshots.key, "global"));
    return row ? (row.data as GlobalMetricsSnapshot) : null;
  }

  async refreshGlobal(): Promise<void> {
    const data = await this.cmc.getGlobalMetrics();
    const at = this.now();
    await this.db.insert(marketSnapshots).values({ key: "global", data, fetchedAt: at }).onConflictDoUpdate({ target: marketSnapshots.key, set: { data, fetchedAt: at } });
  }

  async categories(): Promise<CategorySnapshot[]> {
    const [row] = await this.db.select().from(marketSnapshots).where(eq(marketSnapshots.key, "categories"));
    return row ? (row.data as CategorySnapshot[]) : [];
  }

  async refreshCategories(): Promise<number> {
    const data = await this.cmc.getCategories();
    const at = this.now();
    await this.db.insert(marketSnapshots).values({ key: "categories", data, fetchedAt: at }).onConflictDoUpdate({ target: marketSnapshots.key, set: { data, fetchedAt: at } });
    return data.length;
  }

  async lows(ids: readonly number[]): Promise<Map<number, PriceLow>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.select().from(priceLows).where(inArray(priceLows.cmcId, [...new Set(ids)]));
    const out = new Map<number, PriceLow>();
    for (const r of rows) if (r.data) out.set(r.cmcId, r.data);
    return out;
  }

  async staleLowIds(ids: readonly number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(priceLows).where(inArray(priceLows.cmcId, [...new Set(ids)]));
    const fresh = new Set(rows.filter((r) => this.now().getTime() - r.fetchedAt.getTime() < LOW_TTL_MS).map((r) => r.cmcId));
    return [...new Set(ids)].filter((id) => !fresh.has(id));
  }

  async refreshLow(id: number): Promise<PriceLow | null> {
    const data = await this.cmc.getPriceLow(id);
    const at = this.now();
    await this.db.insert(priceLows).values({ cmcId: id, data, fetchedAt: at }).onConflictDoUpdate({ target: priceLows.cmcId, set: { data, fetchedAt: at } });
    return data;
  }
}
