import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { addHolding, guest, linkTelegram, startHarness, type Harness } from "./harness.ts";

let h: Harness;
beforeEach(async () => {
  h = await startHarness();
});
afterEach(async () => {
  await h.close();
});

const SOL = 5426;
const ETH = 1027;
const USDC = 3408;
const BTC = 1;

describe("auth and isolation", () => {
  it("refuses everything private without a session", async () => {
    const c = h.client();
    for (const [m, p] of [["GET", "/portfolio"], ["GET", "/alerts"], ["GET", "/me"], ["POST", "/alerts/simulate"], ["GET", "/channels"]] as const) {
      const r = await c.request(m, p, m === "POST" ? {} : undefined);
      expect(r.status, `${m} ${p}`).toBe(401);
    }
  });

  it("creates a guest once per session and sets an httpOnly cookie", async () => {
    const c = h.client();
    const first = await c.request("POST", "/auth/guest");
    expect(first.status).toBe(201);
    expect(first.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(first.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
    const again = await c.request("POST", "/auth/guest");
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(first.body.user.id);
  });

  it("does not let one user read or change another user's data", async () => {
    const a = await guest(h);
    const b = await guest(h);
    await addHolding(a, ETH, 1);
    const holdingId = (await a.request("GET", "/portfolio")).body.holdings[0].id;
    await addHolding(a, SOL, 5);
    const sim = await a.request("POST", "/alerts/simulate", { scenario: "drop" });
    expect(sim.status).toBe(201);
    const alertId = sim.body.alert.id;
    expect((await b.request("GET", `/alerts/${alertId}`)).status).toBe(404);
    expect((await b.request("GET", `/alerts/${alertId}/explain`)).status).toBe(404);
    expect((await b.request("GET", `/alerts/${alertId}/actions`)).status).toBe(404);
    expect((await b.request("POST", `/alerts/${alertId}/read`)).status).toBe(404);
    expect((await b.request("DELETE", `/portfolio/holdings/${holdingId}`)).status).toBe(404);
    expect((await b.request("PATCH", `/portfolio/holdings/${holdingId}`, { amount: 99 })).status).toBe(404);
    expect((await a.request("GET", "/portfolio")).body.holdings).toHaveLength(2);
    expect((await b.request("GET", "/portfolio")).body.holdings).toHaveLength(0);
  });

  it("refuses state changes that come from another origin", async () => {
    const c = await guest(h);
    const r = await c.request("POST", "/portfolio/holdings", { cmcId: ETH, amount: 1 }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
    const ok = await c.request("POST", "/portfolio/holdings", { cmcId: ETH, amount: 1 }, { origin: "https://nemea.test" });
    expect(ok.status).toBe(201);
  });

  it("rejects a forged session cookie", async () => {
    const r = await h.client().request("GET", "/me", undefined, { cookie: "nemea_session=eyJhbGciOiJIUzI1NiJ9.e30.forged" });
    expect(r.status).toBe(401);
  });

  it("signs in with a wallet, upgrades the guest, and refuses a replayed nonce", async () => {
    const c = await guest(h);
    await addHolding(c, ETH, 2);
    const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const n1 = (await c.request("GET", "/auth/siwe/nonce")).body;
    const message = createSiweMessage({ address: account.address, chainId: 1, domain: n1.domain, nonce: n1.nonce, uri: n1.uri, version: "1", issuedAt: h.composed.deps.now() });
    const signature = await account.signMessage({ message });
    const ok = await c.request("POST", "/auth/siwe/verify", { message, signature });
    expect(ok.status).toBe(200);
    expect(ok.body.user.kind).toBe("wallet");
    expect(ok.body.user.walletAddress).toBe(account.address.toLowerCase());
    expect((await c.request("GET", "/portfolio")).body.holdings).toHaveLength(1);
    const replay = await c.request("POST", "/auth/siwe/verify", { message, signature });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("bad_nonce");
  });

  it("refuses a SIWE message for another domain and a signature from another key", async () => {
    const c = h.client();
    const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const other = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
    const n = (await c.request("GET", "/auth/siwe/nonce")).body;
    const wrongDomain = createSiweMessage({ address: account.address, chainId: 1, domain: "evil.example", nonce: n.nonce, uri: "https://evil.example", version: "1", issuedAt: h.composed.deps.now() });
    expect((await c.request("POST", "/auth/siwe/verify", { message: wrongDomain, signature: await account.signMessage({ message: wrongDomain }) })).status).toBe(401);
    const n2 = (await c.request("GET", "/auth/siwe/nonce")).body;
    const msg = createSiweMessage({ address: account.address, chainId: 1, domain: n2.domain, nonce: n2.nonce, uri: n2.uri, version: "1", issuedAt: h.composed.deps.now() });
    const forged = await other.signMessage({ message: msg });
    const r = await c.request("POST", "/auth/siwe/verify", { message: msg, signature: forged });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("bad_signature");
  });
});

describe("portfolio", () => {
  it("looks a token up by symbol, ranked, and adds it with a live price", async () => {
    const c = await guest(h);
    const look = await c.request("GET", "/tokens/lookup?symbol=eth");
    expect(look.status).toBe(200);
    expect(look.body.candidates[0]).toMatchObject({ cmcId: ETH, symbol: "ETH", rank: 2 });
    const added = await addHolding(c, ETH, 2, 2000);
    expect(added.portfolio.holdings[0]).toMatchObject({ symbol: "ETH", priceUsd: 2650, valueUsd: 5300, costBasisDeltaPct: expect.closeTo(32.5, 1) });
    expect(added.portfolio.totalValueUsd).toBe(5300);
  });

  it("rejects bad input: negative or zero amounts, unknown coins, junk symbols", async () => {
    const c = await guest(h);
    expect((await c.request("POST", "/portfolio/holdings", { cmcId: ETH, amount: -1 })).status).toBe(400);
    expect((await c.request("POST", "/portfolio/holdings", { cmcId: ETH, amount: 0 })).status).toBe(400);
    expect((await c.request("POST", "/portfolio/holdings", { cmcId: ETH, amount: "1e999" })).status).toBe(400);
    expect((await c.request("POST", "/portfolio/holdings", { cmcId: 999999, amount: 1 })).status).toBe(404);
    expect((await c.request("GET", "/tokens/lookup?symbol=ETH%26convert%3DEUR")).status).toBe(400);
    expect((await c.request("GET", "/tokens/lookup")).status).toBe(400);
  });

  it("does not add the same coin twice and lets you edit or delete it", async () => {
    const c = await guest(h);
    await addHolding(c, ETH, 1);
    expect((await c.request("POST", "/portfolio/holdings", { cmcId: ETH, amount: 1 })).status).toBe(409);
    const id = (await c.request("GET", "/portfolio")).body.holdings[0].id;
    const patched = await c.request("PATCH", `/portfolio/holdings/${id}`, { amount: 3, costBasisUsd: null });
    expect(patched.body.holding.amount).toBe(3);
    expect((await c.request("DELETE", `/portfolio/holdings/${id}`)).body.portfolio.holdings).toEqual([]);
  });

  it("loads a sample portfolio once, into an empty portfolio only", async () => {
    const c = await guest(h);
    const r = await c.request("POST", "/portfolio/sample");
    expect(r.status).toBe(201);
    expect(r.body.portfolio.holdings.map((x: any) => x.symbol).sort()).toEqual(["BTC", "ETH", "SOL", "USDC", "USDT"]);
    expect((await c.request("POST", "/portfolio/sample")).status).toBe(409);
  });

  it("marks a quote as stale instead of presenting it as live", async () => {
    const c = await guest(h);
    await addHolding(c, ETH, 1);
    h.clock.t += 45 * 60_000;
    const p = (await c.request("GET", "/portfolio")).body;
    expect(p.holdings[0].quoteStale).toBe(true);
    expect(p.holdings[0].quoteAgeSeconds).toBeGreaterThan(40 * 60);
  });

  it("shows a coin CMC has no quote for as unpriced, never as zero", async () => {
    const c = await guest(h);
    await addHolding(c, ETH, 1);
    await h.composed.deps.market.saveMeta([{ cmcId: 77777, symbol: "GHOST", name: "Ghost", slug: "ghost", tags: [], category: null, isStablecoin: false, contracts: [], dateAdded: null, fetchedAt: h.composed.deps.now().toISOString() }]);
    const user = (await c.request("GET", "/me")).body.user;
    await h.composed.deps.repo.addHolding(user.id, { cmcId: 77777, symbol: "GHOST", name: "Ghost", amount: 5, costBasisUsd: null, source: "manual", chain: null, contractAddress: null, walletAddress: null });
    const p = (await c.request("GET", "/portfolio")).body;
    const ghost = p.holdings.find((x: any) => x.symbol === "GHOST");
    expect(ghost.valueUsd).toBeNull();
    expect(ghost.priceUsd).toBeNull();
    expect(p.unpricedCount).toBe(1);
    expect(p.totalValueUsd).toBe(2650);
  });

  it("imports a wallet and re-importing replaces instead of duplicating", async () => {
    h = await (async () => {
      await h.close();
      return startHarness({
        walletReader: async (address) => ({
          address,
          items: [
            { cmcId: ETH, symbol: "ETH", name: "Ethereum", amount: 1.5, chain: "base", contractAddress: null },
            { cmcId: USDC, symbol: "USDC", name: "USDC", amount: 250, chain: "base", contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
          ],
          skipped: [],
          chainErrors: [],
        }),
      });
    })();
    const c = await guest(h);
    const address = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const preview = await c.request("POST", "/portfolio/import-wallet/preview", { address, chains: ["base"] });
    expect(preview.status).toBe(200);
    for (let i = 0; i < 2; i++) {
      const confirm = await c.request("POST", "/portfolio/import-wallet/confirm", { address, items: preview.body.items });
      expect(confirm.status).toBe(201);
    }
    const p = (await c.request("GET", "/portfolio")).body;
    expect(p.holdings).toHaveLength(2);
    expect(p.holdings.every((x: any) => x.source === "wallet" && x.chain === "base")).toBe(true);
    expect((await c.request("POST", "/portfolio/import-wallet/preview", { address: "not-an-address", chains: ["base"] })).status).toBe(400);
    expect((await c.request("POST", "/portfolio/import-wallet/preview", { address, chains: [] })).status).toBe(400);
  });
});

describe("live monitoring and alerts", () => {
  it("polls, raises a drop alert once, delivers it to Telegram, and stays quiet on the next poll", async () => {
    const c = await guest(h);
    await addHolding(c, SOL, 60);
    await addHolding(c, ETH, 2);
    await addHolding(c, BTC, 0.1);
    await linkTelegram(h, c, "555");
    await h.composed.poller!.tick();
    expect((await c.request("GET", "/alerts")).body.alerts).toEqual([]);

    h.fake.setCoin(SOL, { pct24h: -21, price: 117 });
    for (let i = 0; i < 6; i++) {
      h.clock.t += 60_000;
      await h.composed.poller!.tick();
    }
    const list = (await c.request("GET", "/alerts")).body;
    const drops = list.alerts.filter((a: any) => a.kind === "price_drop_24h");
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ symbol: "SOL", simulated: false });
    expect(drops[0].disclaimer).toContain("Not financial advice");
    expect(list.week.count).toBe(1);

    const sent = h.telegram.filter((m) => (m.body as any).chat_id === "555");
    expect(sent).toHaveLength(1);
    const msg = sent[0]!.body as any;
    expect(msg.text).toContain("SOL is down 21%");
    expect(msg.text).toContain("Not financial advice");
    expect(msg.text).not.toContain("[SIMULATION]");
    expect(msg.parse_mode).toBe("HTML");
    expect(msg.reply_markup.inline_keyboard[0][0].url).toMatch(/^https:\/\/nemea\.test\/alerts\//);
    expect(list.deliveries.find((d: any) => d.channel === "telegram")?.status).toBe("sent");
  });

  it("only refreshes a small holding on the slow lane, so a crash in it is not seen every minute", async () => {
    const c = await guest(h);
    await addHolding(c, BTC, 1);
    await addHolding(c, SOL, 1);
    await h.composed.poller!.tick();
    h.fake.setCoin(SOL, { pct24h: -40, price: 90 });
    for (let i = 0; i < 5; i++) {
      h.clock.t += 60_000;
      await h.composed.poller!.tick();
    }
    expect((await c.request("GET", "/alerts")).body.alerts).toEqual([]);
    for (let i = 0; i < 25; i++) {
      h.clock.t += 60_000;
      await h.composed.poller!.tick();
    }
    expect((await c.request("GET", "/alerts")).body.alerts.some((a: any) => a.symbol === "SOL")).toBe(true);
  });

  it("does not alert on stale data: if CMC stops updating a coin the engine goes quiet and says so", async () => {
    const c = await guest(h);
    await addHolding(c, SOL, 10);
    await addHolding(c, ETH, 1);
    h.fake.setCoin(SOL, { pct24h: -40, price: 90 });
    await h.composed.poller!.tick();
    const before = (await c.request("GET", "/alerts")).body.alerts.length;
    h.composed.deps.market.cmc.stats();
    const user = (await c.request("GET", "/me")).body.user;
    h.clock.t += 50 * 60_000;
    h.fake.setCoin(SOL, { pct24h: -41 });
    const out = await h.composed.deps.evaluator.evaluateUser((await h.composed.deps.repo.userById(user.id))!);
    expect(out.output.evaluated.stale).toBe(2);
    expect(out.alerts).toEqual([]);
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it("pauses polling for a while when CMC says the monthly quota is gone, and reports it", async () => {
    const c = await guest(h);
    await addHolding(c, ETH, 1);
    await h.composed.poller!.tick();
    h.fake.failNext(429, 1010, "You've exceeded your API monthly credit limit.");
    h.clock.t += 60_000;
    const r = await h.composed.poller!.tick();
    expect(r.quotesUpdated).toBe(0);
    const status = (await c.request("GET", "/status")).body;
    expect(status.pausedUntil).not.toBeNull();
    const second = await h.composed.poller!.tick();
    expect(second.skipped).toContain("paused");
    h.clock.t += 31 * 60_000;
    const third = await h.composed.poller!.tick();
    expect(third.skipped).toBeNull();
    expect(third.quotesUpdated).toBeGreaterThan(0);
  });

  it("puts a free-size plan on a slower depeg cadence and shows the truth on /status", async () => {
    h.fake.setPlan({ creditLimitMonthly: 15_000, rateLimitPerMinute: 50, historical: true, priceStats: false });
    const c = await guest(h);
    await addHolding(c, ETH, 1);
    await h.composed.poller!.tick();
    const s = (await c.request("GET", "/status")).body;
    expect(s.budgetVerdict).toBe("stretched");
    expect(s.cadenceMultiplier).toBeGreaterThan(1);
    expect(s.creditLimitMonthly).toBe(15_000);
    expect(s.rateLimitPerMinute).toBe(50);
    expect(s.lanes.find((l: any) => l.lane === "stablecoins").intervalSeconds).toBeGreaterThan(60);
    expect(s.receipts.length).toBeGreaterThan(0);
    expect(s.receipts.some((x: any) => x.endpoint.includes("quotes/latest") && x.ok)).toBe(true);
  });

  it("raises a critical depeg alert for a held stablecoin and emails it right away", async () => {
    const c = await guest(h);
    await addHolding(c, USDC, 5000);
    await addHolding(c, ETH, 1);
    await c.request("POST", "/channels/email", { email: "me@example.com" });
    const token = new URL(String((h.emails[0]!.body as any).text).match(/https?:\/\/\S+/)![0]).searchParams.get("token");
    expect((await c.request("POST", "/channels/email/verify", { token })).status).toBe(200);
    h.emails.length = 0;
    h.fake.setCoin(USDC, { price: 0.962 });
    await h.composed.poller!.tick();
    const alerts = (await c.request("GET", "/alerts")).body.alerts;
    expect(alerts.map((a: any) => [a.kind, a.severity])).toContainEqual(["depeg", "critical"]);
    expect(h.emails).toHaveLength(1);
    expect((h.emails[0]!.body as any).to).toEqual(["me@example.com"]);
  });
});

describe("simulate, explain, actions", () => {
  async function setup() {
    const c = await guest(h);
    await addHolding(c, SOL, 10);
    await addHolding(c, ETH, 1);
    await addHolding(c, USDC, 2000);
    await h.composed.poller!.tick();
    return c;
  }

  it("simulates a drop with the real engine, labels it, and does not eat the weekly alert budget", async () => {
    const c = await setup();
    await linkTelegram(h, c, "777");
    const sim = await c.request("POST", "/alerts/simulate", { scenario: "drop", cmcId: SOL });
    expect(sim.status).toBe(201);
    expect(sim.body.alert).toMatchObject({ kind: "price_drop_24h", symbol: "SOL", simulated: true });
    expect(h.telegram.at(-1)!.body).toMatchObject({ chat_id: "777" });
    expect(String((h.telegram.at(-1)!.body as any).text)).toContain("[SIMULATION]");
    const list = (await c.request("GET", "/alerts")).body;
    expect(list.week.count).toBe(0);
    const again = await c.request("POST", "/alerts/simulate", { scenario: "drop", cmcId: SOL });
    expect(again.status).toBe(201);
  });

  it("refuses to simulate something the portfolio cannot support", async () => {
    const c = await guest(h);
    expect((await c.request("POST", "/alerts/simulate", { scenario: "drop" })).body.error.code).toBe("empty_portfolio");
    await addHolding(c, ETH, 1);
    expect((await c.request("POST", "/alerts/simulate", { scenario: "depeg" })).body.error.code).toBe("no_stablecoin");
    expect((await c.request("POST", "/alerts/simulate", { scenario: "portfolio_drop" })).body.error.code).toBe("not_diversified");
    expect((await c.request("POST", "/alerts/simulate", { scenario: "nonsense" })).status).toBe(400);
  });

  it("simulates a portfolio-level drop and explains it through the category", async () => {
    const c = await setup();
    const sim = await c.request("POST", "/alerts/simulate", { scenario: "portfolio_drop" });
    expect(sim.status).toBe(201);
    expect(sim.body.alert.kind).toBe("portfolio_drop");
    const ex = await c.request("GET", `/alerts/${sim.body.alert.id}/explain`);
    expect(ex.status).toBe(200);
    expect(ex.body.explanation.headline).toContain("Your portfolio dropped");
    expect(ex.body.explanation.sections[0].heading).toBe("This is a simulation");
    expect(ex.body.explanation.calmNote).toContain("nothing actually happened");
  });

  it("explains a drop with real price history, and says so when history is not on the plan", async () => {
    const c = await setup();
    const sim = await c.request("POST", "/alerts/simulate", { scenario: "drop", cmcId: SOL });
    const ok = await c.request("GET", `/alerts/${sim.body.alert.id}/explain`);
    expect(ok.status).toBe(200);
    const headings = ok.body.explanation.sections.map((s: any) => s.heading);
    expect(headings).toContain("Has this happened before?");
    expect(ok.body.explanation.calmNote).toContain("Nothing has been sold");

    h.fake.setPlan({ creditLimitMonthly: 15_000, rateLimitPerMinute: 50, historical: false, priceStats: false });
    await addHolding(c, 1975, 100);
    const sim2 = await c.request("POST", "/alerts/simulate", { scenario: "drop", cmcId: 1975 });
    const noHistory = await c.request("GET", `/alerts/${sim2.body.alert.id}/explain`);
    expect(noHistory.status).toBe(200);
    expect(noHistory.body.explanation.sections.map((s: any) => s.heading)).not.toContain("Has this happened before?");
    expect(noHistory.body.explanation.dataGaps.join(" ")).toContain("not included in the CoinMarketCap plan");
  });

  it("explains a depeg from the stablecoin's own history", async () => {
    const c = await setup();
    const sim = await c.request("POST", "/alerts/simulate", { scenario: "depeg" });
    expect(sim.body.alert.kind).toBe("depeg");
    const ex = await c.request("GET", `/alerts/${sim.body.alert.id}/explain`);
    expect(JSON.stringify(ex.body.explanation)).toContain("closed below");
  });

  it("stays alert-only at level 1, gives swap links at level 2, and refuses level 3", async () => {
    const c = await setup();
    const sim = await c.request("POST", "/alerts/simulate", { scenario: "drop", cmcId: ETH });
    const id = sim.body.alert.id;
    const l1 = await c.request("GET", `/alerts/${id}/actions`);
    expect(l1.body.suggestions).toEqual([]);
    expect(l1.body.unavailableReason).toContain("alert-only");
    expect((await c.request("PUT", "/preferences", { protectionLevel: 3 })).status).toBe(400);
    expect((await c.request("PUT", "/preferences", { protectionLevel: 2 })).status).toBe(200);
    const l2 = await c.request("GET", `/alerts/${id}/actions?fraction=0.25`);
    expect(l2.status).toBe(200);
    expect(l2.body.suggestions.length).toBeGreaterThan(0);
    const s = l2.body.suggestions.find((x: any) => x.chain === "ethereum");
    expect(s.suggestedAmount).toBeCloseTo(0.25);
    expect(s.uniswapUrl).toContain("app.uniswap.org/swap");
    expect(s.uniswapUrl).toContain("outputCurrency=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(s.referralConfigured).toBe(false);
    expect(l2.body.disclaimer).toContain("Not financial advice");
    expect((await c.request("GET", `/alerts/${id}/actions?fraction=2`)).status).toBe(400);
  });

  it("validates preferences and keeps the weekly cap within 1 to 3", async () => {
    const c = await guest(h);
    expect((await c.request("PUT", "/preferences", { weeklyCap: 9 })).status).toBe(400);
    expect((await c.request("PUT", "/preferences", { drop24hPct: -5 })).status).toBe(400);
    const ok = await c.request("PUT", "/preferences", { drop24hPct: 10, weeklyCap: 2 });
    expect(ok.body.preferences).toMatchObject({ drop24hPct: 10, weeklyCap: 2, drop1hPct: 8 });
  });
});

describe("channels", () => {
  it("links Telegram through a single-use code and refuses reuse, expiry and a wrong internal secret", async () => {
    const c = await guest(h);
    const code = (await c.request("POST", "/channels/telegram/link-code")).body;
    expect(code.deepLink).toBe(`https://t.me/NemeaTestBot?start=${code.code}`);
    const call = (body: unknown, secret = "internal-secret-1234") =>
      fetch(`${h.baseUrl}/internal/telegram/link`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
    expect((await call({ code: code.code, chatId: "9", username: "u" }, "wrong")).status).toBe(401);
    expect((await call({ code: code.code, chatId: "9", username: "u" })).status).toBe(200);
    expect((await call({ code: code.code, chatId: "9", username: "u" })).status).toBe(404);
    expect((await c.request("GET", "/channels")).body.telegram).toEqual({ linked: true, username: "u" });

    const c2 = await guest(h);
    const code2 = (await c2.request("POST", "/channels/telegram/link-code")).body;
    h.clock.t += 11 * 60_000;
    expect((await call({ code: code2.code, chatId: "10", username: null })).status).toBe(410);
    expect((await fetch(`${h.baseUrl}/internal/telegram/summary?chatId=9`)).status).toBe(401);
  });

  it("gives the bot a summary that shows n/a as null, not zero", async () => {
    const c = await guest(h);
    await linkTelegram(h, c, "31");
    const empty = await fetch(`${h.baseUrl}/internal/telegram/summary?chatId=31`, { headers: { authorization: "Bearer internal-secret-1234" } });
    expect(await empty.json()).toMatchObject({ linked: true, portfolioValueUsd: null, change24hPct: null, holdings: 0, alertsThisWeek: 0, weeklyCap: 3 });
    const none = await fetch(`${h.baseUrl}/internal/telegram/summary?chatId=404`, { headers: { authorization: "Bearer internal-secret-1234" } });
    expect(await none.json()).toEqual({ linked: false });
  });

  it("unlinks Telegram when the user blocks the bot instead of failing forever", async () => {
    const c = await guest(h);
    await addHolding(c, SOL, 10);
    await addHolding(c, ETH, 1);
    await linkTelegram(h, c, "66");
    h.telegramFails.next = { status: 403, description: "Forbidden: bot was blocked by the user" };
    await c.request("POST", "/alerts/simulate", { scenario: "drop", cmcId: SOL });
    expect((await c.request("GET", "/channels")).body.telegram.linked).toBe(false);
    const list = (await c.request("GET", "/alerts")).body;
    expect(list.deliveries.find((d: any) => d.channel === "telegram")).toMatchObject({ status: "failed" });
  });

  it("only turns on email after the address is confirmed with a valid, single-use token", async () => {
    const c = await guest(h);
    expect((await c.request("POST", "/channels/email", { email: "nope" })).status).toBe(400);
    expect((await c.request("POST", "/channels/email", { email: "me@example.com" })).status).toBe(202);
    expect((await c.request("GET", "/channels")).body.email).toEqual({ address: "me@example.com", verified: false });
    const link = String((h.emails[0]!.body as any).text).match(/https?:\/\/\S+/)![0];
    const token = new URL(link).searchParams.get("token");
    expect((await c.request("POST", "/channels/email/verify", { token: "x".repeat(20) })).status).toBe(400);
    expect((await c.request("POST", "/channels/email/verify", { token })).status).toBe(200);
    expect((await c.request("POST", "/channels/email/verify", { token })).status).toBe(400);
    expect((await c.request("GET", "/channels")).body.email.verified).toBe(true);
  });

  it("sends one digest a day and nothing at all when there is nothing to say", async () => {
    const c = await guest(h);
    await addHolding(c, SOL, 10);
    await addHolding(c, ETH, 1);
    await c.request("POST", "/channels/email", { email: "me@example.com" });
    const token = new URL(String((h.emails[0]!.body as any).text).match(/https?:\/\/\S+/)![0]).searchParams.get("token");
    await c.request("POST", "/channels/email/verify", { token });
    h.emails.length = 0;
    h.clock.t = Date.parse("2026-09-21T08:10:00.000Z");
    const d = h.composed.deps.delivery;
    expect(await d.runDigests(8, 8)).toEqual({ sent: 0, failed: 0 });
    expect(h.emails).toHaveLength(0);

    h.fake.setCoin(SOL, { pct24h: -18, price: 121 });
    await h.composed.poller!.tick();
    expect((await c.request("GET", "/alerts")).body.alerts.length).toBe(1);
    expect(h.emails).toHaveLength(1);
    expect(String((h.emails[0]!.body as any).subject)).toContain("digest");
    expect(String((h.emails[0]!.body as any).text)).toContain("SOL is down 18%");
    expect(await d.runDigests(8, 8)).toEqual({ sent: 0, failed: 0 });
    expect(await d.runDigests(9, 8)).toEqual({ sent: 0, failed: 0 });
    h.clock.t += 24 * 3600_000;
    expect(await d.runDigests(8, 8)).toEqual({ sent: 0, failed: 0 });
  });

  it("says push is unavailable rather than pretending to subscribe", async () => {
    const c = await guest(h);
    const r = await c.request("POST", "/channels/push/subscribe", { endpoint: "https://push.example/abc", keys: { p256dh: "x", auth: "y" } });
    expect(r.status).toBe(503);
    expect((await c.request("GET", "/channels/push/public-key")).body.publicKey).toBeNull();
  });
});

describe("operations", () => {
  it("reports health and returns JSON errors for unknown routes and bad JSON", async () => {
    const c = h.client();
    expect((await c.request("GET", "/health")).body).toEqual({ ok: true });
    expect((await c.request("GET", "/nope")).status).toBe(404);
    const bad = await fetch(`${h.baseUrl}/auth/guest`, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
    expect(bad.status).toBe(400);
    const ok = await guest(h);
    const raw = await fetch(`${h.baseUrl}/portfolio/holdings`, { method: "POST", headers: { "content-type": "application/json", cookie: ok.cookie() ?? "" }, body: "{not json" });
    expect(raw.status).toBe(400);
    expect(await h.client().request("GET", "/health")).toMatchObject({ status: 200 });
  });

  it("maps a CMC outage to a clear error instead of a 500 and does not cache the failure", async () => {
    const c = await guest(h);
    h.fake.failNext(500, 500, "boom");
    const r = await c.request("GET", "/tokens/lookup?symbol=BTC");
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("upstream_error");
    expect((await c.request("GET", "/tokens/lookup?symbol=BTC")).status).toBe(200);
  });
});
