# Nemea

Non-custodial crypto protection dashboard for casual holders. Watches a portfolio with CoinMarketCap data, sends calm alerts, offers optional protective actions through the user's own wallet. Built for the CoinMarketCap API hackathon. Public repo, MIT, English only (code, docs, commits).

## Layout

- `packages/shared-types` zod schemas and the HTTP contract
- `packages/cmc-client` CoinMarketCap wrapper, cache, limiter, receipts, credit budget
- `packages/alerts` pure alert engine, explain, swap links
- `packages/chain-reader` wallet balances, token matching
- `apps/api` Express + Drizzle service, poller, delivery
- `apps/bot` grammY bot, inbound commands only
- `apps/web` Next.js UI
- `scripts/gates` day-1 gates that fail loudly, `scripts/dev-stack.sh` local stack on a fake CMC (development only)
- `docs/` SCOPE, ARCHITECTURE, HONEST_LIMITS, SUBMISSION

## Commands

```bash
pnpm install
pnpm test                 # vitest, all packages and apps
pnpm typecheck
pnpm check:claims         # no key-handling identifiers in source
pnpm cadence              # polling plan per CMC plan
pnpm dev:stack            # fake CMC + API, no keys needed
pnpm gate:a | gate:b | gate:c   # need real keys, exit 2 when not run
pnpm replay               # real alert engine replayed against a real year of CMC history, writes docs/evidence/replay.json
```

## Rules

- No code comments. The only exceptions are docstrings that record a paid-for bug.
- A missing value is `null` end to end. Never `0`, never a made-up default.
- Cache only deterministic results. Never cache a failure.
- Every outbound call has a timeout.
- Anything the docs claim must have a test or a command next to it (`docs/HONEST_LIMITS.md`).
- Never store, request or handle private keys or seed phrases. `pnpm check:claims` enforces the naming.
- A gate or check that examined nothing must not exit 0.
- Do not run `next build` while `next dev` runs from the same directory.
- Simulated alerts are always labelled and never count against caps.

## Known traps

- CMC responses: v3 endpoints return `data` as an array and `quote` as an array; older ones are keyed objects. `packages/cmc-client/src/parse.ts` accepts both.
- CMC info by address can return another chain's `platform.token_address`. Match on `contract_address[]` by (chain, address).
- Etherscan V2 errors are HTTP 200 with `status:"0"`. Base is paid-only there.
- The poller must run once. Two instances can double-alert.
