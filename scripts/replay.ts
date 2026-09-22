import { mkdirSync, writeFileSync } from "node:fs";
import { CmcClient, parseHistorical } from "@nemea/cmc-client";
import { evaluate } from "@nemea/alerts";
import { DEFAULT_PREFERENCES } from "@nemea/shared-types";
import type { EngineInput, Holding, PastAlert, PriceLow, PricePoint, QuoteSnapshot } from "@nemea/shared-types";

const CMC_API_KEY = process.env.CMC_API_KEY;
if (!CMC_API_KEY) {
  console.error("replay needs CMC_API_KEY (a real key, this makes real calls)");
  process.exit(2);
}

const COINS: Array<{ id: number; symbol: string; name: string; stable: boolean }> = [
  { id: 1, symbol: "BTC", name: "Bitcoin", stable: false },
  { id: 1027, symbol: "ETH", name: "Ethereum", stable: false },
  { id: 5426, symbol: "SOL", name: "Solana", stable: false },
  { id: 74, symbol: "DOGE", name: "Dogecoin", stable: false },
  { id: 3408, symbol: "USDC", name: "USD Coin", stable: true },
];
const WINDOW_DAYS = 365;
const DAY_MS = 86_400_000;
const WARMUP_DAYS = 90;

async function fetchCalendarDayHistory(id: number, days: number): Promise<PricePoint[]> {
  const endMs = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const startMs = endMs - days * DAY_MS;
  const url = `https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/historical?id=${id}&time_start=${new Date(startMs).toISOString()}&time_end=${new Date(endMs).toISOString()}&interval=1d&convert=USD`;
  const res = await fetch(url, { headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY!, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  const body: unknown = await res.json();
  if (!res.ok) {
    const message = (body as { status?: { error_message?: string } } | null)?.status?.error_message ?? `HTTP ${res.status}`;
    throw new Error(`historical fetch for id ${id} failed: ${message}`);
  }
  return parseHistorical(body, id);
}

function holdingFor(coin: (typeof COINS)[number]): Holding {
  return { id: `replay-${coin.id}`, cmcId: coin.id, symbol: coin.symbol, name: coin.name, amount: 1, costBasisUsd: null, source: "manual", chain: null, contractAddress: null, walletAddress: null };
}

function quoteAt(coin: (typeof COINS)[number], ts: string, price: number, prevPrice: number | null): QuoteSnapshot {
  const change24h = prevPrice !== null ? ((price - prevPrice) / prevPrice) * 100 : null;
  return {
    cmcId: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    priceUsd: price,
    percentChange1h: null,
    percentChange24h: change24h,
    percentChange7d: null,
    percentChange30d: null,
    volume24hUsd: null,
    volumeChange24hPct: null,
    marketCapUsd: null,
    cmcRank: null,
    cmcLastUpdated: ts,
    fetchedAt: ts,
  };
}

type FiredAlert = { coin: string; kind: string; severity: string; date: string; changePct: number | null; priceUsd: number; forwardReturn7dPct: number | null; recoveredWithin7d: boolean | null };

async function main() {
  const client = new CmcClient({ apiKey: CMC_API_KEY! });
  const keyInfo = await client.getKeyInfo();
  if (keyInfo.rateLimitPerMinute) client.setRequestsPerMinute(keyInfo.rateLimitPerMinute);

  const fired: FiredAlert[] = [];
  const perCoin: Array<{ symbol: string; days: number; from: string | null; to: string | null; alerts: number; suppressedCooldown: number; suppressedCap: number }> = [];
  const changeByDate = new Map<string, Record<string, number | null>>();

  for (const coin of COINS) {
    const points = await fetchCalendarDayHistory(coin.id, WINDOW_DAYS);
    if (points.length < 10) {
      perCoin.push({ symbol: coin.symbol, days: points.length, from: null, to: null, alerts: 0, suppressedCooldown: 0, suppressedCap: 0 });
      continue;
    }
    const holding = holdingFor(coin);
    let runningLow: PriceLow = { lowUsd: points[0]!.priceUsd, lowAt: points[0]!.ts, windowDays: WINDOW_DAYS, scope: "window" };
    const past: PastAlert[] = [];
    let suppressedCooldown = 0;
    let suppressedCap = 0;

    for (let i = 1; i < points.length; i++) {
      const point = points[i]!;
      const prev = points[i - 1]!;
      const now = new Date(point.ts);
      const quote = quoteAt(coin, point.ts, point.priceUsd, prev.priceUsd);
      const day = point.ts.slice(0, 10);
      const dayRow = changeByDate.get(day) ?? {};
      dayRow[coin.symbol] = quote.percentChange24h;
      changeByDate.set(day, dayRow);
      const lowsWarmedUp = i >= WARMUP_DAYS;
      const lows = lowsWarmedUp ? new Map<number, PriceLow>([[coin.id, runningLow]]) : new Map<number, PriceLow>();
      const peggedUsdIds = coin.stable ? new Set([coin.id]) : new Set<number>();

      const input: EngineInput = {
        now,
        holdings: [holding],
        quotes: new Map([[coin.id, quote]]),
        meta: new Map(),
        global: null,
        categories: [],
        preferences: DEFAULT_PREFERENCES,
        peggedUsdIds,
        lows,
        past,
        maxQuoteAgeMs: DAY_MS * 2,
      };

      const result = evaluate(input);
      for (const s of result.suppressed) {
        if (s.reason === "cooldown") suppressedCooldown += 1;
        if (s.reason === "weekly_cap") suppressedCap += 1;
      }
      for (const alert of result.emit) {
        past.push({ kind: alert.kind, severity: alert.severity, cmcId: coin.id, dedupeKey: alert.dedupeKey, createdAt: point.ts, simulated: false });
        const future = points[i + 7] ?? null;
        const forward = future ? ((future.priceUsd - point.priceUsd) / point.priceUsd) * 100 : null;
        fired.push({
          coin: coin.symbol,
          kind: alert.kind,
          severity: alert.severity,
          date: point.ts.slice(0, 10),
          changePct: typeof alert.context.observed.change24hPct === "number" ? alert.context.observed.change24hPct : null,
          priceUsd: point.priceUsd,
          forwardReturn7dPct: forward,
          recoveredWithin7d: forward === null ? null : forward >= 0,
        });
      }
      if (point.priceUsd < runningLow.lowUsd) runningLow = { lowUsd: point.priceUsd, lowAt: point.ts, windowDays: WINDOW_DAYS, scope: "window" };
    }

    perCoin.push({
      symbol: coin.symbol,
      days: points.length - 1,
      from: points[1]!.ts.slice(0, 10),
      to: points.at(-1)!.ts.slice(0, 10),
      alerts: fired.filter((a) => a.coin === coin.symbol).length,
      suppressedCooldown,
      suppressedCap,
    });
  }

  const priceDrops = fired.filter((a) => a.kind === "price_drop_24h" || a.kind === "price_drop_1h");
  const withForward = priceDrops.filter((a) => a.forwardReturn7dPct !== null);
  const sortedForward = withForward.map((a) => a.forwardReturn7dPct as number).sort((a, b) => a - b);
  const median = sortedForward.length ? sortedForward[Math.floor(sortedForward.length / 2)]! : null;
  const recovered = withForward.filter((a) => a.recoveredWithin7d).length;

  const alertsByDate = new Map<string, number>();
  for (const a of priceDrops) alertsByDate.set(a.date, (alertsByDate.get(a.date) ?? 0) + 1);
  let busiestDate: string | null = null;
  for (const [date, count] of alertsByDate) {
    if (!busiestDate || count > (alertsByDate.get(busiestDate) ?? 0) || (count === alertsByDate.get(busiestDate) && date < busiestDate)) busiestDate = date;
  }
  const busiestDay = busiestDate
    ? {
        date: busiestDate,
        changes: COINS.filter((c) => !c.stable).map((c) => ({
          symbol: c.symbol,
          changePct: changeByDate.get(busiestDate!)?.[c.symbol] ?? null,
          fired: priceDrops.some((a) => a.date === busiestDate && a.coin === c.symbol),
        })),
      }
    : null;

  const near = fired.filter((a) => a.kind === "near_low");

  const summary = {
    ranAt: new Date().toISOString(),
    methodology:
      `Each coin replayed as its own single-coin portfolio, one real CoinMarketCap daily close per day (Basic plan allows exactly 12 months of daily history; this fetches the full 12), run through the production alert engine (packages/alerts, unmodified). The historical fetch uses explicit UTC-midnight time_start/time_end, not packages/cmc-client's getHistorical, because CoinMarketCap's daily interval anchors its bars to the query's own start time rather than to calendar midnight: the same date requested at two different times of day returns two different "daily" closes and two different 24h changes for it (see docs/API_FEEDBACK.md). Calendar-day boundaries make a rerun of this script reproducible; getHistorical's now-anchored bars would not be. price_drop_24h and depeg are scored from day 1: they only compare consecutive days, so there is nothing to warm up. near_low is scored only from day ${WARMUP_DAYS} onward: it needs a trailing low with real history behind it, and the running low has none for the first ${WARMUP_DAYS} days of a fetch that starts exactly where the fetch starts, so those days are excluded rather than scored against a look-ahead-free but artificially high low. A single-coin portfolio never triggers the portfolio-level rules, so this measures price_drop, depeg and near_low only. Caps and cooldowns are evaluated per coin, not across a combined portfolio. percentChange1h is not available from daily bars, so only the 24h drop rule can fire, not the 1h rule. This is a measurement of the shipped rule engine, not a backtest of a trading strategy: recovery within 7 days is reported for context, it is not a claim that Nemea predicts anything.`,
    windowDays: WINDOW_DAYS,
    warmupDays: WARMUP_DAYS,
    plan: { creditLimitMonthly: keyInfo.creditLimitMonthly, rateLimitPerMinute: keyInfo.rateLimitPerMinute },
    coins: perCoin,
    totalAlertsFired: fired.length,
    priceDropAlerts: priceDrops.length,
    suppressedByCooldown: perCoin.reduce((s, c) => s + c.suppressedCooldown, 0),
    suppressedByWeeklyCap: perCoin.reduce((s, c) => s + c.suppressedCap, 0),
    medianForwardReturn7dPct: median,
    recoveredWithin7dCount: recovered,
    recoveredWithin7dOfMeasurable: withForward.length,
    alerts: fired,
  };

  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync("docs/evidence/replay.json", JSON.stringify(summary, null, 2) + "\n");

  const webSummary = {
    ranAt: summary.ranAt,
    windowFrom: perCoin[0]?.from ?? null,
    windowTo: perCoin[0]?.to ?? null,
    warmupDays: WARMUP_DAYS,
    coinsWatched: COINS.map((c) => c.symbol),
    busiestDay,
    nearLowAlerts: near.length,
    totalAlertsFired: fired.length,
    priceDropAlerts: priceDrops.length,
    suppressedByCooldown: summary.suppressedByCooldown,
    suppressedByWeeklyCap: summary.suppressedByWeeklyCap,
    evidenceCommand: "pnpm replay",
    evidenceFile: "docs/evidence/replay.json",
  };
  writeFileSync("apps/web/lib/replay-summary.json", JSON.stringify(webSummary, null, 2) + "\n");

  console.log(`Replayed ${perCoin.map((c) => `${c.symbol} (${c.days}d)`).join(", ")}`);
  console.log(`Total alerts fired: ${fired.length} (price drop: ${priceDrops.length})`);
  console.log(`Suppressed by cooldown: ${summary.suppressedByCooldown}, by weekly cap: ${summary.suppressedByWeeklyCap}`);
  console.log(`Median 7-day forward return after a price-drop alert: ${median === null ? "n/a" : `${median.toFixed(2)}%`}`);
  console.log(`Recovered (>=0%) within 7 days: ${recovered}/${withForward.length}`);
  console.log("wrote docs/evidence/replay.json");
}

await main();
