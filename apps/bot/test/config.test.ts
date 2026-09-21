import { describe, expect, it } from "vitest";
import { DEFAULT_PORT, readConfig } from "../src/config.ts";

const VALID = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  API_ORIGIN: "http://localhost:4000",
  INTERNAL_API_SECRET: "s3cret",
};

describe("readConfig", () => {
  it("lists every missing required variable", () => {
    expect(readConfig({})).toEqual({
      ok: false,
      missing: ["TELEGRAM_BOT_TOKEN", "API_ORIGIN", "INTERNAL_API_SECRET"],
      invalid: [],
    });
  });

  it("lists only the ones that are missing", () => {
    const result = readConfig({ TELEGRAM_BOT_TOKEN: "123:abc" });
    expect(result).toEqual({ ok: false, missing: ["API_ORIGIN", "INTERNAL_API_SECRET"], invalid: [] });
  });

  it("treats blank values as missing", () => {
    const result = readConfig({ ...VALID, INTERNAL_API_SECRET: "   ", TELEGRAM_BOT_TOKEN: "" });
    expect(result).toMatchObject({ ok: false, missing: ["TELEGRAM_BOT_TOKEN", "INTERNAL_API_SECRET"] });
  });

  it("returns the config with defaults when everything required is set", () => {
    expect(readConfig(VALID)).toEqual({
      ok: true,
      config: {
        token: "123:abc",
        apiOrigin: "http://localhost:4000",
        internalSecret: "s3cret",
        publicWebUrl: null,
        port: DEFAULT_PORT,
      },
    });
    expect(DEFAULT_PORT).toBe(4100);
  });

  it("reads optional PUBLIC_WEB_URL and PORT", () => {
    const result = readConfig({ ...VALID, PUBLIC_WEB_URL: "https://app.nemea.test", PORT: "4555" });
    expect(result).toMatchObject({ ok: true, config: { publicWebUrl: "https://app.nemea.test", port: 4555 } });
  });

  it("rejects malformed values instead of guessing", () => {
    const result = readConfig({ ...VALID, API_ORIGIN: "not a url", PUBLIC_WEB_URL: "ftp://x", PORT: "70000" });
    expect(result).toEqual({
      ok: false,
      missing: [],
      invalid: [
        "API_ORIGIN must be an http(s) URL",
        "PUBLIC_WEB_URL must be an http(s) URL",
        "PORT must be an integer from 1 to 65535",
      ],
    });
    expect(readConfig({ ...VALID, PORT: "abc" })).toMatchObject({ ok: false });
    expect(readConfig({ ...VALID, PORT: "41.5" })).toMatchObject({ ok: false });
  });
});
