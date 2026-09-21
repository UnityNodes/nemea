import { mkdirSync, writeFileSync } from "node:fs";
import { CmcClient, CmcError, CmcPlanError, DESIRED_CADENCE, planCadence } from "@nemea/cmc-client";
import { categoryFor } from "@nemea/alerts";
import { report, requireEnv, type Check } from "./lib.ts";

const { CMC_API_KEY } = requireEnv("Gate A", ["CMC_API_KEY"]);
const client = new CmcClient({ apiKey: CMC_API_KEY, baseUrl: process.env.CMC_BASE_URL });
const checks: Check[] = [];
const argv = new Set(process.argv.slice(2));

const WATCHED_STABLES: Array<[number, string]> = [
  [825, "USDT"],
  [3408, "USDC"],
  [4943, "DAI"],
  [29470, "USDE"],
];
const CORE: Array<[number, string]> = [
  [1, "BTC"],
  [1027, "ETH"],
  [3408, "USDC"],
];

async function step<T>(name: string, run: () => Promise<{ value: T; detail: string; ok?: boolean }>, planRestrictedIsOk = false): Promise<T | null> {
  try {
    const { value, detail, ok = true } = await run();
    checks.push({ name, status: ok ? "pass" : "fail", detail });
    return value;
  } catch (error) {
    if (error instanceof CmcPlanError && planRestrictedIsOk) {
      checks.push({ name, status: "not-run", detail: `plan-restricted: ${error.message}` });
      return null;
    }
    const kind = error instanceof CmcError ? error.constructor.name : "Error";
    checks.push({ name, status: "fail", detail: `${kind}: ${error instanceof Error ? error.message : String(error)}` });
    return null;
  }
}

const keyInfo = await step("key info (plan, rate limit, credits)", async () => {
  const info = await client.getKeyInfo();
  const detail = `credit limit ${info.creditLimitMonthly ?? "unknown"}/month, rate limit ${info.rateLimitPerMinute ?? "unknown"}/min, used this month ${info.creditsUsedMonth ?? "unknown"}, today ${info.creditsUsedToday ?? "unknown"}`;
  return { value: info, detail, ok: info.creditLimitMonthly !== null };
});
if (keyInfo?.rateLimitPerMinute) client.setRequestsPerMinute(keyInfo.rateLimitPerMinute);

await step("polling budget fits this plan", async () => {
  const workload = { stablecoinIds: WATCHED_STABLES.map(([id]) => id), topIds: [1, 1027, 5426, 825], smallIds: [7083, 4943, 12345, 2010, 52] };
  const plan = planCadence(keyInfo?.creditLimitMonthly ?? null, workload);
  const desired = `desired: depeg ${DESIRED_CADENCE.stablecoinsSec}s, top ${DESIRED_CADENCE.topSec}s, small ${DESIRED_CADENCE.smallSec}s, global ${DESIRED_CADENCE.globalSec}s`;
  const actual = `planned: depeg ${plan.cadence.stablecoinsSec}s, top ${plan.cadence.topSec}s, small ${plan.cadence.smallSec}s, global ${plan.cadence.globalSec}s, ~${plan.estimatedCreditsPerMonth} credits/month (${plan.verdict}, x${plan.multiplier})`;
  return { value: plan, detail: `${desired} | ${actual}`, ok: plan.verdict === "fits" || plan.verdict === "stretched" };
});

const core = await step("quotes for BTC, ETH, USDC", async () => {
  const { quotes, missing } = await client.getQuotes(CORE.map(([id]) => id));
  const rows = quotes.map((q) => `${q.symbol} $${q.priceUsd} (1h ${q.percentChange1h}%, 24h ${q.percentChange24h}%, vol chg ${q.volumeChange24hPct}%)`);
  const symbolsOk = CORE.every(([id, symbol]) => quotes.find((q) => q.cmcId === id)?.symbol === symbol);
  const pricesOk = quotes.every((q) => q.priceUsd !== null && q.priceUsd > 0);
  return { value: quotes, detail: `${rows.join(" | ")}${missing.length ? ` | MISSING ${missing.join(",")}` : ""}`, ok: symbolsOk && pricesOk && missing.length === 0 };
});

await step("watched stablecoin ids resolve to the expected symbols", async () => {
  const { quotes, missing } = await client.getQuotes(WATCHED_STABLES.map(([id]) => id));
  const wrong = WATCHED_STABLES.filter(([id, symbol]) => quotes.find((q) => q.cmcId === id)?.symbol.toUpperCase() !== symbol).map(([id, s]) => `${id}!=${s}`);
  const detail = quotes.map((q) => `${q.symbol} $${q.priceUsd}`).join(" | ");
  return { value: quotes, detail: `${detail}${wrong.length ? ` | WRONG: ${wrong.join(",")}` : ""}${missing.length ? ` | MISSING ${missing.join(",")}` : ""}`, ok: wrong.length === 0 && missing.length === 0 };
});

