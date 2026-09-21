import { HttpError } from "grammy";
import { describe, expect, it } from "vitest";
import { describeError, redact } from "../src/redact.ts";
import { TEST_TOKEN, leakyNetworkError } from "./helpers.ts";

describe("redact", () => {
  it("replaces the token in a telegram url", () => {
    const text = `request to https://api.telegram.org/bot${TEST_TOKEN}/getMe failed`;
    expect(redact(text, TEST_TOKEN)).toBe("request to https://api.telegram.org/bot<redacted>/getMe failed");
  });

  it("replaces every occurrence of the bare token", () => {
    expect(redact(`a ${TEST_TOKEN} b ${TEST_TOKEN}`, TEST_TOKEN)).toBe("a <redacted> b <redacted>");
  });

  it("replaces any bot<id>:<secret> url pattern even for a different token", () => {
    expect(redact("GET /bot123456:ABC-def_9/sendMessage", TEST_TOKEN)).toBe("GET /bot<redacted>/sendMessage");
  });

  it("leaves text without secrets alone and tolerates an empty token", () => {
    expect(redact("nothing to see", TEST_TOKEN)).toBe("nothing to see");
    expect(redact("nothing to see", "")).toBe("nothing to see");
  });
});

describe("describeError", () => {
  it("logs name and message, never the raw object", () => {
    const text = describeError(new Error("boom"), TEST_TOKEN);
    expect(text).toBe("Error: boom");
  });

  it("follows HttpError.error and cause and redacts the token inside", () => {
    const http = new HttpError("Network request for 'getMe' failed!", leakyNetworkError("getMe"));
    const text = describeError(http, TEST_TOKEN);
    expect(text).toContain("HttpError: Network request for 'getMe' failed!");
    expect(text).toContain("socket hang up");
    expect(text).not.toContain(TEST_TOKEN);
    expect(text).not.toContain(TEST_TOKEN.split(":")[1]);

    const withCause = new Error("outer", { cause: leakyNetworkError("getUpdates") });
    expect(describeError(withCause, TEST_TOKEN)).not.toContain(TEST_TOKEN);
  });

  it("stringifies non-error values through redaction", () => {
    expect(describeError(`token ${TEST_TOKEN}`, TEST_TOKEN)).toBe("token <redacted>");
  });
});
