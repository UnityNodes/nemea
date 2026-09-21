import type { Update, UserFromGetMe } from "grammy/types";
import { InternalApiClient, type FetchFn } from "../src/api-client.ts";
import { createBot } from "../src/bot.ts";

export const BOT_INFO: UserFromGetMe = {
  id: 999,
  is_bot: true,
  first_name: "Nemea",
  username: "nemea_test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

export const TEST_TOKEN = "7770001112:AAFakeTokenForTestsOnly_abc-123";

export function leakyNetworkError(method: string): Error {
  return new Error(`request to https://api.telegram.org/bot${TEST_TOKEN}/${method} failed, reason: socket hang up (token ${TEST_TOKEN})`);
}

export type OutboundCall = { method: string; payload: Record<string, unknown> };

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let nextUpdateId = 1;

export function textUpdate(
  text: string,
  options: { chatId?: number; chatType?: "private" | "group" | "supergroup"; username?: string | null } = {},
): Update {
  const { chatId = 100, chatType = "private", username = "alice" } = options;
  const id = nextUpdateId++;
  const chat =
    chatType === "private"
      ? { id: chatId, type: "private", first_name: "Alice" }
      : { id: chatId, type: chatType, title: "Some group" };
  const command = text.startsWith("/") ? text.split(/\s/)[0] ?? "" : null;
  return {
    update_id: id,
    message: {
      message_id: id + 1000,
      date: 1_700_000_000,
      chat,
      from: {
        id: 42,
        is_bot: false,
        first_name: "Alice",
        ...(username === null ? {} : { username }),
      },
      text,
      ...(command === null ? {} : { entities: [{ type: "bot_command", offset: 0, length: command.length }] }),
    },
  } as Update;
}

export type HarnessOptions = {
  publicWebUrl?: string | null;
  failMethods?: string[];
  throwMethods?: string[];
};

export function harness(fetchFn: FetchFn, options: HarnessOptions = {}) {
  const { publicWebUrl = null, failMethods = [], throwMethods = [] } = options;
  const api = new InternalApiClient({ origin: "http://api.test", secret: "s3cret", fetch: fetchFn });
  const bot = createBot({ token: TEST_TOKEN, api, publicWebUrl, botInfo: BOT_INFO });
  const calls: OutboundCall[] = [];
  const pending: Update[] = [];

  bot.api.config.use(async (_prev, method, payload) => {
    if (method === "getUpdates") {
      if (pending.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true, result: pending.splice(0) } as never;
    }
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (throwMethods.includes(method)) throw leakyNetworkError(method);
    if (failMethods.includes(method)) {
      return { ok: false, error_code: 400, description: `Bad Request: ${method} refused` } as never;
    }
    if (method === "sendMessage") {
      const body = payload as { chat_id: number; text: string };
      return {
        ok: true,
        result: { message_id: 1, date: 0, chat: { id: body.chat_id, type: "private" }, text: body.text },
      } as never;
    }
    return { ok: true, result: true } as never;
  });

  return {
    bot,
    calls,
    pending,
    send: (update: Update) => bot.handleUpdate(update),
    messages: () =>
      calls.filter((call) => call.method === "sendMessage").map((call) => String(call.payload["text"])),
    callsTo: (method: string) => calls.filter((call) => call.method === method),
  };
}
