import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotError } from "grammy";
import { DISCLAIMER } from "@nemea/shared-types";
import type { FetchFn } from "../src/api-client.ts";
import { escapeHtml } from "../src/format.ts";
import { harness, jsonResponse, textUpdate } from "./helpers.ts";

const SEED = "abandon ability able about above absent absorb abstract absurd abuse access accident";

const LINKED = {
  linked: true,
  portfolioValueUsd: 12345.678,
  change24hPct: 1.234,
  holdings: 5,
  alertsThisWeek: 2,
  weeklyCap: 10,
  lastAlertAt: "2026-09-20T14:05:33.000Z",
  dashboardUrl: "https://app.nemea.test/dashboard",
};

function route(response: () => Response | Promise<Response>) {
  return vi.fn<FetchFn>(async () => response());
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("/start with a code", () => {
  it("links the chat through the API and confirms in HTML", async () => {
    const fetchFn = route(() => jsonResponse(200, { ok: true }));
    const h = harness(fetchFn);
    await h.send(textUpdate("/start ABC123"));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("http://api.test/internal/telegram/link");
    expect(JSON.parse(String(init.body))).toEqual({ code: "ABC123", chatId: "100", username: "alice" });

    const [sent] = h.callsTo("sendMessage");
    expect(sent?.payload["chat_id"]).toBe(100);
    expect(sent?.payload["parse_mode"]).toBe("HTML");
    expect(String(sent?.payload["text"])).toContain("Linked as @alice");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("sends a null username when the Telegram user has none", async () => {
    const fetchFn = route(() => jsonResponse(200, { ok: true }));
    const h = harness(fetchFn);
    await h.send(textUpdate("/start ABC123", { username: null }));
    expect(JSON.parse(String(fetchFn.mock.calls[0]![1].body))).toMatchObject({ username: null });
    expect(h.messages()[0]).not.toContain("@");
  });

  it("escapes a hostile username in the confirmation", async () => {
    const h = harness(route(() => jsonResponse(200, { ok: true })));
    await h.send(textUpdate("/start ABC123", { username: "<b>x</b>&" }));
    expect(h.messages()[0]).toContain(escapeHtml("<b>x</b>&"));
    expect(h.messages()[0]).not.toContain("<b>x</b>");
  });

  it("says the code is invalid on 404 invalid_code", async () => {
    const h = harness(route(() => jsonResponse(404, { error: { code: "invalid_code", message: "no such code" } })));
    await h.send(textUpdate("/start WRONG"));
    expect(h.messages()).toHaveLength(1);
    expect(h.messages()[0]).toContain("not recognized");
    expect(h.messages()[0]).not.toContain("Linked");
  });

  it("says the code expired on 410 expired_code", async () => {
    const h = harness(route(() => jsonResponse(410, { error: { code: "expired_code", message: "old" } })));
    await h.send(textUpdate("/start OLD"));
    expect(h.messages()[0]).toContain("expired");
  });

  it("replies with the unreachable message and logs the cause when the API is down", async () => {
    const h = harness(vi.fn<FetchFn>().mockRejectedValue(new TypeError("fetch failed")));
    await h.send(textUpdate("/start ABC123"));
    expect(h.messages()).toEqual(["Nemea is unreachable right now, try again in a minute."]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[1])).toContain("fetch failed");
  });

  it("surfaces a malformed 200 as an error message, not as a link", async () => {
    const h = harness(route(() => jsonResponse(200, { unexpected: true })));
    await h.send(textUpdate("/start ABC123"));
    expect(h.messages()).toHaveLength(1);
    expect(h.messages()[0]).toContain("could not understand");
    expect(h.messages()[0]).not.toContain("Linked");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call the API for a code with illegal characters", async () => {
    const fetchFn = route(() => jsonResponse(200, { ok: true }));
    const h = harness(fetchFn);
    await h.send(textUpdate("/start not a code"));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(h.messages()[0]).toContain("not recognized");
  });
});

describe("/start without a code", () => {
  it("explains linking in three lines with the disclaimer and calls no API", async () => {
    const fetchFn = route(() => jsonResponse(200, {}));
    const h = harness(fetchFn);
    await h.send(textUpdate("/start"));
    expect(fetchFn).not.toHaveBeenCalled();
    const text = h.messages()[0] ?? "";
    const lines = text.split("\n");
    expect(lines.slice(0, 3).map((line) => line.slice(0, 2))).toEqual(["1.", "2.", "3."]);
    expect(text).toContain("Settings → Telegram");
    expect(text).toContain("/start CODE");
    expect(text).toContain(escapeHtml(DISCLAIMER));
  });

  it("links the dashboard when PUBLIC_WEB_URL is set", async () => {
    const h = harness(route(() => jsonResponse(200, {})), { publicWebUrl: "https://app.nemea.test" });
    await h.send(textUpdate("/start"));
    expect(h.messages()[0]).toContain('<a href="https://app.nemea.test">');
  });
});

describe("/status", () => {
  it("shows n/a for null numbers and never a fake zero", async () => {
    const h = harness(
      route(() =>
        jsonResponse(200, { ...LINKED, portfolioValueUsd: null, change24hPct: null, lastAlertAt: null }),
      ),
    );
    await h.send(textUpdate("/status"));
    const text = h.messages()[0] ?? "";
    expect(text).toContain("Portfolio value: n/a");
    expect(text).toContain("24h change: n/a");
    expect(text).toContain("Alerts this week: 2 of 10");
    expect(text).toContain("Last alert: none yet");
    expect(text).toContain("Holdings: 5");
    expect(text).not.toContain("$0");
    expect(text).not.toContain("0.00%");
    expect(text).toContain('<a href="https://app.nemea.test/dashboard">Open dashboard</a>');
  });

  it("formats value, signed change and last alert time", async () => {
    const fetchFn = route(() => jsonResponse(200, LINKED));
    const h = harness(fetchFn);
    await h.send(textUpdate("/status", { chatId: 555 }));
    const text = h.messages()[0] ?? "";
    expect(fetchFn.mock.calls[0]![0]).toBe("http://api.test/internal/telegram/summary?chatId=555");
    expect(text).toContain("Portfolio value: $12,345.68");
    expect(text).toContain("24h change: +1.23%");
    expect(text).toContain("Last alert: 2026-09-20 14:05 UTC");
  });

  it("says so when the chat is not linked", async () => {
    const h = harness(route(() => jsonResponse(200, { linked: false })));
    await h.send(textUpdate("/status"));
    expect(h.messages()[0]).toContain("not linked");
  });

  it("replies with the unreachable message when the API answers 503", async () => {
    const h = harness(route(() => new Response("down", { status: 503 })));
    await h.send(textUpdate("/status"));
    expect(h.messages()).toEqual(["Nemea is unreachable right now, try again in a minute."]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("does not render numbers from a malformed linked summary", async () => {
    const h = harness(route(() => jsonResponse(200, { ...LINKED, holdings: "five" })));
    await h.send(textUpdate("/status"));
    expect(h.messages()[0]).toContain("could not understand");
    expect(h.messages()[0]).not.toContain("Holdings");
  });
});

describe("/stop", () => {
  it("confirms when the chat was linked", async () => {
    const fetchFn = route(() => jsonResponse(200, { ok: true, wasLinked: true }));
    const h = harness(fetchFn);
    await h.send(textUpdate("/stop"));
    expect(JSON.parse(String(fetchFn.mock.calls[0]![1].body))).toEqual({ chatId: "100" });
    expect(h.messages()[0]).toContain("Unlinked");
  });

  it("is polite when the chat was not linked", async () => {
    const h = harness(route(() => jsonResponse(200, { ok: true, wasLinked: false })));
    await h.send(textUpdate("/stop"));
    expect(h.messages()[0]).toContain("was not linked");
  });

  it("replies with an error message when the API is down", async () => {
    const h = harness(vi.fn<FetchFn>().mockRejectedValue(new Error("ECONNREFUSED")));
    await h.send(textUpdate("/stop"));
    expect(h.messages()).toEqual(["Nemea is unreachable right now, try again in a minute."]);
  });
});

describe("/help and unknown text", () => {
  it("lists commands, the non-custodial promise and the disclaimer", async () => {
    const h = harness(route(() => jsonResponse(200, {})));
    await h.send(textUpdate("/help"));
    const text = h.messages()[0] ?? "";
    for (const command of ["/start", "/status", "/stop", "/help"]) expect(text).toContain(command);
    expect(text).toContain("Nemea is non-custodial: I will never ask for your seed phrase or private keys");
    expect(text).toContain("Not financial advice.");
  });

  it("answers plain text with a hint instead of staying silent", async () => {
    const h = harness(route(() => jsonResponse(200, {})));
    await h.send(textUpdate("hello there"));
    expect(h.messages()[0]).toContain("/help");
  });
});

describe("private chats only", () => {
  it("ignores every command and message in groups and supergroups", async () => {
    const fetchFn = route(() => jsonResponse(200, { ok: true }));
    const h = harness(fetchFn);
    for (const chatType of ["group", "supergroup"] as const) {
      await h.send(textUpdate("/start ABC123", { chatId: -500, chatType }));
      await h.send(textUpdate("/status", { chatId: -500, chatType }));
      await h.send(textUpdate("/stop", { chatId: -500, chatType }));
      await h.send(textUpdate("/help", { chatId: -500, chatType }));
      await h.send(textUpdate(SEED, { chatId: -500, chatType }));
    }
    expect(fetchFn).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  it("ignores channel posts", async () => {
    const fetchFn = route(() => jsonResponse(200, { ok: true }));
    const h = harness(fetchFn);
    await h.send({
      update_id: 900,
      channel_post: {
        message_id: 1,
        date: 1_700_000_000,
        chat: { id: -1001, type: "channel", title: "News" },
        text: "/status",
        entities: [{ type: "bot_command", offset: 0, length: 7 }],
      },
    } as never);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });
});

describe("seed phrase safety", () => {
  it("warns, deletes the message and never echoes it", async () => {
    const fetchFn = route(() => jsonResponse(200, { ok: true }));
    const h = harness(fetchFn);
    const update = textUpdate(SEED);
    await h.send(update);

    const [deleted] = h.callsTo("deleteMessage");
    expect(deleted?.payload).toMatchObject({ chat_id: 100, message_id: update.message?.message_id });
    expect(h.messages()).toHaveLength(1);
    const text = h.messages()[0] ?? "";
    expect(text).toContain("Never share your seed phrase");
    expect(text).toContain("I deleted your message");
    for (const word of SEED.split(" ")) expect(text).not.toContain(word);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("still warns, tells the user to delete it, and logs when the delete fails", async () => {
    const h = harness(route(() => jsonResponse(200, { ok: true })), { failMethods: ["deleteMessage"] });
    await h.send(textUpdate(SEED));

    expect(h.messages()).toHaveLength(1);
    expect(h.messages()[0]).toContain("Delete it yourself");
    expect(h.messages()[0]).not.toContain("I deleted your message");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("could not delete");
    for (const call of errorSpy.mock.calls) {
      for (const word of SEED.split(" ")) expect(JSON.stringify(call.map(String))).not.toContain(word);
    }
  });

  it("catches a phrase pasted after /start without linking anything", async () => {
    const fetchFn = route(() => jsonResponse(200, { ok: true }));
    const h = harness(fetchFn);
    await h.send(textUpdate(`/start ${SEED}`));
    expect(h.messages()[0]).toContain("Never share your seed phrase");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("negative control: a normal twelve-plus word sentence is not treated as a seed phrase", async () => {
    const h = harness(route(() => jsonResponse(200, { ok: true })));
    await h.send(textUpdate("Hello, my name is Alice and I would like to know about my portfolio status today."));
    expect(h.callsTo("deleteMessage")).toHaveLength(0);
    expect(h.messages()[0]).not.toContain("seed phrase");
    expect(h.messages()[0]).toContain("/help");
  });
});

describe("handler errors", () => {
  it("rejects handleUpdate with a BotError when the reply itself cannot be sent", async () => {
    const h = harness(route(() => jsonResponse(200, { linked: false })), { failMethods: ["sendMessage"] });
    await expect(h.send(textUpdate("/status"))).rejects.toBeInstanceOf(BotError);
  });

  it("logs the failure through bot.catch while polling and keeps the bot alive", async () => {
    const h = harness(route(() => jsonResponse(200, { linked: false })), { failMethods: ["sendMessage"] });
    h.pending.push(textUpdate("/status"));
    const started = h.bot.start();
    await vi.waitFor(() => {
      expect(errorSpy.mock.calls.some((call) => String(call[0]).includes("unhandled error"))).toBe(true);
    });
    await h.bot.stop();
    await expect(started).resolves.toBeUndefined();
  });
});
