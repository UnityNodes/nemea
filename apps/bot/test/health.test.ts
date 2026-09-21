import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Bot, GrammyError, HttpError } from "grammy";
import {
  HealthState,
  createHealthServer,
  describeStartFailure,
  superviseBot,
} from "../src/health.ts";
import { BOT_INFO, TEST_TOKEN, leakyNetworkError } from "./helpers.ts";

let errorSpy: ReturnType<typeof vi.spyOn>;
const servers: Server[] = [];

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  errorSpy.mockRestore();
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function listen(state: HealthState): Promise<string> {
  const server = createHealthServer(state);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function health(base: string) {
  const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
  return { status: res.status, body: (await res.json()) as unknown };
}

describe("health server", () => {
  it("reports not ok before the bot has started", async () => {
    const base = await listen(new HealthState());
    expect(await health(base)).toEqual({
      status: 503,
      body: { ok: false, bot: "not_running", reason: "starting" },
    });
  });

  it("stays not ok until onStart is reached, then reports running without a reason", async () => {
    const state = new HealthState();
    const base = await listen(state);
    let reachStart!: () => void;
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const supervised = superviseBot(async (onStart) => {
      reachStart = onStart;
      await finished;
    }, state, TEST_TOKEN);

    expect((await health(base)).body).toMatchObject({ ok: false, bot: "not_running" });
    reachStart();
    expect(await health(base)).toEqual({ status: 200, body: { ok: true, bot: "running" } });

    finish();
    await supervised;
    expect(await health(base)).toEqual({
      status: 503,
      body: { ok: false, bot: "not_running", reason: "bot stopped" },
    });
  });

  it("reports the reason after a rejected start and keeps serving", async () => {
    const state = new HealthState();
    const base = await listen(state);
    await superviseBot(() => Promise.reject(new Error("boom")), state, TEST_TOKEN);
    expect(await health(base)).toEqual({
      status: 503,
      body: { ok: false, bot: "not_running", reason: "bot is not running: Error: boom" },
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("answers 404 for other paths and 405 for other methods", async () => {
    const base = await listen(new HealthState());
    expect((await fetch(`${base}/`, { signal: AbortSignal.timeout(2000) })).status).toBe(404);
    const post = await fetch(`${base}/health`, { method: "POST", signal: AbortSignal.timeout(2000) });
    expect(post.status).toBe(405);
  });
});

describe("token redaction", () => {
  it("never puts the bot token in /health or in console output when the start fails on the network", async () => {
    const state = new HealthState();
    const base = await listen(state);
    const failure = new HttpError("Network request for 'getMe' failed!", leakyNetworkError("getMe"));
    await superviseBot(() => Promise.reject(failure), state, TEST_TOKEN);

    const { body } = await health(base);
    expect(JSON.stringify(body)).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(body)).not.toContain(TEST_TOKEN.split(":")[1]);
    expect(JSON.stringify(body)).toContain("bot<redacted>");
    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TEST_TOKEN.split(":")[1]);
  });

  it("redacts a token carried in the cause chain of a plain error", async () => {
    const state = new HealthState();
    await superviseBot(
      () => Promise.reject(new Error("start failed", { cause: leakyNetworkError("getUpdates") })),
      state,
      TEST_TOKEN,
    );
    expect(state.snapshot().reason).toContain("start failed");
    expect(JSON.stringify(state.snapshot())).not.toContain(TEST_TOKEN);
  });
});

describe("start failures against a real grammY bot", () => {
  it("turns a 404 on getMe into the token-rejected reason", async () => {
    const bot = new Bot("123:invalid");
    bot.api.config.use(async (_prev, method) => {
      if (method === "getMe") return { ok: false, error_code: 404, description: "Not Found" } as never;
      return { ok: true, result: true } as never;
    });
    const state = new HealthState();
    await superviseBot((onStart) => bot.start({ onStart: () => onStart() }), state, TEST_TOKEN);

    const reason =
      "TELEGRAM_BOT_TOKEN rejected by Telegram (404 on getMe) — check the token from @BotFather";
    expect(state.snapshot()).toEqual({ ok: false, bot: "not_running", reason });
    expect(errorSpy).toHaveBeenCalledWith(`[bot] ${reason}`);
  });

  it("reports running only once bot.start reaches onStart", async () => {
    const bot = new Bot("123:fake", { botInfo: BOT_INFO });
    bot.api.config.use(async (_prev, method) => {
      if (method === "getUpdates") return { ok: true, result: [] } as never;
      return { ok: true, result: true } as never;
    });
    const state = new HealthState();
    expect(state.snapshot().ok).toBe(false);

    let seenAtStart: unknown = null;
    await superviseBot(
      (onStart) =>
        bot.start({
          onStart: () => {
            onStart();
            seenAtStart = state.snapshot();
            void bot.stop();
          },
        }),
      state,
      TEST_TOKEN,
    );

    expect(seenAtStart).toEqual({ ok: true, bot: "running" });
    expect(state.snapshot()).toEqual({ ok: false, bot: "not_running", reason: "bot stopped" });
  });
});

describe("describeStartFailure", () => {
  it("recognises a rejected token by 401 as well", () => {
    const error = new GrammyError("x", { ok: false, error_code: 401, description: "Unauthorized" }, "getMe", {});
    expect(describeStartFailure(error, TEST_TOKEN)).toContain("TELEGRAM_BOT_TOKEN rejected by Telegram (401 on getMe)");
  });

  it("does not blame the token for other failures", () => {
    const error = new GrammyError("x", { ok: false, error_code: 409, description: "Conflict" }, "getUpdates", {});
    expect(describeStartFailure(error, TEST_TOKEN)).not.toContain("TELEGRAM_BOT_TOKEN");
    expect(describeStartFailure(new Error("network down"), TEST_TOKEN)).toBe("bot is not running: Error: network down");
  });
});
