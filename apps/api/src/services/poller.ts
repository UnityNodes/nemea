import { BASE_TICK_SECONDS, CmcRateLimitError, categoriesDueOnTick, globalDueOnTick, idsDueOnTick, planCadence, type Cadence, type CadencePlan } from "@nemea/cmc-client";
import { priceRows } from "@nemea/alerts";
import type { PollLaneStatus } from "@nemea/shared-types";
import type { Db } from "../db/client.ts";
import { pollState } from "../db/schema.ts";
import type { DeliveryService } from "./delivery/index.ts";
import type { Evaluator } from "./evaluator.ts";
import type { MarketService } from "./market.ts";
import type { Repo } from "./repo.ts";
import { buildWorkload, type Workload } from "./watchlist.ts";

const REPLAN_EVERY_TICKS = 60;
const LOW_REFRESH_EVERY_TICKS = 30;
const LOWS_PER_RUN = 3;
const PAUSE_ON_QUOTA_MS = 30 * 60_000;
const DIGEST_HOUR_UTC = 8;
const LOW_CREDITS_FRACTION = 0.15;
const MIN_QUOTE_AGE_MS = 30 * 60_000;

type LaneName = PollLaneStatus["lane"];

type LaneState = { lastSuccessAt: Date | null; lastError: string | null; itemCount: number };

export type PollerStatus = {
  plan: CadencePlan | null;
  creditLimitMonthly: number | null;
  lanes: PollLaneStatus[];
  pausedUntil: string | null;
  ticks: number;
};

export class Poller {
  private tickCount = 0;
  private plan: CadencePlan | null = null;
  private creditLimit: number | null = null;
  private workload: Workload = { stablecoinIds: [], topIds: [], smallIds: [] };
  private pausedUntil = 0;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private quotaWarnedOn: string | null = null;
  private readonly lanes = new Map<LaneName, LaneState>();

  constructor(
    private readonly db: Db,
    private readonly repo: Repo,
    private readonly market: MarketService,
    private readonly evaluator: Evaluator,
    private readonly delivery: DeliveryService,
    private readonly log: (message: string, error?: unknown) => void,
    private readonly now: () => Date = () => new Date(),
  ) {}

  status(): PollerStatus {
    const cadence = this.plan?.cadence;
    const interval: Record<LaneName, number> = {
      stablecoins: cadence?.stablecoinsSec ?? 0,
      top: cadence?.topSec ?? 0,
      small: cadence?.smallSec ?? 0,
      global: cadence?.globalSec ?? 0,
      categories: cadence?.categoriesSec ?? 0,
    };
    const lanes: PollLaneStatus[] = (Object.keys(interval) as LaneName[]).map((lane) => {
      const s = this.lanes.get(lane);
      return { lane, intervalSeconds: interval[lane], lastSuccessAt: s?.lastSuccessAt?.toISOString() ?? null, lastError: s?.lastError ?? null, itemCount: s?.itemCount ?? 0 };
    });
    return { plan: this.plan, creditLimitMonthly: this.creditLimit, lanes, pausedUntil: this.pausedUntil > this.now().getTime() ? new Date(this.pausedUntil).toISOString() : null, ticks: this.tickCount };
  }

  maxQuoteAgeMs(): number {
    const c = this.plan?.cadence;
    if (!c) return MIN_QUOTE_AGE_MS;
    return Math.max(MIN_QUOTE_AGE_MS, 2 * Math.max(c.stablecoinsSec, c.topSec, c.smallSec) * 1000);
  }

