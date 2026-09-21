import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { EmailChannelRequest, PushSubscriptionRequest, type TelegramLinkCode } from "@nemea/shared-types";
import { limiter, requireUser, type AppDeps, type AuthedRequest } from "../app.ts";
import { HttpError, parseBody } from "../http.ts";
import { escapeHtml } from "../services/delivery/format.ts";
import { channelsView } from "./auth.ts";

const LINK_TTL_MS = 10 * 60_000;
const EMAIL_TTL_MS = 24 * 3600_000;
const VerifyBody = z.object({ token: z.string().min(16).max(128) });
const PushDelete = z.object({ endpoint: z.string().url().optional() });

export function channelRoutes(deps: AppDeps): Router {
  const r = Router();
  const auth = requireUser(deps);
  const now = () => deps.now().getTime();
  const userKey = (req: unknown) => (req as AuthedRequest).user.id;
  const linkLimit = limiter(5, 10 * 60_000, userKey, now);
  const emailLimit = limiter(3, 3600_000, userKey, now);
  const emailTargetLimit = limiter(2, 3600_000, (req) => String((req.body as { email?: unknown } | undefined)?.email ?? "").toLowerCase(), now);

  r.get("/channels", auth, async (req, res) => {
    res.json(await channelsView(deps, (req as AuthedRequest).user));
  });

  r.post("/channels/telegram/link-code", auth, linkLimit, async (req, res) => {
    if (!deps.telegramConfigured) throw new HttpError(503, "telegram_unavailable", "Telegram is not configured on this server");
    const user = (req as AuthedRequest).user;
    const code = randomBytes(6).toString("base64url");
    const expiresAt = await deps.repo.createToken("telegram_link", code, LINK_TTL_MS, user.id);
    const bot = deps.config.TELEGRAM_BOT_USERNAME;
    const body: TelegramLinkCode = { code, deepLink: bot ? `https://t.me/${bot}?start=${code}` : null, expiresAt: expiresAt.toISOString() };
    res.status(201).json(body);
  });

  r.delete("/channels/telegram", auth, async (req, res) => {
    await deps.repo.unlinkTelegram((req as AuthedRequest).user.id);
    res.json({ ok: true });
  });

  r.post("/channels/email", auth, emailLimit, emailTargetLimit, async (req, res) => {
    if (!deps.emailSend) throw new HttpError(503, "email_unavailable", "Email is not configured on this server");
    const user = (req as AuthedRequest).user;
    const { email } = parseBody(EmailChannelRequest, req.body);
    const token = randomBytes(24).toString("base64url");
    await deps.repo.setEmail(user.id, email.toLowerCase(), false);
    await deps.repo.createToken("email_verify", token, EMAIL_TTL_MS, user.id, email.toLowerCase());
    const link = `${deps.config.WEB_ORIGIN.replace(/\/$/, "")}/verify-email?token=${token}`;
    const sent = await deps.emailSend(
      email,
      "Confirm your email for Nemea",
      `<p>Confirm this address to get Nemea's daily digest and critical alerts.</p><p><a href="${escapeHtml(link)}">Confirm my email</a></p><p style="color:#666;font-size:12px">If you did not ask for this, ignore this message.</p>`,
      `Confirm your email for Nemea: ${link}\n\nIf you did not ask for this, ignore this message.`,
    );
    if (!sent.ok) {
      deps.log(`verification email failed: ${sent.reason}`);
      throw new HttpError(502, "email_failed", "The confirmation email could not be sent. Check the address and try again.");
    }
    res.status(202).json({ ok: true });
  });

  r.post("/channels/email/verify", async (req, res) => {
    const { token } = parseBody(VerifyBody, req.body);
    const used = await deps.repo.consumeToken("email_verify", token);
    if (used.status !== "ok" || !used.userId || !used.payload) throw new HttpError(400, used.status === "expired" ? "expired_token" : "invalid_token", used.status === "expired" ? "This confirmation link has expired. Request a new one." : "This confirmation link is not valid.");
    const user = await deps.repo.userById(used.userId);
    if (!user || user.email !== used.payload) throw new HttpError(400, "invalid_token", "This confirmation link is no longer valid for the current address.");
    await deps.repo.setEmail(user.id, user.email, true);
    res.json({ ok: true });
  });

  r.delete("/channels/email", auth, async (req, res) => {
    await deps.repo.setEmail((req as AuthedRequest).user.id, null, false);
    res.json({ ok: true });
  });

  r.get("/channels/push/public-key", auth, (_req, res) => {
    res.json({ publicKey: deps.pushPublicKey });
  });

  r.post("/channels/push/subscribe", auth, async (req, res) => {
    if (!deps.pushPublicKey) throw new HttpError(503, "push_unavailable", "Browser push is not configured on this server");
    const sub = parseBody(PushSubscriptionRequest, req.body);
    await deps.repo.savePush((req as AuthedRequest).user.id, { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
    res.status(201).json({ ok: true });
  });

  r.delete("/channels/push", auth, async (req, res) => {
    const { endpoint } = parseBody(PushDelete, req.body ?? {});
    await deps.repo.deletePush((req as AuthedRequest).user.id, endpoint ?? null);
    res.json({ ok: true });
  });

  return r;
}
