# Submission checklist

What the code cannot do for you. Sponsor requirements are from CoinMarketCap's hackathon page (read 2026-09-21); reread the page before submitting, it may have changed.

- Deadline on the official page: Wednesday 30 September, 23:59 UTC. Some third-party listings say 1 October. Trust the official page.
- Judging 1 to 16 October.

| # | Item | Owner action |
|---|---|---|
| 1 | Real CMC key | Done 2026-09-21: `pnpm gate:a` exits 0, evidence in `docs/evidence/gate-a-cmc.json`. Rerun it if the key or plan changes. |
| 2 | Wallet gate | Done 2026-09-21: `pnpm gate:b` exits 0, evidence in `docs/evidence/gate-b-wallet.json`. |
| 3 | Telegram gate | Create a bot in @BotFather, put the token in `.env`, message the bot, `pnpm gate:c`. Confirm the test message on your phone. |
| 4 | Deploy | Web on Vercel, API and bot on Railway, Postgres on Neon or Supabase. Set every variable from `.env.example`. Run one API instance. |
| 5 | Screenshots | With the deployed stack on real data: `CONFIRM_REAL_DATA=1 BASE_URL=<url> node apps/web/scripts/screenshots.mjs`, commit `docs/screenshots/`. |
| 6 | README | Fill the two `TODO(owner)` lines: live demo URL and demo account note. |
| 7 | Track | Pick one of: Markets and Trading Tools, AI Agents and Automation, Data and Visualisation, Real World Assets. Nemea has no AI agent, so the first or third fits best. |
| 8 | Endpoints named | Already listed in the README. Keep the list identical to what `/status` shows. |
| 9 | Visible real API call | The demo video should show `/status` with the live CoinMarketCap call log. |
| 10 | "Where CMC got in the way" | The README section is written from real friction met during the build. Add anything you hit with your own key. |
| 11 | X post | Post with `#BuildwithCMC`. |
| 12 | Video (3 min) | Set up portfolio, trigger an alert with "Try an alert", Explain like I'm 5, Level 2 protective action, pitch. |
| 13 | Pitch numbers | The line "27 projects on this hackathon are built for traders, devs, or institutions" is not in this repo's evidence. Count the field yourself before saying it. |
| 14 | Licence | MIT, already in `LICENSE`. |
