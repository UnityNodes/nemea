# Nemea

> Heracles walked into the valley of Nemea to kill a lion nobody could wound. He won by not fighting it head on. Nemea does the same for a portfolio: crypto's "invincible" drops are survivable when something is watching for you and tells you calmly what is going on.

Nemea is a **non-custodial protection dashboard for casual crypto holders**. Before an alert reaches you, it asks one question a bare price alert cannot: is this just your coin, or is CoinMarketCap's own category data showing the whole sector down. "Your portfolio dropped 9%, and 64% of that is Smart Contracts falling 8% on average" is a different alert than "ETH is down". Nemea also watches for a stablecoin losing its peg, a volume anomaly and a stale quote, and offers optional protective steps through your own wallet. Every alert has an **Explain like I'm 5** button that turns a panic moment into a learning moment.

**Not a trading bot. Insurance against being offline.** It is not a signal service and not built for people hunting alpha. It is for people who bought crypto and want to keep it.

## Three honest limits

1. **CoinMarketCap rate limits are real.** Nemea reads your key's plan and adapts: for a small portfolio on the free plan the stablecoin peg check runs every 4 minutes, not every minute. `/status` shows the real cadence and every real API call.
2. **Not financial advice.** Every alert carries the disclaimer. Every protective action is a link you approve in your own wallet.
3. **Non-custodial by design.** Nemea reads wallets by public address. It never asks for, stores or handles keys or seed phrases, and `pnpm check:claims` fails the build if source code starts to.

Details, numbers and the command that checks each claim: [docs/HONEST_LIMITS.md](docs/HONEST_LIMITS.md).

## Try it

Live demo: https://nemea.unitynodes.com. Demo account: none needed. Press **Start as guest**, then **Load a sample portfolio**, then **Try an alert**.

### Run it locally

Prerequisites: Node 22+, pnpm 10.

```bash
pnpm install
pnpm dev:stack        # API on :4000 on a fake CoinMarketCap (development only, NOT real market data)
pnpm dev:web          # web on :3000
```

Open http://localhost:3000, press **Start as guest**, **Load a sample portfolio**, then **Try an alert** and **Explain like I'm 5**. If port 3000 is taken, run the web app on another port and start the stack with `WEB_ORIGIN=http://localhost:<port> pnpm dev:stack`; the API refuses requests from any other origin.

Measured on 2026-09-21 from a fresh `git clone` with a warm pnpm cache: `pnpm install --frozen-lockfile` 3 s, web app ready 11 s, and the whole journey (guest, sample portfolio, simulated alert, Explain, swap link) 1.6 s over HTTP. A cold install takes longer; time it on your own machine before trusting "under 5 minutes".

With real keys, copy `.env.example` to `.env`, fill it in, and run `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:bot`. Then check that your keys work with the gates:

```bash
pnpm gate:a   # CoinMarketCap: plan, quotes, global, categories, history, budget
pnpm gate:b   # wallet read on Ethereum, Base, Arbitrum and CMC matching
pnpm gate:c   # Telegram: send a test message
pnpm replay   # replay the real alert engine against a real year of CoinMarketCap history
```

A gate that could not run exits 2. A gate that examined nothing never exits 0.

## What it watches

| Alert | Fires when | Default | Data |
|---|---|---|---|
| Price drop | a held coin falls more than X% in 1 h or 24 h | 8% / 15% | quotes `percent_change_1h`, `percent_change_24h` |
| Below cost basis | price crossed below what you paid within the last day | if you entered a cost basis | quotes |
| Near low | price within X% of the all-time low (or the 365-day low when the plan has no all-time low, labelled as such) | 10% | price-performance-stats or historical |
| Stablecoin depeg | a held USDT, USDC, DAI or USDe trades below the floor | $0.98 | quotes |
| Stablecoin volume | volume at least 10x the previous day | 10x | quotes `volume_change_24h` |
| Volume spike | volume at least 5x the previous day | 5x | quotes |
| Volume dry-up | volume down 70% while the price falls (a proxy for thin liquidity) | 70% | quotes |
| Category rotation | a category you hold falls X% and at least 5 points worse than the market | 10% | categories, global metrics |
| Portfolio drop | portfolio down X% in 24 h, with a breakdown by category ("because Layer 1 is down 18%") | 10% | quotes, info tags, categories |

