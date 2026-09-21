type Coin = {
  id: number;
  symbol: string;
  name: string;
  slug: string;
  rank: number;
  price: number;
  pct1h: number;
  pct24h: number;
  pct7d: number;
  pct30d: number;
  volume: number;
  volumeChange: number;
  marketCap: number;
  tags: string[];
  contracts: Array<{ platform: string; address: string }>;
};

const USDC_CONTRACTS = [
  { platform: "Ethereum", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { platform: "Base", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  { platform: "Arbitrum", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
];
const USDT_CONTRACTS = [
  { platform: "Ethereum", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { platform: "Arbitrum", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
];
const DAI_CONTRACTS = [
  { platform: "Ethereum", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" },
  { platform: "Base", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" },
  { platform: "Arbitrum", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" },
];

function coins(): Coin[] {
  const base = { pct1h: 0.1, pct24h: -0.8, pct7d: 2.1, pct30d: 6.5, volumeChange: 4 };
  return [
    { id: 1, symbol: "BTC", name: "Bitcoin", slug: "bitcoin", rank: 1, price: 62000, volume: 3.1e10, marketCap: 1.22e12, tags: ["mineable", "pow", "store-of-value"], contracts: [], ...base },
    { id: 1027, symbol: "ETH", name: "Ethereum", slug: "ethereum", rank: 2, price: 2650, volume: 1.4e10, marketCap: 3.2e11, tags: ["pos", "smart-contracts", "layer-1"], contracts: [], ...base, pct24h: -1.2 },
    { id: 825, symbol: "USDT", name: "Tether", slug: "tether", rank: 3, price: 0.9998, volume: 6.2e10, marketCap: 1.4e11, tags: ["stablecoin", "asset-backed-stablecoin"], contracts: USDT_CONTRACTS, ...base, pct24h: 0, pct7d: 0, pct30d: 0 },
    { id: 3408, symbol: "USDC", name: "USDC", slug: "usd-coin", rank: 6, price: 0.9999, volume: 8e9, marketCap: 7.4e10, tags: ["stablecoin", "asset-backed-stablecoin", "defi"], contracts: USDC_CONTRACTS, ...base, pct24h: 0, pct7d: 0, pct30d: 0 },
    { id: 4943, symbol: "DAI", name: "Dai", slug: "multi-collateral-dai", rank: 20, price: 1.0001, volume: 3e8, marketCap: 5e9, tags: ["stablecoin", "defi"], contracts: DAI_CONTRACTS, ...base, pct24h: 0, pct7d: 0, pct30d: 0 },
    { id: 29470, symbol: "USDe", name: "Ethena USDe", slug: "ethena-usde", rank: 15, price: 0.9995, volume: 4e8, marketCap: 6e9, tags: ["stablecoin", "defi"], contracts: [], ...base, pct24h: 0, pct7d: 0, pct30d: 0 },
    { id: 5426, symbol: "SOL", name: "Solana", slug: "solana", rank: 5, price: 148, volume: 3.5e9, marketCap: 7e10, tags: ["layer-1", "smart-contracts", "pos"], contracts: [], ...base, pct24h: -2.4 },
    { id: 1975, symbol: "LINK", name: "Chainlink", slug: "chainlink", rank: 14, price: 14.2, volume: 5e8, marketCap: 9e9, tags: ["defi", "oracles", "smart-contracts"], contracts: [{ platform: "Ethereum", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA" }], ...base, pct24h: -1.8 },
  ];
}

export type FakeCmc = {
  fetchImpl: typeof fetch;
  setCoin: (id: number, patch: Partial<Pick<Coin, "price" | "pct1h" | "pct24h" | "volumeChange" | "volume">>) => void;
  setMarket: (changePct: number) => void;
  setCategory: (name: string, avg: number) => void;
  setPlan: (plan: { creditLimitMonthly: number; rateLimitPerMinute: number; historical: boolean; priceStats: boolean }) => void;
  setCreditsUsed: (used: number) => void;
  setHistory: (id: number, prices: number[]) => void;
  failNext: (status: number, errorCode: number, message: string) => void;
  calls: Array<{ path: string; params: Record<string, string> }>;
  now: () => Date;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function createFakeCmc(opts: { now?: () => Date } = {}): FakeCmc {
  const now = opts.now ?? (() => new Date());
  const state = new Map(coins().map((c) => [c.id, c]));
  const categories = new Map<string, number>([["Layer 1", -1.5], ["DeFi", -1.0], ["Stablecoins", 0], ["Oracle", -1.8]]);
  const histories = new Map<number, number[]>();
  const plan = { creditLimitMonthly: 450_000, rateLimitPerMinute: 600, historical: true, priceStats: false };
  let marketChange = -1.1;
  let creditsUsed = 0;
  let fail: { status: number; errorCode: number; message: string } | null = null;
  const calls: FakeCmc["calls"] = [];

  const status = (credits = 1, errorCode = 0, message: string | null = null) => ({ timestamp: now().toISOString(), error_code: errorCode, error_message: message, elapsed: 3, credit_count: credits });

  function history(id: number): number[] {
    const set = histories.get(id);
    if (set) return set;
    const coin = state.get(id);
    const anchor = coin?.price ?? 100;
    const stable = coin?.tags.includes("stablecoin") ?? false;
    const out: number[] = [];
    let seed = id * 9301 + 49297;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    let p = anchor * (stable ? 1 : 0.8);
    for (let i = 0; i < 365; i++) {
      p = stable ? 1 + (rnd() - 0.5) * 0.002 : Math.max(anchor * 0.3, p * (1 + (rnd() - 0.48) * 0.04));
      if (!stable && (i === 120 || i === 250)) p *= 0.82;
      out.push(p);
    }
    if (stable && id === 3408) {
      out[200] = 0.97;
      out[201] = 0.96;
      out[202] = 0.985;
    }
    out[364] = anchor;
    histories.set(id, out);
    return out;
  }

  const entry = (c: Coin) => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol,
    slug: c.slug,
    cmc_rank: c.rank,
    last_updated: now().toISOString(),
    quote: [
      {
        id: 2781,
        symbol: "USD",
        price: c.price,
        volume_24h: c.volume,
        volume_change_24h: c.volumeChange,
        percent_change_1h: c.pct1h,
        percent_change_24h: c.pct24h,
        percent_change_7d: c.pct7d,
        percent_change_30d: c.pct30d,
        market_cap: c.marketCap,
        last_updated: now().toISOString(),
      },
    ],
  });

  const infoEntry = (c: Coin) => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol,
    slug: c.slug,
    category: c.contracts.length > 0 || c.tags.includes("stablecoin") ? "token" : "coin",
    tags: c.tags,
    date_added: "2013-04-28T00:00:00.000Z",
    contract_address: c.contracts.map((k) => ({ contract_address: k.address, platform: { name: k.platform } })),
  });

  const fetchImpl = (async (input: URL | string) => {
    const url = input instanceof URL ? input : new URL(input);
    const params = Object.fromEntries(url.searchParams.entries());
    calls.push({ path: url.pathname, params });
    if (fail) {
      const f = fail;
      fail = null;
      return json({ status: status(0, f.errorCode, f.message) }, f.status);
    }
    const ids = (params.id ?? "").split(",").filter(Boolean).map(Number);
    switch (url.pathname) {
      case "/v1/key/info":
        return json({ status: status(0), data: { plan: { credit_limit_monthly: plan.creditLimitMonthly, rate_limit_minute: plan.rateLimitPerMinute }, usage: { current_month: { credits_used: creditsUsed, credits_left: plan.creditLimitMonthly - creditsUsed }, current_day: { credits_used: 0 } } } });
      case "/v3/cryptocurrency/quotes/latest":
        return json({ status: status(), data: ids.map((id) => state.get(id)).filter((c): c is Coin => !!c).map(entry) });
      case "/v2/cryptocurrency/info": {
        let found: Coin[] = [];
        if (params.id) found = ids.map((id) => state.get(id)).filter((c): c is Coin => !!c);
        else if (params.symbol) found = [...state.values()].filter((c) => c.symbol.toUpperCase() === params.symbol?.toUpperCase());
        else if (params.address) {
          const wanted = new Set(params.address.split(",").map((a) => a.toLowerCase()));
          found = [...state.values()].filter((c) => c.contracts.some((k) => wanted.has(k.address.toLowerCase())));
        }
        return json({ status: status(), data: Object.fromEntries(found.map((c) => [String(c.id), infoEntry(c)])) });
      }
      case "/v1/global-metrics/quotes/latest":
        return json({ status: status(), data: { btc_dominance: 58.2, eth_dominance: 11.4, last_updated: now().toISOString(), quote: { USD: { total_market_cap: 2.9e12, total_market_cap_yesterday_percentage_change: marketChange, total_volume_24h: 1.1e11, stablecoin_volume_24h: 9e10, stablecoin_market_cap: 3.1e11 } } } });
      case "/v1/cryptocurrency/categories":
        return json({ status: status(), data: [...categories.entries()].map(([name, avg], i) => ({ id: `cat${i}`, name, avg_price_change: avg, market_cap_change: avg, volume_change: 5, num_tokens: 100, last_updated: now().toISOString() })) });
      case "/v3/cryptocurrency/quotes/historical": {
        if (!plan.historical) return json({ status: status(0, 1006, "Your API Key subscription plan doesn't support this endpoint.") }, 403);
        const id = ids[0] as number;
        const prices = history(id);
        const t0 = now().getTime() - prices.length * 86400_000;
        return json({ status: status(4), data: { [String(id)]: { id, quotes: prices.map((p, i) => ({ timestamp: new Date(t0 + i * 86400_000).toISOString(), quote: { USD: { price: p, timestamp: new Date(t0 + i * 86400_000).toISOString() } } })) } } });
      }
      case "/v2/cryptocurrency/price-performance-stats/latest": {
        if (!plan.priceStats) return json({ status: status(0, 1006, "Your API Key subscription plan doesn't support this endpoint.") }, 403);
        const id = ids[0] as number;
        const low = Math.min(...history(id));
        return json({ status: status(), data: { [String(id)]: { id, periods: { all_time: { quote: { USD: { low, low_timestamp: "2020-03-13T00:00:00.000Z" } } } } } } });
      }
      default:
        return json({ status: status(0, 400, `fake CMC has no ${url.pathname}`) }, 404);
    }
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    now,
    setCoin: (id, patch) => {
      const c = state.get(id);
      if (c) Object.assign(c, patch);
    },
    setMarket: (v) => {
      marketChange = v;
    },
    setCategory: (name, avg) => {
      categories.set(name, avg);
    },
    setPlan: (p) => Object.assign(plan, p),
    setCreditsUsed: (used) => {
      creditsUsed = used;
    },
    setHistory: (id, prices) => {
      histories.set(id, prices);
    },
    failNext: (status, errorCode, message) => {
      fail = { status, errorCode, message };
    },
  };
}
