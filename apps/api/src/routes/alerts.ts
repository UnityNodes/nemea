import { Router } from "express";
import { z } from "zod";
import { buildActions } from "@nemea/alerts";
import { DISCLAIMER, SimulateRequest, type ActionResponse } from "@nemea/shared-types";
import { limiter, requireUser, type AppDeps, type AuthedRequest } from "../app.ts";
import { HttpError, parseBody } from "../http.ts";
import { toAlertRecord } from "../services/evaluator.ts";
import { PEGGED_IDS } from "../services/watchlist.ts";

const STABLE_ORDER = [3408, 825, 4943, 29470];
const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });
const ActionQuery = z.object({ fraction: z.coerce.number().gt(0).lte(1).default(0.5) });

export function alertRoutes(deps: AppDeps): Router {
  const r = Router();
  const auth = requireUser(deps);
  const now = () => deps.now().getTime();
  const userKey = (req: unknown) => (req as AuthedRequest).user.id;
  const simulateLimit = limiter(10, 60_000, userKey, now);
  const explainLimit = limiter(20, 60_000, userKey, now);
  const explainGlobal = limiter(300, 3600_000, () => "global", now);

  async function deliveriesFor(alertIds: string[]) {
    const rows = await deps.repo.deliveriesFor(alertIds);
    return rows.map((d) => ({ alertId: d.alertId, channel: d.channel, status: d.status, detail: d.detail, at: d.at.toISOString() }));
  }

  r.get("/alerts", auth, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const { limit } = parseBody(ListQuery, req.query);
    const rows = await deps.repo.alertsOf(user.id, limit);
    const week = await deps.repo.alertsThisWeek(user.id);
    res.json({
      alerts: rows.map(toAlertRecord),
      deliveries: await deliveriesFor(rows.map((a) => a.id)),
      week: { count: week.count, cap: user.preferences.weeklyCap, lastAt: week.lastAt?.toISOString() ?? null },
    });
  });

  r.post("/alerts/simulate", auth, simulateLimit, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const { scenario, cmcId } = parseBody(SimulateRequest, req.body);
    const row = await deps.evaluator.simulate(user, scenario, cmcId);
    res.status(201).json({ alert: toAlertRecord(row), deliveries: await deliveriesFor([row.id]) });
  });

  r.post("/alerts/read-all", auth, async (req, res) => {
    await deps.repo.markRead((req as AuthedRequest).user.id, null);
    res.json({ ok: true });
  });

  r.get("/alerts/:id", auth, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const row = await deps.repo.alertById(user.id, String(req.params.id));
    if (!row) throw new HttpError(404, "not_found", "No such alert");
    res.json({ alert: toAlertRecord(row), deliveries: await deliveriesFor([row.id]) });
  });

  r.post("/alerts/:id/read", auth, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const id = String(req.params.id);
    if (!(await deps.repo.alertById(user.id, id))) throw new HttpError(404, "not_found", "No such alert");
    await deps.repo.markRead(user.id, id);
    res.json({ ok: true });
  });

  r.get("/alerts/:id/explain", auth, explainLimit, explainGlobal, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const row = await deps.repo.alertById(user.id, String(req.params.id));
    if (!row) throw new HttpError(404, "not_found", "No such alert");
    res.json(await deps.evaluator.explainAlert(user, row));
  });

  r.get("/alerts/:id/actions", auth, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const { fraction } = parseBody(ActionQuery, req.query);
    const row = await deps.repo.alertById(user.id, String(req.params.id));
    if (!row) throw new HttpError(404, "not_found", "No such alert");
    if (user.preferences.protectionLevel < 2) {
      const body: ActionResponse = { level: user.preferences.protectionLevel, suggestions: [], unavailableReason: "Protection level 1 is alert-only. Raise it to level 2 in Settings to get swap suggestions.", disclaimer: DISCLAIMER };
      res.json(body);
      return;
    }
    const holdings = await deps.repo.holdingsOf(user.id);
    const ids = [...new Set([...holdings.map((h) => h.cmcId), ...PEGGED_IDS])];
    const [meta, quotes, categories] = await Promise.all([deps.market.ensureMeta([...PEGGED_IDS, ...holdings.map((h) => h.cmcId)]), deps.market.quotesFor(ids), deps.market.categories()]);
    const stableTargets = STABLE_ORDER.map((id) => meta.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
    res.json(buildActions({ alert: { kind: row.kind as never, cmcId: row.cmcId, context: row.context }, holdings, meta, quotes, categories, preferences: user.preferences, stableTargets, peggedUsdIds: PEGGED_IDS, fraction, now: deps.now(), maxQuoteAgeMs: deps.maxQuoteAgeMs() }));
  });

  return r;
}
