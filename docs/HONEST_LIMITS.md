# Honest limits

Every claim here has a command or a test next to it. If a claim cannot be checked, it is not made.

## 1. CoinMarketCap rate limits and credits

CoinMarketCap meters by credits per month and requests per minute. On the plans listed on CoinMarketCap's pricing page when this was written (2026-09-21):

| Plan | Credits / month | Requests / minute |
|---|---|---|
| Basic (free) | 15,000 | 50 |
| Builder | 150,000 | 300 |
| Startup | 450,000 | 600 |

Nemea does **not** hardcode those numbers. At start-up and every hour it reads `/v1/key/info` and plans its polling from what the key actually allows (`packages/cmc-client/src/budget.ts`).

The product spec asks for a one-minute stablecoin check. That costs about 43,200 calls a month before anything else, so the free plan cannot do it. What Nemea does instead, for a small portfolio (`pnpm tsx scripts/print-cadence.ts`):

| Plan | Depeg check | Top holdings | Small holdings | Global | Est. credits/month | Verdict |
|---|---|---|---|---|---|---|
| Basic (free) | every 4 min | every 4 min | every 4 min | every 60 min | 11,880 | stretched |
| Builder | every 1 min | every 1 min | every 1 min | every 15 min | 47,520 | fits |
| Startup | every 1 min | every 1 min | every 1 min | every 15 min | 47,520 | fits |

- One quotes call covers up to 100 coins for one credit, so every held coin rides along on the depeg poll for free. The spec's tiers (top holdings every 5 minutes, small every 30) only save credits once there are more than 100 distinct coins across all users; below that the planner polls everything at the depeg cadence, and above it the tiers apply. `pnpm cadence` prints the table for a small workload.
- "Stale" is measured against the plan: a quote is stale when it is older than twice the slowest quote cadence (never less than 30 minutes).
- 15% of the budget is held back for on-demand calls (token lookup, history for Explain, wallet import).
- When CoinMarketCap answers with a daily or monthly quota error, polling pauses for 30 minutes and `/status` says so.
- On-demand calls a visitor can trigger are capped so a burst of visitors cannot burn the credit budget: token lookups 600 per hour, Explain 300 per hour, wallet imports 120 per hour across everyone, plus per-user caps. When a cap is hit the user sees a "too many requests" message (`apps/api/test/api.test.ts`, "credit protection").
- Every real CoinMarketCap call is logged with time, endpoint, HTTP status, credits and latency, and shown on `/status`.
- Cached: quotes 45 s, global 60 s, categories 5 min, metadata 24 h, history 6 h. Failures are never cached.

Checks: `packages/cmc-client/test/budget.test.ts` (cadence and credit arithmetic), `packages/cmc-client/test/client.test.ts` (error mapping, no failure caching, local limiter), `apps/api/test/api.test.ts` (quota pause, stretched plan on `/status`).

Data gaps that come from the plan, not from a bug:

- **All-time low** exists only in `/v2/cryptocurrency/price-performance-stats/latest`, which CoinMarketCap's pricing matrix does not list for Basic or Builder. Without it Nemea uses the lowest daily close in up to 365 days and labels the alert "365-day low", never "all-time low".
- **Liquidity** (order-book depth) is not in the basic data. "Sudden liquidity drop" is implemented as a volume dry-up while the price falls, and the alert text says it is a proxy.
- **History for Explain** needs the historical endpoint. If the plan or the rate limit blocks it, the explanation says so under "What we couldn't check" and omits the "Has this happened before?" section instead of guessing.
- **Category `last_updated` is not a freshness signal**: measured 2026-09-21, 348 of 359 categories had a `last_updated` older than 30 days while their averages moved minute to minute. Nemea does not use it, and category averages are treated as live.
- **Explain and swap links use a quote only when it is fresh.** A swap target (the stablecoin you would move into) must have a fresh quote that is on peg, and "since the alert" is shown only from a fresh quote.
- **Stale data**: a quote whose CoinMarketCap `last_updated` is older than the stale limit above produces no alert, and the dashboard marks it stale. If any held coin is stale or unpriced, no portfolio-level alert is sent, because a percentage of a partly unknown portfolio would be wrong. The market snapshot and the category list are ignored when Nemea's own poller has not refreshed them for 2 hours.

## 2. Not financial advice

- Every alert record, Telegram message, email and swap suggestion carries the disclaimer from `packages/shared-types/src/alerts.ts`.
- Explain like I'm 5 is built from templates and CoinMarketCap numbers. It never predicts. `packages/alerts/test/explain.test.ts` fails if an explanation contains phrases such as "you should buy", "sell now", "guaranteed" or "will recover".
- A protective action is a link to Uniswap or 1inch. The user reviews price, fees and slippage there and approves in their own wallet. Nemea sends no transaction.
- Alerts are limited so they stay meaningful: at most 3 non-critical alerts per rolling week (configurable 1 to 3), per-alert cooldowns (6 h to 7 days). Critical alerts (a held stablecoin below the depeg floor, a drop of at least twice the user's threshold) bypass the weekly cap, because staying silent during a depeg defeats the product. They have their own cap of 3 per day. Simulated alerts never count against any cap.
- Alert thresholds are rules, not judgement. They will fire on moves that turn out to be nothing and stay quiet on moves that turn out to matter.

## 3. Non-custodial by design

- Nemea reads a wallet by public address only. No private key, seed phrase or signing permission is asked for, stored or transmitted. `pnpm check:claims` scans the source for key-handling identifiers and fails if it finds any.
- Sign-In with Ethereum signs a login message. It does not sign a transaction.
- The Telegram bot detects a message that looks like a seed phrase, deletes it when it can, and warns the sender (`apps/bot/src/safety.ts`).
- Level 3 (auto-swap through a pre-approved agent wallet) is not built. The API rejects it.

## Other limits worth knowing

- **Wallet reading uses Blockscout for every chain**, and Etherscan V2 first on Ethereum and Arbitrum when an `ETHERSCAN_API_KEY` is set. Base is paid-only on Etherscan's free tier (checked 2026-09-21), which is why Blockscout is the default. Blockscout lists thousands of airdrop-spam tokens for a busy wallet, so Nemea only sends tokens with a Blockscout price of at least $1 (largest 60 per chain) to CoinMarketCap, then keeps only tokens CoinMarketCap matches by chain and contract address. A real token with no Blockscout price is skipped and counted in an aggregate line. Blockscout's price is used only as a filter, never displayed.
- **A portfolio holds at most 100 coins**, manual and imported together, because one CoinMarketCap call covers 100 coins per credit. The wallet import lists every matched token with a tick box, orders them from the largest, and ticks as many as fit; the user unticks one to make room for another. Ordering uses Blockscout's price only as a sort key, never shown. Re-importing a wallet replaces its earlier rows, so they do not count against the room.
- **EOA wallets only** for Sign-In with Ethereum.
- **Guest accounts are a cookie.** Clear the cookie and the portfolio is unreachable. Sign in with a wallet to keep it.
- **Single poller.** Run one API instance.
- **Telegram, email and push work only when their keys are configured.** The API and `/me` report what is configured. Nothing pretends.
- **No uptime promise.** "24/7" means the poller runs continuously while the service is deployed and healthy. `/health` and `/status` show whether it is.
- **The simulator is labelled.** "Try an alert" runs the real alert engine on the user's real holdings with a made-up price move. It carries a SIMULATION label in the dashboard, Telegram and Explain.
