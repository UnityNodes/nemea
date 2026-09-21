# Architecture

```
                     ┌────────────────────────────────────────────┐
  browser ──/api/*──▶│ apps/web  (Next.js, rewrites /api → API)   │
                     └───────────────┬────────────────────────────┘
                                     │ same-origin, httpOnly session cookie
                     ┌───────────────▼────────────────────────────┐
  Telegram ◀────────│ apps/api  (Express 5, Drizzle, Postgres)   │◀──── apps/bot (grammY)
  Resend   ◀────────│  routes · poller · evaluator · delivery    │   /internal/* + bearer secret
  Web Push ◀────────│                                            │
                     └──┬───────────────┬──────────────┬─────────┘
                        │               │              │
              @nemea/cmc-client   @nemea/alerts   @nemea/chain-reader
                        │          (pure logic)        │
              CoinMarketCap API                  Blockscout / Etherscan V2
```

## Packages

| Package | Responsibility | Depends on |
|---|---|---|
| `shared-types` | zod schemas and TypeScript types for the domain and the HTTP contract. | none |
| `cmc-client` | CoinMarketCap wrapper: timeouts, typed errors, TTL cache with in-flight coalescing, local rate limiter, call log ("receipts"), credit budget and cadence planner. | shared-types |
| `alerts` | Pure functions. Rules, engine (cooldowns, caps, roll-ups), similar-drop and peg-history analysis, Explain like I'm 5, swap-link builder. No I/O. | shared-types |
| `chain-reader` | Read-only wallet balances across Ethereum, Base, Arbitrum through provider adapters; matches tokens to CoinMarketCap by chain and contract address. | shared-types, cmc-client |

## Apps

| App | Responsibility |
|---|---|
| `api` | Owns the database. Sessions, portfolio, preferences, alerts, channels, internal endpoints for the bot, `/status`. Runs the poller in the same process. |
| `bot` | Inbound Telegram commands only (`/start CODE`, `/status`, `/stop`, `/help`). Sends nothing else: the API sends alerts. Talks to the API over HTTP with a shared secret. |
| `web` | Next.js UI. Never talks to CoinMarketCap or the chain. |

## Data flow for one alert

1. **Poller tick (every 60 s).** `idsDueOnTick` picks the coin ids due on this tick from the stablecoin, top-holding and small-holding lanes, deduped into one `quotes/latest` call per 100 ids. Global metrics and categories are due on their own lanes. Cadence comes from `planCadence` and the key's real limits.
2. **Persist.** Quotes, metadata, global metrics and categories are stored as the latest snapshot. Every quote keeps CoinMarketCap's own `last_updated`.
3. **Evaluate.** Only users holding a refreshed coin are evaluated. `evaluate()` receives holdings, fresh quotes, metadata, categories, global metrics, known lows, the user's preferences and their past alerts. It returns the alerts to emit and every suppression with a reason (`cooldown`, `weekly_cap`, `stale_quote`, `no_data`, `rolled_into_portfolio_alert`).
4. **Store and deliver.** Emitted alerts are stored, then sent to each enabled channel. Each attempt is recorded in `deliveries` as sent, failed or skipped. A blocked Telegram bot unlinks itself.
5. **Explain.** `GET /alerts/:id/explain` re-reads the stored alert context, asks CoinMarketCap for up to 365 daily closes (cached), and builds the explanation. If history is unavailable the reason is shown, not hidden.

## Rules the code holds itself to

- A missing value is `null` all the way to the screen. Nothing falls back to `0` or to a made-up default.
- Only deterministic results are cached. A failed call is retried on the next request.
- Every outbound call has a timeout. The local limiter waits at most 5 s before failing.
- Quotes older than 30 minutes never produce an alert.
- Simulated alerts run through the same engine with modified inputs and are flagged everywhere.

## Security surface

- Session: HS256 JWT in an httpOnly, SameSite=Lax cookie (Secure when the web origin is https), 30 days.
- State-changing requests carrying an `Origin` other than the web origin are refused. The web app reaches the API through a same-origin rewrite.
- Sign-In with Ethereum: single-use nonces (10 min), domain check, signature recovery. EOA wallets only.
- Internal endpoints require a bearer secret compared in constant time.
- Rate limits: guest creation and nonces per IP; lookups, wallet reads, link codes, simulation, explain and email per user.
- Every data route filters by the session user. `apps/api/test/api.test.ts` covers cross-user access.

## Database

Postgres (Neon or Supabase in production, embedded PGlite for local development and tests). Drizzle schema in `apps/api/src/db/schema.ts`, SQL migrations in `apps/api/drizzle`, applied at start-up.

## Deployment shape

Web on Vercel with `API_ORIGIN` pointing at the API. API and bot on Railway (one instance of each). Postgres on Neon or Supabase. The poller lives inside the API process, so the API must run continuously and only once.