Alert fatigue is a design constraint: at most 3 non-critical alerts a week (you can lower it), cooldowns per alert, a roll-up so one crash is one alert, and no alert at all on stale or missing data.

**Delivery:** web dashboard, Telegram, email (critical immediately, everything else in one daily digest), browser push. **Protection levels:** 1 alert only (default), 2 alert plus swap links for Uniswap and 1inch that you approve in your own wallet. Level 3 (auto-swap) is not built.

## CoinMarketCap endpoints used

| Endpoint | Used for | When |
|---|---|---|
| `/v3/cryptocurrency/quotes/latest` | prices, 1 h / 24 h / 7 d / 30 d change, volume and volume change | every minute on a large plan (every 4 minutes on the free plan), batched to 100 coins per call |
| `/v3/cryptocurrency/quotes/historical` | "similar drops recovered in X days", peg history, 365-day low | on demand (Explain), cached 6 h |
| `/v1/global-metrics/quotes/latest` | market-wide move, dominance | every 15 min on a large plan |
| `/v2/cryptocurrency/info` | tags with groups, contract addresses per chain (wallet tokens are looked up by symbol, then matched by exact chain and contract address) | once per coin, then stored; once per wallet import |
| `/v1/cryptocurrency/categories` | category averages for "because Layer 1 is down X%" and rotation | every 30 min on a large plan |
| `/v2/cryptocurrency/price-performance-stats/latest` | all-time low, when the plan allows | in the background for your largest holdings, cached 24 h; falls back to historical when the plan does not allow it |
| `/v1/key/info` | plan limits, so the polling budget is computed, not assumed | at start and hourly |

The `/status` page lists the last real calls with time, endpoint, HTTP status, credits and latency.

### One real call, code and response

Every number in Nemea comes from calls like this one, sent by `packages/cmc-client/src/client.ts`. Captured by `pnpm gate:a` on 2026-09-21 with a Basic key (the key is redacted in the file). Bitcoin, Ethereum and USDC in one request cost 1 credit.

```bash
curl -s "https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest?id=1,1027,3408&convert=USD" \
  -H "X-CMC_PRO_API_KEY: $CMC_API_KEY"
```

```ts
const client = new CmcClient({ apiKey: process.env.CMC_API_KEY });
const { quotes, missing } = await client.getQuotes([1, 1027, 3408]);
```

The response, trimmed to Bitcoin and to the fields Nemea reads (the full body with all three coins is in [`docs/evidence/gate-a-sample-call.json`](docs/evidence/gate-a-sample-call.json), the receipts of all 10 calls of the run in [`docs/evidence/gate-a-cmc.json`](docs/evidence/gate-a-cmc.json)):

```json
{
  "status": {
    "timestamp": "2026-09-21T17:36:24.903Z",
    "error_code": "0",
    "error_message": "",
    "elapsed": 4,
    "credit_count": 1
  },
  "data": [
    {
      "id": 1,
      "name": "Bitcoin",
      "symbol": "BTC",
      "cmc_rank": 1,
      "last_updated": "2026-09-21T17:35:00.000Z",
      "quote": [
        {
          "symbol": "USD",
          "price": 85884.0831679611,
          "volume_24h": 51534296437.904594,
          "volume_change_24h": 142.2458,
          "percent_change_1h": 0.17164259,
          "percent_change_24h": 5.68945324,
          "percent_change_7d": 9.03108265,
          "market_cap": 1725200471304.2444,
          "last_updated": "2026-09-21T17:35:00.000Z"
        }
      ]
    }
  ]
}
```

## Screenshots

TODO(owner): captured from a stack on real CoinMarketCap data with `CONFIRM_REAL_DATA=1 BASE_URL=<url> node apps/web/scripts/screenshots.mjs`. Dashboard, Telegram alert, Explain like I'm 5.

## Tested against a real year of history

