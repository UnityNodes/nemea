import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app.ts";
import { compose, type Composed } from "../src/compose.ts";
import { loadConfig, type Config } from "../src/config.ts";
import { createFakeCmc, type FakeCmc } from "../src/dev/fake-cmc.ts";
import { openDb } from "../src/db/client.ts";

export type Outbound = { url: string; body: unknown };

export type Harness = {
  composed: Composed;
  fake: FakeCmc;
  baseUrl: string;
  clock: { t: number };
  telegram: Outbound[];
  emails: Outbound[];
  telegramFails: { next: { status: number; description: string } | null };
  log: Array<{ message: string; error?: unknown }>;
  close: () => Promise<void>;
  client: () => Client;
};

export type Client = {
  request: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: any; headers: Headers }>;
  cookie: () => string | null;
};

export const BOT_TOKEN = "123456:TEST";

export function testConfig(over: Record<string, string> = {}): Config {
  const r = loadConfig({
    NODE_ENV: "test",
    CMC_API_KEY: "test-key-123",
    CMC_BASE_URL: "http://cmc.test",
    SESSION_SECRET: "s".repeat(40),
    INTERNAL_API_SECRET: "internal-secret-1234",
    WEB_ORIGIN: "https://nemea.test",
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_BOT_USERNAME: "NemeaTestBot",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "Nemea <alerts@nemea.test>",
    POLLER_ENABLED: "false",
    ...over,
  });
  if (!r.ok) throw new Error(r.problems.join("; "));
  return r.config;
}

export async function startHarness(opts: { config?: Record<string, string>; walletReader?: (address: string, chains: any[]) => Promise<any> } = {}): Promise<Harness> {
  const clock = { t: Date.parse("2026-09-21T12:00:00.000Z") };
  const now = () => new Date(clock.t);
  const fake = createFakeCmc({ now });
  const telegram: Outbound[] = [];
  const emails: Outbound[] = [];
  const telegramFails: Harness["telegramFails"] = { next: null };
  const log: Harness["log"] = [];

  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(input);
    if (url.host === "cmc.test") return fake.fetchImpl(url, init);
    if (url.host === "api.telegram.org") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      telegram.push({ url: url.toString(), body });
      if (telegramFails.next) {
        const f = telegramFails.next;
        telegramFails.next = null;
        return new Response(JSON.stringify({ ok: false, description: f.description }), { status: f.status });
      }
      return new Response(JSON.stringify({ ok: true, result: { message_id: telegram.length } }), { status: 200 });
    }
    if (url.host === "api.resend.com") {
      emails.push({ url: url.toString(), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }
    throw new Error(`unexpected outbound request to ${url}`);
  }) as typeof fetch;

  const config = testConfig(opts.config);
  const handle = await openDb({});
  const composed = await compose(config, { fetchImpl, now, handle, walletReader: opts.walletReader, log: (message, error) => log.push({ message, error }), poller: false });
  const { Poller } = await import("../src/services/poller.ts");
  const poller = new Poller(handle.db, composed.deps.repo, composed.deps.market, composed.deps.evaluator, composed.deps.delivery, composed.deps.log, now);
  composed.deps.poller = poller;
  composed.poller = poller;
  const app = createApp(composed.deps);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const client = (): Client => {
    let cookie: string | null = null;
    return {
      cookie: () => cookie,
      request: async (method, path, body, headers = {}) => {
        const res = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const set = res.headers.get("set-cookie");
        if (set) {
          const pair = set.split(";")[0] as string;
          cookie = pair.endsWith("=") ? null : pair;
        }
        const text = await res.text();
        let parsed: unknown = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        return { status: res.status, body: parsed, headers: res.headers };
      },
    };
  };

  return {
    composed,
    fake,
    baseUrl,
    clock,
    telegram,
    emails,
    telegramFails,
    log,
    client,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await composed.stop();
    },
  };
}

export async function guest(h: Harness): Promise<Client> {
  const c = h.client();
  const r = await c.request("POST", "/auth/guest");
  if (r.status !== 201) throw new Error(`guest failed: ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}

export async function addHolding(c: Client, cmcId: number, amount: number, costBasisUsd?: number) {
  const r = await c.request("POST", "/portfolio/holdings", { cmcId, amount, ...(costBasisUsd !== undefined ? { costBasisUsd } : {}) });
  if (r.status !== 201) throw new Error(`add holding failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function linkTelegram(h: Harness, c: Client, chatId: string, username: string | null = "tester") {
  const code = await c.request("POST", "/channels/telegram/link-code");
  const res = await fetch(`${h.baseUrl}/internal/telegram/link`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer internal-secret-1234" },
    body: JSON.stringify({ code: code.body.code, chatId, username }),
  });
  if (res.status !== 200) throw new Error(`link failed ${res.status}`);
}
