import { Router } from "express";
import { tierHoldings, priceRows, totalValue, portfolioChange24h } from "@nemea/alerts";
import { AlertPreferences, HoldingInput, PreferencesUpdate, WalletImportConfirm, WalletImportRequest, type PortfolioView, type PricedHoldingView, type TokenLookupCandidate } from "@nemea/shared-types";
import { z } from "zod";
import { limiter, requireUser, type AppDeps, type AuthedRequest } from "../app.ts";
import { SAMPLE_PORTFOLIO } from "../config.ts";
import { HttpError, parseBody } from "../http.ts";
import { HoldingLimitError, type UserRow } from "../services/repo.ts";

const MAX_HOLDINGS = 100;

export async function portfolioView(deps: AppDeps, user: UserRow, refresh: boolean): Promise<PortfolioView> {
  const holdings = await deps.repo.holdingsOf(user.id);
  const ids = [...new Set(holdings.map((h) => h.cmcId))];
  let quotes = await deps.market.quotesFor(ids);
  if (refresh && ids.some((id) => !quotes.has(id))) {
    try {
      quotes = await deps.market.ensureQuotes(ids, Number.MAX_SAFE_INTEGER);
    } catch (error) {
      deps.log("portfolio: on-demand quote refresh failed", error);
    }
  }
  const rows = priceRows(holdings, quotes);
  const tiers = tierHoldings(rows);
  const nowMs = deps.now().getTime();
  const out: PricedHoldingView[] = rows.map((row) => {
    const q = row.quote;
    const ageMs = q ? nowMs - Date.parse(q.cmcLastUpdated ?? q.fetchedAt) : null;
    return {
      ...row.holding,
      valueUsd: row.valueUsd,
      priceUsd: q?.priceUsd ?? null,
      percentChange1h: q?.percentChange1h ?? null,
      percentChange24h: q?.percentChange24h ?? null,
      quoteAgeSeconds: ageMs !== null && Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 1000)) : null,
      quoteStale: ageMs === null || !Number.isFinite(ageMs) || ageMs > deps.maxQuoteAgeMs(),
      tier: tiers.get(row.holding.cmcId) ?? "small",
      costBasisDeltaPct: q?.priceUsd != null && row.holding.costBasisUsd ? (q.priceUsd / row.holding.costBasisUsd - 1) * 100 : null,
    };
  });
  out.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
  const change = portfolioChange24h(rows);
  const stamps = rows.map((r) => r.quote?.fetchedAt).filter((s): s is string => !!s).sort();
  return {
    holdings: out,
    totalValueUsd: totalValue(rows),
    change24hPct: change?.changePct ?? null,
    unpricedCount: rows.filter((r) => r.valueUsd === null).length,
    updatedAt: stamps.at(-1) ?? null,
  };
}

const PatchBody = z
  .object({ amount: z.number().positive().finite().optional(), costBasisUsd: z.number().positive().finite().nullable().optional() })
  .refine((v) => v.amount !== undefined || v.costBasisUsd !== undefined, { message: "nothing to change" });

async function addWithinLimit<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HoldingLimitError) throw new HttpError(400, "too_many_holdings", error.message);
    throw error;
  }
}
const LookupQuery = z.object({ symbol: z.string().trim().min(1).max(20) });

