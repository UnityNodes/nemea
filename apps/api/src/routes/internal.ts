import { Router } from "express";
import { z } from "zod";
import { InternalTelegramLink } from "@nemea/shared-types";
import { requireInternal, type AppDeps } from "../app.ts";
import { HttpError, parseBody } from "../http.ts";

const Unlink = z.object({ chatId: z.string().min(1) });
const SummaryQuery = z.object({ chatId: z.string().min(1) });

export function internalRoutes(deps: AppDeps): Router {
  const r = Router();
  r.use("/internal", requireInternal(deps.config.INTERNAL_API_SECRET));

  r.post("/internal/telegram/link", async (req, res) => {
    const { code, chatId, username } = parseBody(InternalTelegramLink, req.body);
    const used = await deps.repo.consumeToken("telegram_link", code);
    if (used.status === "expired") throw new HttpError(410, "expired_code", "This link code has expired. Create a new one in Nemea.");
    if (used.status !== "ok" || !used.userId) throw new HttpError(404, "invalid_code", "This link code is not valid or was already used.");
    await deps.repo.linkTelegram(used.userId, chatId, username);
    res.json({ ok: true });
  });

  r.post("/internal/telegram/unlink", async (req, res) => {
    const { chatId } = parseBody(Unlink, req.body);
    const user = await deps.repo.userByTelegramChat(chatId);
    if (user) await deps.repo.unlinkTelegram(user.id);
    res.json({ ok: true, wasLinked: !!user });
  });

  r.get("/internal/telegram/summary", async (req, res) => {
    const { chatId } = parseBody(SummaryQuery, req.query);
    const user = await deps.repo.userByTelegramChat(chatId);
    if (!user) {
      res.json({ linked: false });
      return;
    }
    const value = await deps.evaluator.portfolioValue(user.id);
    const week = await deps.repo.alertsThisWeek(user.id);
    res.json({
      linked: true,
      portfolioValueUsd: value.valueUsd,
      change24hPct: value.change24hPct,
      holdings: value.holdings,
      alertsThisWeek: week.count,
      weeklyCap: user.preferences.weeklyCap,
      lastAlertAt: week.lastAt?.toISOString() ?? null,
      dashboardUrl: deps.config.WEB_ORIGIN,
    });
  });

  return r;
}
