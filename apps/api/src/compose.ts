import { CmcClient } from "@nemea/cmc-client";
import { defaultProviders, readWallet } from "@nemea/chain-reader";
import type { Chain, WalletImportPreview } from "@nemea/shared-types";
import { sql } from "drizzle-orm";
import { SessionManager } from "./auth/session.ts";
import type { AppDeps } from "./app.ts";
import { MAX_QUOTE_AGE_MS, type Config } from "./config.ts";
import { openDb, type DbHandle } from "./db/client.ts";
import { DeliveryService } from "./services/delivery/index.ts";
import { EmailSender } from "./services/delivery/email.ts";
import { PushSender } from "./services/delivery/push.ts";
import { TelegramSender } from "./services/delivery/telegram.ts";
import { Evaluator } from "./services/evaluator.ts";
import { MarketService } from "./services/market.ts";
import { Poller } from "./services/poller.ts";
import { Repo } from "./services/repo.ts";

export type ComposeOverrides = {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  handle?: DbHandle;
  walletReader?: AppDeps["walletReader"];
  log?: (message: string, error?: unknown) => void;
  poller?: boolean;
};

export type Composed = { deps: AppDeps; handle: DbHandle; poller: Poller | null; stop: () => Promise<void> };

export function defaultLog(message: string, error?: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : error !== undefined ? String(error) : "";
  console.error(`[nemea-api] ${message}${detail ? ` — ${detail}` : ""}`);
}

export async function compose(config: Config, overrides: ComposeOverrides = {}): Promise<Composed> {
  const log = overrides.log ?? defaultLog;
  const now = overrides.now ?? (() => new Date());
  const handle = overrides.handle ?? (await openDb({ databaseUrl: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR }));
  const cmc = new CmcClient({ apiKey: config.CMC_API_KEY, baseUrl: config.CMC_BASE_URL, fetchImpl: overrides.fetchImpl, now: now === undefined ? undefined : () => now().getTime() });
  const repo = new Repo(handle.db, now);
  const market = new MarketService(handle.db, cmc, now);
  const telegram = config.TELEGRAM_BOT_TOKEN ? new TelegramSender(config.TELEGRAM_BOT_TOKEN, overrides.fetchImpl) : null;
  const email = config.RESEND_API_KEY && config.EMAIL_FROM ? new EmailSender(config.RESEND_API_KEY, config.EMAIL_FROM, overrides.fetchImpl) : null;
  const push = config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && config.VAPID_SUBJECT ? new PushSender(config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY, config.VAPID_SUBJECT) : null;
  const delivery = new DeliveryService(repo, { telegram, email, push }, config.WEB_ORIGIN, log, now, config.ADMIN_TELEGRAM_CHAT_ID ?? null);
  const ageRef: { fn: () => number } = { fn: () => MAX_QUOTE_AGE_MS };
  const maxQuoteAgeMs = () => ageRef.fn();
  const evaluator = new Evaluator(repo, market, delivery, log, now, maxQuoteAgeMs);
  const poller = overrides.poller === false || !config.POLLER_ENABLED ? null : new Poller(handle.db, repo, market, evaluator, delivery, log, now);
  if (poller) ageRef.fn = () => poller.maxQuoteAgeMs();
  const providers = defaultProviders({ etherscanApiKey: config.ETHERSCAN_API_KEY, fetchImpl: overrides.fetchImpl });
  const walletReader =
    overrides.walletReader ??
    ((address: string, chains: Chain[]): Promise<WalletImportPreview> => readWallet({ address, chains, providers, cmc }));

  const deps: AppDeps = {
    config,
    repo,
    market,
    evaluator,
    delivery,
    poller,
    sessions: new SessionManager(config.SESSION_SECRET, config.WEB_ORIGIN.startsWith("https://")),
    walletReader,
    ping: async () => {
      await handle.db.execute(sql`select 1`);
    },
    log,
    now,
    maxQuoteAgeMs,
    telegramConfigured: !!telegram,
    emailSend: email ? (to, subject, html, text) => email.send(to, subject, html, text) : null,
    pushPublicKey: push?.publicKey ?? null,
  };
  return {
    deps,
    handle,
    poller,
    stop: async () => {
      poller?.stop();
      await handle.close();
    },
  };
}