export function portfolioRoutes(deps: AppDeps): Router {
  const r = Router();
  const auth = requireUser(deps);
  const now = () => deps.now().getTime();
  const userKey = (req: unknown) => (req as AuthedRequest).user.id;
  const lookupLimit = limiter(20, 60_000, userKey, now);
  const walletLimit = limiter(6, 60_000, userKey, now);
  const lookupGlobal = limiter(600, 3600_000, () => "global", now);
  const writeLimit = limiter(30, 60_000, userKey, now);
  const metaGlobal = limiter(600, 3600_000, () => "global", now);
  const walletGlobal = limiter(120, 3600_000, () => "global", now);

  r.get("/portfolio", auth, async (req, res) => {
    res.json(await portfolioView(deps, (req as AuthedRequest).user, true));
  });

  r.get("/tokens/lookup", auth, lookupLimit, lookupGlobal, async (req, res) => {
    const { symbol } = parseBody(LookupQuery, req.query);
    let metas;
    try {
      metas = await deps.market.cmc.getInfoBySymbol(symbol);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("not a token symbol")) throw new HttpError(400, "invalid_symbol", "That does not look like a token symbol");
      throw error;
    }
    if (metas.length === 0) {
      res.json({ candidates: [] as TokenLookupCandidate[] });
      return;
    }
    const top = metas.slice(0, 15);
    const { quotes } = await deps.market.cmc.getQuotes(top.map((m) => m.cmcId));
    const rank = new Map(quotes.map((q) => [q.cmcId, q.cmcRank]));
    const candidates: TokenLookupCandidate[] = top
      .map((m) => ({ cmcId: m.cmcId, symbol: m.symbol, name: m.name, rank: rank.get(m.cmcId) ?? null, isStablecoin: m.isStablecoin }))
      .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 6);
    await deps.market.saveMeta(top);
    res.json({ candidates });
  });

  r.post("/portfolio/holdings", auth, writeLimit, metaGlobal, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const input = parseBody(HoldingInput, req.body);
    if (await deps.repo.findManualHolding(user.id, input.cmcId)) throw new HttpError(409, "already_added", "You already added this coin. Edit its amount instead.");
    const meta = (await deps.market.ensureMeta([input.cmcId])).get(input.cmcId);
    if (!meta) throw new HttpError(404, "unknown_token", "CoinMarketCap does not know this coin id");
    const holding = await addWithinLimit(() => deps.repo.addHolding(user.id, { cmcId: meta.cmcId, symbol: meta.symbol, name: meta.name, amount: input.amount, costBasisUsd: input.costBasisUsd ?? null, source: "manual", chain: null, contractAddress: null, walletAddress: null }, MAX_HOLDINGS));
    try {
      await deps.market.ensureQuotes([meta.cmcId], 120_000);
    } catch (error) {
      deps.log("add holding: quote refresh failed; the poller will fill it", error);
    }
    res.status(201).json({ holding, portfolio: await portfolioView(deps, user, false) });
  });

  r.patch("/portfolio/holdings/:id", auth, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const patch = parseBody(PatchBody, req.body);
    const updated = await deps.repo.updateHolding(user.id, String(req.params.id), patch);
    if (!updated) throw new HttpError(404, "not_found", "No such holding");
    res.json({ holding: updated, portfolio: await portfolioView(deps, user, false) });
  });

  r.delete("/portfolio/holdings/:id", auth, async (req, res) => {
    const user = (req as AuthedRequest).user;
    if (!(await deps.repo.deleteHolding(user.id, String(req.params.id)))) throw new HttpError(404, "not_found", "No such holding");
    res.json({ portfolio: await portfolioView(deps, user, false) });
  });

  r.post("/portfolio/sample", auth, writeLimit, metaGlobal, async (req, res) => {
    const user = (req as AuthedRequest).user;
    if ((await deps.repo.countHoldings(user.id)) > 0) throw new HttpError(409, "not_empty", "The sample portfolio can only be loaded into an empty portfolio");
    const metas = await deps.market.ensureMeta(SAMPLE_PORTFOLIO.map((s) => s.cmcId));
    const missing = SAMPLE_PORTFOLIO.filter((s) => !metas.has(s.cmcId)).map((s) => s.cmcId);
    if (missing.length > 0) throw new HttpError(502, "sample_unavailable", `CoinMarketCap did not return metadata for ids ${missing.join(", ")}`);
    for (const s of SAMPLE_PORTFOLIO) {
      const m = metas.get(s.cmcId)!;
      await addWithinLimit(() => deps.repo.addHolding(user.id, { cmcId: m.cmcId, symbol: m.symbol, name: m.name, amount: s.amount, costBasisUsd: s.costBasisUsd, source: "manual", chain: null, contractAddress: null, walletAddress: null }, MAX_HOLDINGS));
    }
    try {
      await deps.market.ensureQuotes(SAMPLE_PORTFOLIO.map((s) => s.cmcId), 120_000);
    } catch (error) {
      deps.log("sample portfolio: quote refresh failed", error);
    }
    res.status(201).json({ portfolio: await portfolioView(deps, user, false) });
  });

  r.post("/portfolio/import-wallet/preview", auth, walletLimit, walletGlobal, async (req, res) => {
    const { address, chains } = parseBody(WalletImportRequest, req.body);
    res.json(await deps.walletReader(address, [...new Set(chains)]));
  });

  r.post("/portfolio/import-wallet/confirm", auth, walletLimit, metaGlobal, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const { address, items, chains: requestedChains } = parseBody(WalletImportConfirm, req.body);
    if (items.length > MAX_HOLDINGS) throw new HttpError(400, "too_many_holdings", `At most ${MAX_HOLDINGS} coins can be imported at once`);
    const ids = [...new Set(items.map((i) => i.cmcId))];
    const metas = await deps.market.ensureMeta(ids);
    const unknown = ids.filter((id) => !metas.has(id));
    if (unknown.length > 0) throw new HttpError(400, "unknown_token", `CoinMarketCap does not know ids ${unknown.join(", ")}`);
    const chains = requestedChains ? [...new Set(requestedChains)] : [...new Set(items.map((i) => i.chain))];
    await addWithinLimit(() => deps.repo.replaceWalletHoldings(
      user.id,
      address,
      chains,
      items.map((i) => ({ cmcId: i.cmcId, symbol: metas.get(i.cmcId)!.symbol, name: metas.get(i.cmcId)!.name, amount: i.amount, costBasisUsd: null, source: "wallet" as const, chain: i.chain, contractAddress: i.contractAddress, walletAddress: address.toLowerCase() })),
      MAX_HOLDINGS,
    ));
    try {
      await deps.market.ensureQuotes(ids, 120_000);
    } catch (error) {
      deps.log("wallet import: quote refresh failed", error);
    }
    res.status(201).json({ portfolio: await portfolioView(deps, user, false) });
  });

  r.get("/preferences", auth, (req, res) => {
    res.json({ preferences: (req as AuthedRequest).user.preferences });
  });

  r.put("/preferences", auth, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const patch = parseBody(PreferencesUpdate, req.body);
    if (patch.protectionLevel === 3) throw new HttpError(400, "not_available", "Level 3 (auto-swap) is not available yet. Levels 1 and 2 are.");
    const merged = AlertPreferences.safeParse({ ...user.preferences, ...patch });
    if (!merged.success) throw new HttpError(400, "invalid_request", merged.error.issues[0]?.message ?? "invalid preferences");
    await deps.repo.setPreferences(user.id, merged.data);
    res.json({ preferences: merged.data });
  });

  return r;
}
