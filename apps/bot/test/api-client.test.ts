import { describe, expect, it, vi } from "vitest";
import {
  ApiProtocolError,
  ApiUnreachableError,
  InternalApiClient,
  REQUEST_TIMEOUT_MS,
  type FetchFn,
} from "../src/api-client.ts";
import { jsonResponse } from "./helpers.ts";

function clientWith(fetchFn: FetchFn, timeoutMs?: number) {
  return new InternalApiClient({
    origin: "http://api.test/",
    secret: "s3cret",
    fetch: fetchFn,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

function stub(response: () => Response | Promise<Response>) {
  return vi.fn<FetchFn>(async () => response());
}

const LINKED = {
  linked: true,
  portfolioValueUsd: 1000.5,
  change24hPct: -2.5,
  holdings: 3,
  alertsThisWeek: 1,
  weeklyCap: 10,
  lastAlertAt: "2026-09-20T14:05:33.000Z",
  dashboardUrl: "https://app.nemea.test/dashboard",
};

describe("InternalApiClient requests", () => {
  it("posts the link body with bearer auth and a timeout signal", async () => {
    const fetchFn = stub(() => jsonResponse(200, { ok: true }));
    await clientWith(fetchFn).link({ code: "ABC", chatId: "100", username: null });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("http://api.test/internal/telegram/link");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toMatchObject({
      authorization: "Bearer s3cret",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({ code: "ABC", chatId: "100", username: null });
    expect(REQUEST_TIMEOUT_MS).toBe(8000);
  });

  it("sends the summary chat id as an encoded query parameter", async () => {
    const fetchFn = stub(() => jsonResponse(200, { linked: false }));
    await clientWith(fetchFn).summary("-100 1&x");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("http://api.test/internal/telegram/summary?chatId=-100+1%26x");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.headers).toMatchObject({ authorization: "Bearer s3cret" });
  });

  it("posts the unlink body", async () => {
    const fetchFn = stub(() => jsonResponse(200, { ok: true, wasLinked: true }));
    await clientWith(fetchFn).unlink("100");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("http://api.test/internal/telegram/unlink");
    expect(JSON.parse(String(init.body))).toEqual({ chatId: "100" });
  });
});

describe("link outcomes", () => {
  it("maps 200, 404 invalid_code and 410 expired_code", async () => {
    const input = { code: "ABC", chatId: "1", username: "a" };
    expect(await clientWith(stub(() => jsonResponse(200, { ok: true }))).link(input)).toBe("linked");
    expect(
      await clientWith(
        stub(() => jsonResponse(404, { error: { code: "invalid_code", message: "no" } })),
      ).link(input),
    ).toBe("invalid_code");
    expect(
      await clientWith(
        stub(() => jsonResponse(410, { error: { code: "expired_code", message: "old" } })),
      ).link(input),
    ).toBe("expired_code");
  });

  it("does not call a 404 with another error code an invalid code", async () => {
    const client = clientWith(stub(() => jsonResponse(404, { error: { code: "not_found", message: "x" } })));
    await expect(client.link({ code: "A", chatId: "1", username: null })).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it("does not call a 404 with an html body an invalid code", async () => {
    const client = clientWith(stub(() => new Response("<html>nope</html>", { status: 404 })));
    await expect(client.link({ code: "A", chatId: "1", username: null })).rejects.toThrow(/status 404/);
  });

  it("treats 401 as a protocol error and 5xx as unreachable", async () => {
    const input = { code: "A", chatId: "1", username: null };
    await expect(clientWith(stub(() => new Response("no", { status: 401 }))).link(input)).rejects.toBeInstanceOf(
      ApiProtocolError,
    );
    await expect(clientWith(stub(() => new Response("down", { status: 503 }))).link(input)).rejects.toBeInstanceOf(
      ApiUnreachableError,
    );
  });

  it("rejects a 200 whose body is not the contract", async () => {
    const input = { code: "A", chatId: "1", username: null };
    await expect(clientWith(stub(() => jsonResponse(200, { ok: "yes" }))).link(input)).rejects.toBeInstanceOf(
      ApiProtocolError,
    );
    await expect(clientWith(stub(() => new Response("OK", { status: 200 }))).link(input)).rejects.toThrow(
      /not JSON/,
    );
  });
});

describe("transport failures", () => {
  it("wraps a rejected fetch and keeps the cause", async () => {
    const cause = new TypeError("fetch failed");
    const client = clientWith(vi.fn<FetchFn>().mockRejectedValue(cause));
    const error = await client.unlink("1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiUnreachableError);
    expect((error as Error).cause).toBe(cause);
    expect((error as Error).message).toContain("fetch failed");
  });

  it("does not leak the secret into error messages", async () => {
    const client = clientWith(vi.fn<FetchFn>().mockRejectedValue(new Error("boom")));
    const error = await client.unlink("1").catch((e: unknown) => e);
    expect(String((error as Error).message)).not.toContain("s3cret");
  });

  it("aborts a request that outlives the timeout", async () => {
    const hang: FetchFn = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const error = await clientWith(hang, 25).summary("1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiUnreachableError);
    expect((error as Error).message).toMatch(/TimeoutError/);
  });
});

describe("unlink and summary parsing", () => {
  it("returns wasLinked as reported", async () => {
    expect(await clientWith(stub(() => jsonResponse(200, { ok: true, wasLinked: false }))).unlink("1")).toEqual({
      wasLinked: false,
    });
  });

  it("rejects an unlink body without wasLinked", async () => {
    await expect(clientWith(stub(() => jsonResponse(200, { ok: true }))).unlink("1")).rejects.toBeInstanceOf(
      ApiProtocolError,
    );
  });

  it("parses unlinked and linked summaries, keeping nulls as null", async () => {
    expect(await clientWith(stub(() => jsonResponse(200, { linked: false }))).summary("1")).toEqual({
      linked: false,
    });
    const withNulls = { ...LINKED, portfolioValueUsd: null, change24hPct: null, lastAlertAt: null };
    expect(await clientWith(stub(() => jsonResponse(200, withNulls))).summary("1")).toEqual(withNulls);
  });

  it("rejects a summary with wrong types instead of coercing", async () => {
    const wrong = { ...LINKED, portfolioValueUsd: "1000" };
    await expect(clientWith(stub(() => jsonResponse(200, wrong))).summary("1")).rejects.toThrow(
      /portfolioValueUsd/,
    );
  });

  it("rejects a summary that omits a nullable field rather than inventing null", async () => {
    const { change24hPct: _omitted, ...missing } = LINKED;
    await expect(clientWith(stub(() => jsonResponse(200, missing))).summary("1")).rejects.toThrow(/change24hPct/);
  });

  it("rejects a summary with a non-http dashboard url", async () => {
    const wrong = { ...LINKED, dashboardUrl: "javascript:alert(1)" };
    await expect(clientWith(stub(() => jsonResponse(200, wrong))).summary("1")).rejects.toThrow(/dashboardUrl/);
  });

  it("rejects an unknown linked value", async () => {
    await expect(clientWith(stub(() => jsonResponse(200, { linked: "maybe" }))).summary("1")).rejects.toBeInstanceOf(
      ApiProtocolError,
    );
  });
});