Every demo alert in this README and on the live site can be a simulation, labelled as one. To show the rule engine actually holds up, `pnpm replay` runs the unmodified production engine (`packages/alerts`) against a real year of CoinMarketCap daily closes for BTC, ETH, SOL, DOGE and USDC (2025-09-24 to 2026-09-22), one coin at a time, with the same caps and cooldowns a live portfolio gets. Full method, every date fixed to a UTC calendar day for reproducibility, and all 94 alerts: [`docs/evidence/replay.json`](docs/evidence/replay.json). The same numbers are on the live site: [nemea.unitynodes.com/status](https://nemea.unitynodes.com/status), under "Tested against a real year of history".

The worst day in the window was 2025-10-11. BTC fell 7.2%, ETH 12.2%, SOL 14.6%, DOGE 22.3%. Only DOGE crossed the default 15% threshold, and only DOGE got an alert. That is the point of thresholds: three real double-digit drops that day correctly stayed quiet.

Over the year, the engine would have sent 94 alerts (1 price drop, 93 near-a-low notices) and held back 396 more with cooldowns alone, no weekly cap needed. Naive daily checking without cooldowns would have been roughly 5 times noisier.

This is a measurement of the shipped engine on real prices, not a backtest of a trading strategy: recovery after an alert is not the point and is not claimed anywhere. `depeg` and `price_drop_1h` cannot be exercised this way (no hourly bars that far back on this plan, no volume in `quotes/historical`); `portfolio_drop` and `category_rotation` need a real multi-coin portfolio and category data, not a single-coin replay.

## Why not just...

- **...a price alert?** A price alert is one number crossing one line for one coin. Nemea builds each alert from your holdings: it knows a stablecoin should be worth $1, that your portfolio fell mostly because one category fell, and that a quote is stale. It also tells you when *not* to worry, using the coin's own history.
- **...a portfolio tracker?** A tracker shows you what you have. Nemea is silent until something matters and then explains it.
- **...a trading bot or signal service?** They add risk and demand attention. Nemea never trades, never predicts, and never touches your funds.
- **...checking the app more often?** Nemea is for the moments you are offline.

## What CoinMarketCap made possible

- **Watching a whole portfolio for a few credits.** `quotes/latest` takes 100 coins per call and returns price, 1 h / 24 h / 7 d / 30 d change and volume change together, so a portfolio check is one credit, not one per coin.
- **Peg and volume rules without a market feed of our own.** Stablecoin price and `volume_change_24h` from the same call are enough for the depeg and volume-anomaly alerts.
- **Context for a move.** The categories endpoint has a live 24 h average per category (360 of 360 had one on 2026-09-21; Ethereum mapped to Smart Contracts at +4.4%), which is what lets an alert say "the whole category moved" instead of a bare number.
- **Wallet import that matches the right token.** `info` returns a contract address per chain, so a token found in a wallet is matched by exact chain and address, not by a ticker that anyone can copy.
- **A polling budget that is computed.** `/v1/key/info` returns the plan limits, so the cadence is planned from the real credits and the `/status` page shows it.

## Where CoinMarketCap got in the way

Real friction from building this, so the next builder does not lose the time:

- **Endpoint versions.** v1 and v2 `quotes/latest` and `quotes/historical` are deprecated; v3 returns `data` and `quote` as arrays, older versions return keyed objects. The parser accepts both.
- **The free plan cannot support a one-minute peg check.** 15,000 credits a month against roughly 43,200 minute-polls. Cadence is planned from `/v1/key/info` and shown honestly.
- **No all-time low in quotes.** It exists only in `price-performance-stats`, which the pricing matrix does not list for Basic or Builder. Nemea falls back to a labelled 365-day low.
- **Info by contract address** can return another chain's `platform.token_address`; wallet tokens are matched on `contract_address[]` by chain and address instead.
- **No liquidity or order-book data** in the basic data, so "sudden liquidity drop" is a volume dry-up proxy and says so.
- **`info` by contract address is fragile.** Any unknown address in a batch makes the whole call HTTP 500 even with `skip_invalid=true`, and checksum-cased addresses return 400 or 500. Wallet tokens are matched through `info?symbol=` (unknown symbols return an empty list) and then by exact chain and contract address.
- **Invalid ids in `quotes/latest` are silently omitted**, but a request where every id is invalid is HTTP 400 with `credit_count` 0. `status.error_code` is a string on some endpoints and a number on others.
- **Tags are not ordered by relevance.** Bitcoin's first tag that matches a category is an investor portfolio bucket ("Coinbase Ventures Portfolio"), Chainlink's is "Cosmos Ecosystem". About 65 of the 359 categories are investor, regulatory or estate buckets and most `*-ecosystem` categories are platforms, so Nemea uses `tag-groups`, drops those, and explains a move through a thematic category (captured fixture and test: `packages/alerts/test/categories.test.ts`).
- **Category timestamps.** `last_updated` on categories is a metadata date (348 of 359 are older than 30 days) while the averages are live, so it cannot be used as a freshness check. Nemea does not use it.

## Roadmap

- Native mobile app
- More chains
- DEX-native protection (protective swaps inside the DEX instead of a link)
- Level 3 auto-swap through a pre-approved agent wallet, opt-in
- Smart-contract wallet sign-in
- Referral links once partner IDs exist

## Repository

```
apps/api       Express + Drizzle service, poller, delivery
apps/bot       Telegram bot (grammY)
apps/web       Next.js dashboard
packages/      shared-types, cmc-client, alerts, chain-reader
docs/          SCOPE, ARCHITECTURE, HONEST_LIMITS, DEPLOY, SUBMISSION
scripts/       gates, dev stack, claims check
```

More: [architecture](docs/ARCHITECTURE.md), [scope and what was cut](docs/SCOPE.md), [deploy](docs/DEPLOY.md).

## Verification status

Status on 2026-09-22. "Not run" means exactly that.

| Claim | How it is checked | Status |
|---|---|---|
| Alert engine, cadence maths, CoinMarketCap client, API, bot, wallet reader, web helpers | `pnpm test` | 533 tests pass |
| Types | `pnpm typecheck` | passes in every package |
| No key handling in source | `pnpm check:claims` | passes (137 source files) |
| Fresh clone to first alert | clone, install, start, walk (see above) | verified |
| UI at 1280 px and 390 px | Playwright walk of the whole journey against the dev stack | verified on development data |
| Blockscout wallet read on Ethereum, Base, Arbitrum | live run on a public wallet | verified |
| Etherscan V2 free tier covers Ethereum and Arbitrum, not Base | live probe | verified |
| CoinMarketCap response shapes and error codes | CoinMarketCap docs and keyless live responses, captured fixtures in tests | verified against docs and keyless responses |
| Real CoinMarketCap calls with an API key | `pnpm gate:a` | **passed 2026-09-21** on a Basic key (15,000 credits/month, 50 requests/minute): 10 real calls, 11 credits, receipts in `docs/evidence/gate-a-cmc.json`, raw request and response in `docs/evidence/gate-a-sample-call.json` |
| Telegram delivery | `pnpm gate:c` | **passed 2026-09-21** with a real bot: token accepted, test message accepted by Telegram (message id returned) and confirmed on the owner's phone, and an over-limit message is rejected as expected. No evidence file is committed because it would contain a chat id. The link-code flow between the web app and the bot is covered by tests, not yet exercised end to end against the real bot |
| The shipped alert engine, replayed on a real year of CoinMarketCap history | `pnpm replay` | **run 2026-09-22**: 94 alerts over 2025-09-24 to 2026-09-22 on BTC/ETH/SOL/DOGE/USDC, 396 more correctly held back by cooldown, evidence in `docs/evidence/replay.json` |
| Wallet import matched against real CoinMarketCap | `pnpm gate:b` | **passed 2026-09-21** on a public wallet: 78 tokens matched by chain and contract address across Ethereum, Base and Arbitrum, native ETH on all three, unmatched tokens skipped with a reason, evidence in `docs/evidence/gate-b-wallet.json` |
| Email and browser push | tests with stubs | **not verified** against Resend or a real push service |
| Deployed on the Unity Nodes server behind Cloudflare | `docs/DEPLOY.md`; `curl https://nemea.unitynodes.com/api/health`; each service survives `kill -9` | **live since 2026-09-21**; the live journey (guest, sample portfolio, simulated alert, Explain, swap links) was walked over https |

The gates write `docs/evidence/*.json` on a clean run. Commit those files and this table can change from "not run" to a link.

## Licence

MIT. Built by Unity Nodes.