  start(): void {
    if (this.timer) return;
    const loop = async () => {
      try {
        await this.tick();
      } catch (error) {
        this.log("poller tick crashed", error);
      }
    };
    void loop();
    this.timer = setInterval(() => void loop(), BASE_TICK_SECONDS * 1000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async record(lane: LaneName, outcome: { ok: true; items: number } | { ok: false; error: string }): Promise<void> {
    const prev = this.lanes.get(lane) ?? { lastSuccessAt: null, lastError: null, itemCount: 0 };
    const next: LaneState = outcome.ok ? { lastSuccessAt: this.now(), lastError: null, itemCount: outcome.items } : { ...prev, lastError: outcome.error };
    this.lanes.set(lane, next);
    await this.db
      .insert(pollState)
      .values({ lane, lastSuccessAt: next.lastSuccessAt, lastError: next.lastError, itemCount: next.itemCount })
      .onConflictDoUpdate({ target: pollState.lane, set: { lastSuccessAt: next.lastSuccessAt, lastError: next.lastError, itemCount: next.itemCount } });
  }

  private handleFailure(error: unknown, lane: LaneName): string {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof CmcRateLimitError && (error.scope === "daily" || error.scope === "monthly")) {
      this.pausedUntil = this.now().getTime() + PAUSE_ON_QUOTA_MS;
      this.log(`CMC ${error.scope} quota exhausted; pausing polling for ${PAUSE_ON_QUOTA_MS / 60000} min`);
    } else {
      this.log(`poll lane ${lane} failed`, error);
    }
    return message;
  }

  private async replan(): Promise<void> {
    const holders = await this.repo.allHoldings();
    const byUser = new Map<string, typeof holders>();
    for (const h of holders) byUser.set(h.userId, [...(byUser.get(h.userId) ?? []), h]);
    const ids = [...new Set(holders.map((h) => h.cmcId))];
    const quotes = await this.market.quotesFor(ids);
    this.workload = buildWorkload([...byUser.values()].map((hs) => ({ rows: priceRows(hs, quotes) })));
    try {
      const info = await this.market.cmc.getKeyInfo();
      this.creditLimit = info.creditLimitMonthly;
      await this.warnIfCreditsLow(info.creditsLeftMonth, info.creditLimitMonthly);
      if (info.rateLimitPerMinute && info.rateLimitPerMinute > 0) this.market.cmc.setRequestsPerMinute(info.rateLimitPerMinute);
    } catch (error) {
      this.log("could not read CMC key info; keeping previous plan limits", error);
    }
    this.plan = planCadence(this.creditLimit, this.workload);
    if (this.plan.verdict === "insufficient") this.log(`CMC plan is too small for the current portfolios even at the slowest cadence (~${this.plan.estimatedCreditsPerMonth} credits/month)`);
  }

  private async warnIfCreditsLow(left: number | null, limit: number | null): Promise<void> {
    if (left === null || limit === null || limit <= 0 || left / limit >= LOW_CREDITS_FRACTION) return;
    const today = this.now().toISOString().slice(0, 10);
    if (this.quotaWarnedOn === today) return;
    this.quotaWarnedOn = today;
    this.log(`CoinMarketCap credits low: ${left} of ${limit} left this month`);
    await this.delivery.notifyAdmin(`Nemea: CoinMarketCap credits are low, ${left} of ${limit} left this month. Polling will slow or pause when they run out.`);
  }

  async tick(): Promise<{ quotesUpdated: number; usersEvaluated: number; alertsCreated: number; skipped: string | null }> {
    if (this.running) return { quotesUpdated: 0, usersEvaluated: 0, alertsCreated: 0, skipped: "previous tick still running" };
    this.running = true;
    try {
      return await this.runTick();
    } finally {
      this.running = false;
    }
  }

  private async runTick(): Promise<{ quotesUpdated: number; usersEvaluated: number; alertsCreated: number; skipped: string | null }> {
    const n = this.tickCount;
    this.tickCount += 1;
    if (n % REPLAN_EVERY_TICKS === 0 || !this.plan) await this.replan();
    else this.workload = await this.refreshWorkload();
    const cadence = (this.plan as CadencePlan).cadence;
    if (this.pausedUntil > this.now().getTime()) return { quotesUpdated: 0, usersEvaluated: 0, alertsCreated: 0, skipped: "paused: CMC quota exhausted" };

    let quotesUpdated = 0;
    const refreshedIds: number[] = [];
    const due = idsDueOnTick(n, cadence, this.workload);
    if (due.length > 0) {
      try {
        const r = await this.market.refreshQuotes(due);
        quotesUpdated = r.updated;
        refreshedIds.push(...due);
        await this.recordQuoteLanes(n, cadence, r.updated);
      } catch (error) {
        const message = this.handleFailure(error, "stablecoins");
        for (const lane of this.dueQuoteLanes(n, cadence)) await this.record(lane, { ok: false, error: message });
      }
    }
    if (globalDueOnTick(n, cadence)) {
      try {
        await this.market.refreshGlobal();
        await this.record("global", { ok: true, items: 1 });
      } catch (error) {
        await this.record("global", { ok: false, error: this.handleFailure(error, "global") });
      }
    }
    if (categoriesDueOnTick(n, cadence)) {
      try {
        await this.record("categories", { ok: true, items: await this.market.refreshCategories() });
      } catch (error) {
        await this.record("categories", { ok: false, error: this.handleFailure(error, "categories") });
      }
    }
    await this.fillMissingMeta();
    if (n % LOW_REFRESH_EVERY_TICKS === 0) await this.refreshLows();

    let usersEvaluated = 0;
    let alertsCreated = 0;
    if (refreshedIds.length > 0) {
      for (const userId of await this.repo.userIdsHolding(refreshedIds)) {
        const user = await this.repo.userById(userId);
        if (!user) continue;
        try {
          const { alerts } = await this.evaluator.evaluateUser(user);
          usersEvaluated += 1;
          alertsCreated += alerts.length;
        } catch (error) {
          this.log(`evaluation failed for user ${userId}`, error);
        }
      }
    }
    if (n % 15 === 0) {
      const r = await this.delivery.runDigests(this.now().getUTCHours(), DIGEST_HOUR_UTC);
      if (r.sent + r.failed > 0) this.log(`email digests: ${r.sent} sent, ${r.failed} failed`);
    }
    return { quotesUpdated, usersEvaluated, alertsCreated, skipped: null };
  }

  private async refreshWorkload(): Promise<Workload> {
    const holders = await this.repo.allHoldings();
    const byUser = new Map<string, typeof holders>();
    for (const h of holders) byUser.set(h.userId, [...(byUser.get(h.userId) ?? []), h]);
    const quotes = await this.market.quotesFor([...new Set(holders.map((h) => h.cmcId))]);
    return buildWorkload([...byUser.values()].map((hs) => ({ rows: priceRows(hs, quotes) })));
  }

  private dueQuoteLanes(n: number, cadence: Cadence): LaneName[] {
    const every = (sec: number) => Math.max(1, Math.round(sec / BASE_TICK_SECONDS));
    const lanes: LaneName[] = [];
    if (n % every(cadence.stablecoinsSec) === 0) lanes.push("stablecoins");
    if (n % every(cadence.topSec) === 0) lanes.push("top");
    if (n % every(cadence.smallSec) === 0) lanes.push("small");
    return lanes;
  }

  private async recordQuoteLanes(n: number, cadence: Cadence, updated: number): Promise<void> {
    const counts: Record<string, number> = { stablecoins: this.workload.stablecoinIds.length, top: this.workload.topIds.length, small: this.workload.smallIds.length };
    for (const lane of this.dueQuoteLanes(n, cadence)) await this.record(lane, { ok: true, items: Math.min(counts[lane] ?? updated, updated) });
  }

  private async fillMissingMeta(): Promise<void> {
    try {
      const ids = [...new Set([...this.workload.topIds, ...this.workload.smallIds, ...this.workload.stablecoinIds])];
      const have = await this.market.metaFor(ids);
      const missing = ids.filter((id) => !have.has(id));
      if (missing.length > 0) await this.market.ensureMeta(missing);
    } catch (error) {
      this.log("could not fill token metadata", error);
    }
  }

  private async refreshLows(): Promise<void> {
    try {
      const candidates = this.workload.topIds;
      const stale = (await this.market.staleLowIds(candidates)).slice(0, LOWS_PER_RUN);
      for (const id of stale) await this.market.refreshLow(id);
    } catch (error) {
      this.log("could not refresh price lows", error);
    }
  }

  async loadPersistedLanes(): Promise<void> {
    const rows = await this.db.select().from(pollState);
    for (const r of rows) this.lanes.set(r.lane as LaneName, { lastSuccessAt: r.lastSuccessAt, lastError: r.lastError, itemCount: r.itemCount });
  }
}
