import { timingSafeEqual } from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { CmcAuthError, CmcError, CmcPlanError, CmcRateLimitError, CmcTimeoutError } from "@nemea/cmc-client";
import type { Chain, WalletImportPreview } from "@nemea/shared-types";
import type { Config } from "./config.ts";
import { HttpError, WindowRateLimiter, clientIp, errorHandler } from "./http.ts";
import { SessionManager } from "./auth/session.ts";
import type { DeliveryService } from "./services/delivery/index.ts";
import type { Evaluator } from "./services/evaluator.ts";
import type { MarketService } from "./services/market.ts";
import type { Poller } from "./services/poller.ts";
import type { Repo, UserRow } from "./services/repo.ts";
import { alertRoutes } from "./routes/alerts.ts";
import { authRoutes } from "./routes/auth.ts";
import { channelRoutes } from "./routes/channels.ts";
import { internalRoutes } from "./routes/internal.ts";
import { portfolioRoutes } from "./routes/portfolio.ts";
import { statusRoutes } from "./routes/status.ts";

export type AppDeps = {
  config: Config;
  repo: Repo;
  market: MarketService;
  evaluator: Evaluator;
  delivery: DeliveryService;
  poller: Poller | null;
  sessions: SessionManager;
  walletReader: (address: string, chains: Chain[]) => Promise<WalletImportPreview>;
  ping: () => Promise<void>;
  log: (message: string, error?: unknown) => void;
  now: () => Date;
  telegramConfigured: boolean;
  emailSend: ((to: string, subject: string, html: string, text: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | null;
  pushPublicKey: string | null;
};

export type AuthedRequest = Request & { user: UserRow };

export function limiter(limit: number, windowMs: number, keyOf: (req: Request) => string, now: () => number) {
  const rl = new WindowRateLimiter(limit, windowMs, now);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!rl.take(keyOf(req))) return next(new HttpError(429, "rate_limited", "Too many requests, slow down a little"));
    next();
  };
}

export function requireUser(deps: AppDeps) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const id = await deps.sessions.userIdFrom(req);
      const user = id ? await deps.repo.userById(id) : null;
      if (!user) throw new HttpError(401, "unauthenticated", "Sign in or continue as guest first");
      (req as AuthedRequest).user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function requireInternal(secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token || !safeEqual(token, secret)) return next(new HttpError(401, "unauthorized", "Missing or wrong internal secret"));
    next();
  };
}

function upstream(error: unknown): HttpError | null {
  if (error instanceof CmcRateLimitError) return new HttpError(503, "upstream_rate_limited", "The market data provider is rate-limiting Nemea right now. Try again in a minute.");
  if (error instanceof CmcTimeoutError) return new HttpError(504, "upstream_timeout", "The market data provider did not answer in time.");
  if (error instanceof CmcAuthError) return new HttpError(502, "upstream_auth", "Nemea's market data key was rejected. This is a server problem, not yours.");
  if (error instanceof CmcPlanError) return new HttpError(502, "upstream_plan", "This data is not available on Nemea's current market data plan.");
  if (error instanceof CmcError) return new HttpError(502, "upstream_error", "The market data provider returned an error.");
  return null;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  const webOrigin = new URL(deps.config.WEB_ORIGIN).origin;

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.path.startsWith("/internal/")) {
      const origin = req.headers.origin;
      if (origin && origin !== webOrigin) return next(new HttpError(403, "bad_origin", "Cross-site request refused"));
    }
    next();
  });
  app.use(express.json({ limit: "64kb" }));

  app.use(statusRoutes(deps));
  app.use(authRoutes(deps));
  app.use(portfolioRoutes(deps));
  app.use(alertRoutes(deps));
  app.use(channelRoutes(deps));
  app.use(internalRoutes(deps));

  app.use((_req, _res, next) => next(new HttpError(404, "not_found", "No such endpoint")));
  const handler = errorHandler(deps.log);
  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    const mapped = upstream(error);
    if (mapped) deps.log(`upstream failure on ${req.method} ${req.path}`, error);
    handler(mapped ?? error, req, res, next);
  });
  return app;
}

export { clientIp };