const freshness = core?.map((q) => (q.cmcLastUpdated ? Math.round((Date.now() - Date.parse(q.cmcLastUpdated)) / 1000) : null));
await step("quote data is fresh (last_updated within 10 minutes)", async () => ({
  value: freshness,
  detail: `ages in seconds: ${freshness?.join(", ") ?? "n/a"}`,
  ok: !!freshness && freshness.every((age) => age !== null && age >= -60 && age < 600),
}));

await step("global metrics", async () => {
  const g = await client.getGlobalMetrics();
  return {
    value: g,
    detail: `BTC dominance ${g.btcDominance}, market cap 24h change ${g.totalMarketCapChange24hPct}%, stablecoin volume ${g.stablecoinVolume24hUsd ?? "not exposed"}`,
    ok: g.btcDominance !== null && g.totalMarketCapChange24hPct !== null,
  };
});

const categories = await step("categories (avg_price_change per group)", async () => {
  const cats = await client.getCategories();
  const withChange = cats.filter((c) => c.avgPriceChange24hPct !== null).length;
  return { value: cats, detail: `${cats.length} categories, ${withChange} with a 24h average`, ok: cats.length > 20 && withChange / cats.length > 0.8 };
});

const infos = await step("info by id: tags and per-chain contract addresses", async () => {
  const metas = await client.getInfoByIds([1027, 3408]);
  const usdc = metas.find((m) => m.cmcId === 3408);
  const chains = usdc?.contracts.map((c) => c.chain).sort() ?? [];
  const detail = `USDC tags [${usdc?.tags.slice(0, 5).join(", ")}], stablecoin=${usdc?.isStablecoin}, contracts on ${chains.join(", ") || "none"}`;
  return { value: metas, detail, ok: !!usdc?.isStablecoin && ["arbitrum", "base", "ethereum"].every((c) => chains.includes(c as never)) };
});

await step("info by contract address (Ethereum USDC)", async () => {
  const metas = await client.getInfoByAddresses(["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"]);
  const hit = metas.find((m) => m.contracts.some((c) => c.chain === "ethereum" && c.address === "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"));
  return { value: metas, detail: hit ? `${hit.symbol} (id ${hit.cmcId})` : `no match among ${metas.map((m) => `${m.symbol}#${m.cmcId}`).join(", ") || "nothing"}`, ok: hit?.cmcId === 3408 };
});

if (categories && infos) {
  await step("token tags map to a CMC category (used for 'because Layer 1 is down X%')", async () => {
    const eth = infos.find((m) => m.cmcId === 1027);
    const matched = categoryFor(eth, categories);
    return { value: matched, detail: `ETH tags [${eth?.tags.join(", ")}] -> ${matched ? `${matched.name} (${matched.avgPriceChange24hPct}%)` : "no category matched"}`, ok: matched !== null };
  });
}

await step(
  "historical quotes (30 days, daily)",
  async () => {
    const points = await client.getHistorical(1, { days: 30, interval: "daily" });
    return { value: points, detail: `${points.length} daily points, first ${points[0]?.ts ?? "n/a"}, last ${points.at(-1)?.ts ?? "n/a"}`, ok: points.length >= 25 };
  },
  true,
);

await step(
  "price low for BTC (all-time via price-performance-stats, else 365-day window)",
  async () => {
    const low = await client.getPriceLow(1);
    return { value: low, detail: low ? `${low.scope} low $${low.lowUsd}${low.windowDays ? ` over ${low.windowDays}d` : ""}` : "no data", ok: low !== null };
  },
  true,
);

if (argv.has("--burst") && keyInfo?.rateLimitPerMinute) {
  const limit = keyInfo.rateLimitPerMinute;
  await step(`rate limit really enforced at ${limit}/min (sends ${limit + 5} raw key/info calls)`, async () => {
    const statuses: number[] = [];
    for (let i = 0; i < limit + 5; i++) {
      const res = await fetch("https://pro-api.coinmarketcap.com/v1/key/info", { headers: { "X-CMC_PRO_API_KEY": CMC_API_KEY }, signal: AbortSignal.timeout(15000) });
      statuses.push(res.status);
    }
    const first429 = statuses.indexOf(429);
    return { value: statuses, detail: first429 === -1 ? `no 429 in ${statuses.length} calls` : `first 429 on call ${first429 + 1}`, ok: first429 !== -1 };
  });
}

const receipts = client.recentReceipts(50).reverse();
const clean = checks.every((c) => c.status !== "fail");
if (clean) {
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(
    "docs/evidence/gate-a-cmc.json",
    JSON.stringify({ ranAt: new Date().toISOString(), plan: keyInfo, stats: client.stats().counters, receipts }, null, 2) + "\n",
  );
  console.log(`\nwrote docs/evidence/gate-a-cmc.json (${receipts.length} real API calls, credits spent this run: ${client.stats().counters.creditsSpent})`);
} else {
  console.log("\nno evidence file written: a failing run is not evidence");
}
for (const r of receipts) console.log(`  ${r.at} ${r.endpoint} -> ${r.httpStatus ?? "no response"} ${r.ok ? "ok" : r.detail} credits=${r.creditCount ?? "-"} ${r.ms}ms`);

report("Gate A", checks);
