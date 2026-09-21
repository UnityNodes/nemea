# Deploy

Web on Vercel, API and bot on Railway, Postgres on Neon or Supabase. Nothing here has been deployed from this repository yet; this is the recipe.

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
