import { report, requireEnv, sleep, timedJson, type Check } from "./lib.ts";

const { TELEGRAM_BOT_TOKEN } = requireEnv("Gate C", ["TELEGRAM_BOT_TOKEN"]);
const api = (method: string) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
const checks: Check[] = [];

type TgResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

const me = await timedJson(api("getMe"));
const meBody = me.body as TgResponse<{ id: number; username: string }>;
if (me.status === 404 || !meBody?.ok) {
  checks.push({
    name: "getMe",
    status: "fail",
    detail: `HTTP ${me.status} ${meBody?.description ?? ""} — Telegram answers 401 or 404 on getMe when the token belongs to no bot (regenerate it in @BotFather)`,
  });
  report("Gate C", checks);
}
checks.push({ name: "getMe", status: "pass", detail: `@${meBody.result?.username} in ${me.ms}ms` });

let chatId = process.env.TELEGRAM_CHAT_ID;
if (!chatId) {
  const updates = await timedJson(api("getUpdates?limit=20"));
  const body = updates.body as TgResponse<Array<{ message?: { chat: { id: number; first_name?: string; username?: string } } }>>;
  const chats = new Map<number, string>();
  for (const u of body.result ?? []) {
    if (u.message) chats.set(u.message.chat.id, u.message.chat.username ?? u.message.chat.first_name ?? "?");
  }
  if (chats.size === 0) {
    checks.push({
      name: "discover chat id",
      status: "not-run" as const,
      detail: `no chats yet — open t.me/${meBody.result?.username}, press Start, rerun (or set TELEGRAM_CHAT_ID)`,
    });
    report("Gate C", checks);
  }
  console.log("chats that messaged the bot:", [...chats.entries()].map(([id, n]) => `${id} (${n})`).join(", "));
  chatId = String([...chats.keys()][0]);
  checks.push({ name: "discover chat id", status: "pass", detail: `using ${chatId}` });
}

const text = [
  "<b>Nemea — Gate C test alert</b>",
  "This is a test message. If you can read it, delivery works.",
  "",
  "<i>Not financial advice.</i>",
].join("\n");
const sent = await timedJson(api("sendMessage"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
});
const sentBody = sent.body as TgResponse<{ message_id: number }>;
if (!sentBody?.ok) {
  checks.push({ name: "sendMessage", status: "fail", detail: `HTTP ${sent.status} ${sentBody?.description ?? ""}` });
  report("Gate C", checks);
}
checks.push({
  name: "sendMessage",
  status: "pass",
  detail: `message_id ${sentBody.result?.message_id} in ${sent.ms}ms (Telegram accepted it; confirm on your phone that it arrived)`,
});

await sleep(300);
const long = "x".repeat(5000);
const tooLong = await timedJson(api("sendMessage"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: chatId, text: long }),
});
const tooLongBody = tooLong.body as TgResponse<unknown>;
checks.push({
  name: "negative control: 5000-char message is rejected",
  status: tooLongBody?.ok === false ? "pass" : "fail",
  detail: tooLongBody?.ok === false ? `rejected as expected (${tooLongBody.description})` : "Telegram accepted an over-limit message — assumption about the 4096 limit is wrong",
});

report("Gate C", checks);
