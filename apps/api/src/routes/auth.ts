import { randomBytes } from "node:crypto";
import { Router } from "express";
import { isAddress, verifyMessage } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { SiweVerifyRequest, type ChannelsView, type MeView, type UserView } from "@nemea/shared-types";
import { limiter, requireUser, type AppDeps, type AuthedRequest } from "../app.ts";
import { HttpError, clientIp, parseBody } from "../http.ts";
import type { UserRow } from "../services/repo.ts";

const NONCE_TTL_MS = 10 * 60_000;

export function userView(u: UserRow): UserView {
  return { id: u.id, kind: u.kind, walletAddress: u.walletAddress, createdAt: u.createdAt.toISOString() };
}

export async function channelsView(deps: AppDeps, u: UserRow): Promise<ChannelsView> {
  const push = await deps.repo.pushOf(u.id);
  return {
    telegram: { linked: !!u.telegramChatId, username: u.telegramUsername },
    email: { address: u.email, verified: u.emailVerified },
    push: { subscribed: push.length > 0 },
    web: { enabled: true },
  };
}

export async function meView(deps: AppDeps, u: UserRow): Promise<MeView> {
  const avail = deps.delivery.channelsAvailable();
  return {
    user: userView(u),
    preferences: u.preferences,
    channels: await channelsView(deps, u),
    capabilities: { telegram: avail.telegram, email: avail.email, push: avail.push, wallets: true, autoSwap: false, telegramBot: deps.config.TELEGRAM_BOT_USERNAME ?? null },
  };
}

export function authRoutes(deps: AppDeps): Router {
  const r = Router();
  const now = () => deps.now().getTime();
  const guestLimit = limiter(20, 3600_000, clientIp, now);
  const nonceLimit = limiter(60, 3600_000, clientIp, now);
  const verifyLimit = limiter(30, 3600_000, clientIp, now);
  const domain = new URL(deps.config.WEB_ORIGIN).host;

  r.post("/auth/guest", guestLimit, async (req, res) => {
    const existingId = await deps.sessions.userIdFrom(req);
    const existing = existingId ? await deps.repo.userById(existingId) : null;
    if (existing) {
      res.json(await meView(deps, existing));
      return;
    }
    const user = await deps.repo.createUser("guest");
    await deps.sessions.issue(res, user.id);
    res.status(201).json(await meView(deps, user));
  });

  r.get("/auth/siwe/nonce", nonceLimit, async (_req, res) => {
    const nonce = randomBytes(12).toString("hex");
    await deps.repo.createToken("siwe_nonce", nonce, NONCE_TTL_MS);
    res.json({ nonce, domain, uri: deps.config.WEB_ORIGIN });
  });

  r.post("/auth/siwe/verify", verifyLimit, async (req, res) => {
    const { message, signature } = parseBody(SiweVerifyRequest, req.body);
    const parsed = parseSiweMessage(message);
    if (!parsed.address || !parsed.nonce || !isAddress(parsed.address)) throw new HttpError(400, "bad_siwe", "The sign-in message could not be read");
    const valid = validateSiweMessage({ message: parsed as Parameters<typeof validateSiweMessage>[0]["message"], domain, time: deps.now() });
    if (!valid) throw new HttpError(401, "bad_siwe", "The sign-in message is for another site or has expired");
    const nonce = await deps.repo.consumeToken("siwe_nonce", parsed.nonce);
    if (nonce.status !== "ok") throw new HttpError(401, "bad_nonce", "This sign-in link was already used or has expired. Try again.");
    let signedByAddress = false;
    try {
      signedByAddress = await verifyMessage({ address: parsed.address, message, signature: signature as `0x${string}` });
    } catch {
      signedByAddress = false;
    }
    if (!signedByAddress) throw new HttpError(401, "bad_signature", "The signature does not match this wallet. Smart-contract wallets are not supported yet.");
    const address = parsed.address.toLowerCase();

    const sessionId = await deps.sessions.userIdFrom(req);
    const sessionUser = sessionId ? await deps.repo.userById(sessionId) : null;
    const owner = await deps.repo.userByWallet(address);
    let user: UserRow;
    if (owner) {
      user = owner;
    } else if (sessionUser && sessionUser.kind === "guest") {
      await deps.repo.attachWallet(sessionUser.id, address);
      user = (await deps.repo.userById(sessionUser.id)) as UserRow;
    } else {
      user = await deps.repo.createUser("wallet", address);
    }
    await deps.sessions.issue(res, user.id);
    res.json(await meView(deps, user));
  });

  r.post("/auth/logout", (_req, res) => {
    deps.sessions.clear(res);
    res.json({ ok: true });
  });

  r.get("/me", requireUser(deps), async (req, res) => {
    res.json(await meView(deps, (req as AuthedRequest).user));
  });

  return r;
}
