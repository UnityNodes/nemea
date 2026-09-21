# Deploy

Two recipes. **Own server** is what is running at https://nemea.unitynodes.com (deployed 2026-09-21). **Vercel and Railway** is the original plan from the spec and has not been deployed from this repository.

## Own server (what is live)

Behind Cloudflare, Caddy and systemd on the Unity Nodes box, as the sibling projects are.

| Piece | How |
|---|---|
| Postgres | Docker container `nemea-postgres` (`postgres:16-alpine`), volume `nemea-pgdata`, published on `127.0.0.1:5440` only, `restart unless-stopped` |
| API and poller | `nemea-api.service`, `127.0.0.1:4090`, runs `apps/api/src/index.ts` with tsx |
| Bot | `nemea-bot.service`, health on `127.0.0.1:4190`, runs `apps/bot/src/index.ts` |
| Web | `nemea-web.service`, `next start` on `127.0.0.1:3090`; the API address is baked into the build (`API_ORIGIN=http://127.0.0.1:4090 pnpm --filter @nemea/web build`) |
| Units | `User=claude`, `Restart=on-failure`, the same hardening as `tessera-web.service`. Each service was killed with `kill -9` once and came back. |
| Caddy | site block `nemea.unitynodes.com` with the Cloudflare origin certificate, `nextjs_headers`, no-cache on documents, `reverse_proxy localhost:3090` |
| Env | `/root/nemea/.env.production` (git-ignored, mode 600), read with `--env-file`. `PORT` comes from each unit. |
| Backups | `scripts/backup-db.sh` from cron at 03:15 to `~/backups/nemea`, 14 days kept, restore drill passed (11 of 11 tables). No off-box copy yet. |

Things that would have gone wrong, and the setting that prevents them:

- **Services must not listen on all interfaces.** With `ufw` off, `0.0.0.0` made the API reachable from the internet. The units set `HOST=127.0.0.1`.
- **Behind Cloudflare the API sees Cloudflare's address, not the client's**, and Caddy overwrites `X-Forwarded-For`. Caddy copies `CF-Connecting-IP` into `X-Real-Client-IP`, the API reads it (`CLIENT_IP_HEADER=x-real-client-ip`), and per-IP limits then work per visitor. Without this, every visitor behind one Cloudflare edge shares the 20-guests-per-hour limit.
- **The origin only answers Cloudflare.** The Caddy block returns 403 to any address outside Cloudflare's published ranges (`/ips-v4`, `/ips-v6`, fetched 2026-09-21), so nobody can bypass Cloudflare and forge `CF-Connecting-IP`. If Cloudflare adds ranges, refresh the list.
- **Do not run `next dev` and `next build` from the same directory.**
- **One bot per token.** A second process polling the same token (a laptop, a second server) steals updates.

Redeploy after a code change: `pnpm install --frozen-lockfile`, rebuild the web app with the command above, `sudo systemctl restart nemea-api nemea-bot nemea-web`, then `curl https://nemea.unitynodes.com/api/health`.

## Vercel and Railway (from the spec, not deployed)

Web on Vercel, API and bot on Railway, Postgres on Neon or Supabase.

## Postgres

Create a database and copy its connection string into `DATABASE_URL` on the API. Migrations run when the API starts.

## API (Railway)

- Root directory: repository root.
- Install: `pnpm install --frozen-lockfile`
- Start: `pnpm --filter @nemea/api start`
- **One instance only.** The poller runs inside the process; two instances can double-alert.
- Health check path: `/health`

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` (requires `DATABASE_URL`) |
| `PORT` | set by Railway | |
| `DATABASE_URL` | yes | Neon or Supabase connection string |
| `CMC_API_KEY` | yes | |
| `SESSION_SECRET` | yes | 32+ random characters (`openssl rand -hex 32`) |
| `INTERNAL_API_SECRET` | yes | 16+ random characters, shared with the bot |
| `WEB_ORIGIN` | yes | The public https URL of the web app. Used for the origin check, cookies and the Sign-In domain. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | for Telegram | both or neither |
| `ETHERSCAN_API_KEY` | optional | Blockscout is used without it |
| `RESEND_API_KEY`, `EMAIL_FROM` | for email | both |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for push | all three. Generate with `npx web-push generate-vapid-keys`. Subject like `mailto:you@example.com`. |
| `ADMIN_TELEGRAM_CHAT_ID` | optional | your own chat id; Nemea messages it once a day when CoinMarketCap credits fall below 15% |
| `TRUST_PROXY_HOPS` | optional | proxy hops in front of the API, default 1. After deploy open `/status` from two networks and check `requestIp` shows your address, not the proxy's; per-IP limits depend on it. |
| `CMC_BASE_URL` | never in production | overrides the CoinMarketCap host; `/status` shows a warning when it is not `pro-api.coinmarketcap.com` |
| `HOST` | optional | address to listen on, default `0.0.0.0`; set `127.0.0.1` when a reverse proxy is on the same machine |
| `CLIENT_IP_HEADER` | optional | header that carries the real client address, set by your own proxy (for example `x-real-client-ip`); ignored unless set, and only used when it holds a valid IP |
| `POLLER_ENABLED` | optional | `false` turns the poller off |

The API trusts one proxy hop for client IPs (`trust proxy 1`), so run it behind Railway's proxy and not directly on the internet.

## Bot (Railway, second service)

- Start: `pnpm --filter @nemea/bot start`
- Variables: `TELEGRAM_BOT_TOKEN`, `API_ORIGIN` (the API's URL), `INTERNAL_API_SECRET` (same as the API), `PUBLIC_WEB_URL` (optional), `PORT`.
- Health: `/health` returns 503 until Telegram accepts the token.

## Web (Vercel)

- Root directory: `apps/web`, framework Next.js.
- Install command: `cd ../.. && pnpm install --frozen-lockfile`
- Build command: `cd ../.. && pnpm --filter @nemea/web build`
- Variable: `API_ORIGIN` = the API's public URL. The web app proxies `/api/*` to it, so the session cookie is first-party.

## After deploy

1. `curl <API>/health` and open `<WEB>/status`. The lanes fill in after the first poll.
2. Run the gates against the deployed keys locally: `pnpm gate:a`, `pnpm gate:b`, `pnpm gate:c`.
3. Kill the API process once and confirm Railway restarts it.
