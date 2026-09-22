# Scope

Written before the build and kept honest since. The second list is the useful one.

## Shipping

| Area | What ships |
|---|---|
| Portfolio | Manual entry (token + amount + optional cost basis). Read-only wallet import on Ethereum, Base, Arbitrum. Guest accounts and Sign-In with Ethereum (EOA wallets). |
| Monitoring | CoinMarketCap quotes, global metrics, categories, history. Polling cadence adapts to the API plan. |
| Alerts | Price drop (1h / 24h), below cost basis, near low, stablecoin depeg, stablecoin volume anomaly, volume spike, volume dry-up, category rotation, portfolio drop with attribution, tokenised real-world asset drift. Cooldowns, weekly cap, daily cap on critical. |
| Delivery | Web dashboard, Telegram bot, email (critical immediately, everything else in one daily digest), browser push (when VAPID keys are configured). |
| Explain like I'm 5 | Deterministic, built from CoinMarketCap data only. No language model, no prediction. |
| Protective actions | Level 1 alert only. Level 2 alert plus swap links (Uniswap, 1inch) the user approves in their own wallet. |
| Evidence | `/status` page with the live CoinMarketCap call log, credit spend, cadence, lane health. Gate scripts that fail loudly. |

## Not shipping

| Cut | Why |
|---|---|
| Level 3 auto-swap | Spec marks it optional. It needs standing permissions over user funds, which is the opposite of the promise the product makes. The API rejects level 3 instead of pretending. |
| Smart-contract wallet sign-in (ERC-1271) | Needs an RPC per chain for verification. EOA wallets cover the demo. |
| Referral links | No partner or referral IDs exist for Uniswap or 1inch. Links are plain. The API reports `referralConfigured: false`. |
| More than one poller instance | Alert dedupe reads the database, but two pollers ticking at once can race. Run one. |
| Trading bot, signals, ML predictions, NFTs, DEX aggregation, non-English, native mobile app, advanced analytics | Out of scope by product definition. |
| Email unsubscribe headers | Removing the address in Settings stops mail. `List-Unsubscribe` is not implemented. |
| Auth beyond the demo path | No password login, no account recovery. A guest is a cookie. Signing in with a wallet is the durable identity. |

## Not done by code

The demo video, the public deploy, the X post with `#BuildwithCMC`, the DoraHacks submission form and the real-key gate runs are the owner's to do. See `docs/SUBMISSION.md`.
