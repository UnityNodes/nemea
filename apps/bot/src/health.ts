import { createServer, type Server } from "node:http";
import { GrammyError } from "grammy";
import { describeError } from "./redact.ts";

export type HealthBody = {
  ok: boolean;
  bot: "running" | "not_running";
  reason?: string;
};

export class HealthState {
  #body: HealthBody = { ok: false, bot: "not_running", reason: "starting" };

  markRunning(): void {
    this.#body = { ok: true, bot: "running" };
  }

  markNotRunning(reason: string): void {
    this.#body = { ok: false, bot: "not_running", reason };
  }

  snapshot(): HealthBody {
    return { ...this.#body };
  }
}

export function createHealthServer(state: HealthState): Server {
  return createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== "/health") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { "content-type": "application/json", allow: "GET" });
      res.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }
    const body = state.snapshot();
    res.writeHead(body.ok ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
}

export function describeStartFailure(error: unknown, token: string): string {
  if (error instanceof GrammyError && error.method === "getMe" && (error.error_code === 404 || error.error_code === 401)) {
    return `TELEGRAM_BOT_TOKEN rejected by Telegram (${error.error_code} on getMe) — check the token from @BotFather`;
  }
  return `bot is not running: ${describeError(error, token)}`;
}

export type StartFn = (onStart: () => void) => Promise<void>;

export async function superviseBot(start: StartFn, state: HealthState, token: string): Promise<void> {
  try {
    await start(() => state.markRunning());
    state.markNotRunning("bot stopped");
  } catch (error) {
    const reason = describeStartFailure(error, token);
    console.error(`[bot] ${reason}`);
    state.markNotRunning(reason);
  }
}
