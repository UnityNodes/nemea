# Submission checklist

What the code cannot do for you. Sponsor requirements are from CoinMarketCap's hackathon page (read 2026-09-21); reread the page before submitting, it may have changed.

- Deadline on the official page: Wednesday 30 September, 23:59 UTC. Some third-party listings say 1 October. Trust the official page.
- Judging 1 to 16 October.

| # | Item | Owner action |
|---|---|---|
| 1 | Real CMC key | Done 2026-09-21: `pnpm gate:a` exits 0, evidence in `docs/evidence/gate-a-cmc.json`. Rerun it if the key or plan changes. |
| 2 | Wallet gate | Done 2026-09-21: `pnpm gate:b` exits 0, evidence in `docs/evidence/gate-b-wallet.json`. |
| 3 | Telegram gate | Done 2026-09-21 with `@nemea_alerts_bot`: `pnpm gate:c` exits 0 and the test message arrived. Still to do: link a real account end to end (Settings, Telegram, Link, Start in the bot) on the deployed stack and take the Telegram screenshot for the README. |
| 4 | Deploy | Done 2026-09-21 on the Unity Nodes server: https://nemea.unitynodes.com (see `docs/DEPLOY.md`). Still to check: keep the CMC key valid through 16 October, and add an off-box copy of the database backups. |
| 5 | Screenshots | With the deployed stack on real data: `CONFIRM_REAL_DATA=1 BASE_URL=<url> node apps/web/scripts/screenshots.mjs`, commit `docs/screenshots/`. |
| 6 | README | Fill the two `TODO(owner)` lines: live demo URL and demo account note. |
| 7 | Track | Pick one of: Markets and Trading Tools, AI Agents and Automation, Data and Visualisation, Real World Assets. The page describes the first as "screeners, alert bots, scanners, portfolio and PnL trackers", which is what Nemea is. Read the weightings on the Tracks tab first; they are not in the text this repo was checked against. |
| 8 | Endpoints named | Already listed in the README. Keep the list identical to what `/status` shows. |
| 9 | Visible real API call: code and response | Done in the README ("One real call, code and response"), backed by `docs/evidence/gate-a-sample-call.json`. The demo video should also show `/status` with the live CoinMarketCap call log. |
| 10 | "Where CMC got in the way" | The README section is written from real friction met during the build. Add anything you hit with your own key. |
| 11 | X post | Required text: a link to the DoraHacks submission, the demo video and `#BuildwithCMC`. Post it last, after the submission page and the video exist. |
| 12 | Video (3 min) | Set up portfolio, trigger an alert with "Try an alert", Explain like I'm 5, Level 2 protective action, pitch. |
| 13 | Pitch numbers | The line "27 projects on this hackathon are built for traders, devs, or institutions" is not in this repo's evidence. Count the field yourself before saying it. |
| 14 | Licence | MIT, already in `LICENSE`. |
| 15 | Startup tier for the event | The sponsor upgrades the same key to Startup only after registering on DoraHacks with the email of the CoinMarketCap account. On 2026-09-21 `/status` still reports Basic (15,000 credits/month), so this is not applied yet. After it is: `pnpm gate:a` again (the evidence files update) and `sudo systemctl restart nemea-api` so the cadence is planned from the new limits. |
| 16 | Judging runs on Basic | Event access ends when submissions close (30 Sep 23:59 UTC) and the key reverts to Basic; judging is 1 to 16 October. The planner already handles that: it reads the plan and stretches the cadence, and `/status` says so. Do not promise one-minute checks in the video or the post. |
| 17 | Public repository | Pushed 2026-09-22: `UnityNodes/nemea`, branch `main`, 37 commits, 225 files. **The repository is still private**, and anonymous visitors get a 404, which fails the submission requirement. Owner action: GitHub, the repo, Settings, General, Danger Zone, Change visibility, Public. Verify with `curl -s -o /dev/null -w "%{http_code}" https://github.com/UnityNodes/nemea` from a logged-out shell; it must return 200. The repo also has no description and no topics set, which is the first thing a grader reads on the page. |
| 18 | No key in the repo | Checked 2026-09-21: full history scanned for key, token and private-key patterns, nothing found; only `.env.example` is tracked. Rerun before pushing. |
| 19 | API feedback | The sponsor reads it. The README friction list is the feedback; also post it in the hackathon's public Q&A tab. Full paste-ready version: `docs/API_FEEDBACK.md`. |
| 20b | Tokenised real-world assets | Done 2026-09-22. Nemea watches tokenised stocks and commodities with `/v5/real-world-assets/*` and alerts when a wrapper you hold drifts from what the same asset costs everywhere else. Worth saying in the video: of the 35 entries submitted, ten are in the RWA track and every one of them analyses RWA data; this is the only one that watches a position and tells you. Stay in the Markets and Trading Tools track anyway: the RWA track is the most crowded and its entries are the strongest in the field. |
| 20a | One-liner for the DoraHacks form | Paste this, it is the field graders read first. "Every crypto tool is a screen you have to be watching. Nemea is the one that writes to you when you are not. Replayed on a real year of CoinMarketCap history it sent 94 alerts and held back 396 repeats, and on that year's one crash day it alerted on the coin that crossed the threshold while staying quiet on the three that fell 7%, 12% and 14.6% without crossing it." Checked against the 35 entries submitted by 2026-09-22: none of them use the words "offline" or "holder", and only one treats alert delivery as the product. Do not describe Nemea as a "dashboard" or a "portfolio tracker" in the form; that is the crowded half of the field. |
| 20 | Track record on real history | Done 2026-09-22: `pnpm replay` exits with real numbers, evidence in `docs/evidence/replay.json`, shown on the live `/status` page and in the README. This is the answer to "does it work on more than a demo". Rerun before the deadline if you want a fresher window; the numbers will shift slightly (a new busiest day, a different alert count) because the window moves. |
