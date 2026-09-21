import { describe, expect, it } from "vitest";
import { DISCLAIMER } from "@nemea/shared-types";
import { LinkedSummary } from "../src/contract.ts";
import {
  MAX_MESSAGE_CHARS,
  escapeHtml,
  formatPct,
  formatTime,
  formatUsd,
  helpMessage,
  linkedMessage,
  seedPhraseWarning,
  startInstructions,
  statusMessage,
} from "../src/format.ts";
import { looksLikeSeedPhrase } from "../src/safety.ts";

describe("escapeHtml", () => {
  it("escapes markup characters and ampersands", () => {
    expect(escapeHtml("<b>x</b>&")).toBe("&lt;b&gt;x&lt;/b&gt;&amp;");
  });

  it("escapes ampersands first so entities are not double-decoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("escapes double quotes for attribute use", () => {
    expect(escapeHtml('a"b')).toBe("a&quot;b");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("alice_99")).toBe("alice_99");
  });
});

describe("formatters", () => {
  it("renders null as n/a and never as zero", () => {
    expect(formatUsd(null)).toBe("n/a");
    expect(formatPct(null)).toBe("n/a");
  });

  it("formats usd with grouping and two decimals", () => {
    expect(formatUsd(12345.678)).toBe("$12,345.68");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("signs percentages", () => {
    expect(formatPct(1.234)).toBe("+1.23%");
    expect(formatPct(-4.5)).toBe("-4.50%");
    expect(formatPct(0)).toBe("0.00%");
    expect(formatPct(-0.001)).toBe("0.00%");
  });

  it("formats time in UTC and handles no alert yet", () => {
    expect(formatTime("2026-09-20T14:05:33.000Z")).toBe("2026-09-20 14:05 UTC");
    expect(formatTime("2026-09-20T16:05:00+02:00")).toBe("2026-09-20 14:05 UTC");
    expect(formatTime(null)).toBe("none yet");
  });
});

describe("message builders", () => {
  it("escapes a hostile username in the link confirmation", () => {
    const text = linkedMessage("<b>x</b>&");
    expect(text).toContain("&lt;b&gt;x&lt;/b&gt;&amp;");
    expect(text).not.toContain("<b>x</b>");
  });

  it("omits the username when there is none", () => {
    expect(linkedMessage(null)).not.toContain("@");
  });

  it("instructions are three numbered lines plus the disclaimer", () => {
    const lines = startInstructions(null).split("\n");
    expect(lines[0]).toMatch(/^1\. /);
    expect(lines[1]).toMatch(/^2\. /);
    expect(lines[2]).toMatch(/^3\. /);
    expect(startInstructions(null)).toContain(escapeHtml(DISCLAIMER));
  });

  it("instructions link the dashboard when a web url is configured", () => {
    expect(startInstructions("https://app.nemea.test/?a=1&b=2")).toContain(
      '<a href="https://app.nemea.test/?a=1&amp;b=2">',
    );
  });

  it("help states the non-custodial promise and the disclaimer", () => {
    const text = helpMessage();
    expect(text).toContain("Nemea is non-custodial: I will never ask for your seed phrase or private keys");
    expect(text).toContain("Not financial advice.");
  });

  it("keeps the worst-case status message under the size limit", () => {
    const summary = LinkedSummary.parse({
      linked: true,
      portfolioValueUsd: 1e15,
      change24hPct: -99.99,
      holdings: 1_000_000,
      alertsThisWeek: 1_000_000,
      weeklyCap: 1_000_000,
      lastAlertAt: "2026-09-20T14:05:33.000Z",
      dashboardUrl: `https://x.io/?${"&".repeat(486)}`,
    });
    expect(summary.dashboardUrl).toHaveLength(500);
    expect(statusMessage(summary).length).toBeLessThan(MAX_MESSAGE_CHARS);
    expect(seedPhraseWarning(false).length).toBeLessThan(MAX_MESSAGE_CHARS);
  });
});

const TWELVE = "abandon ability able about above absent absorb abstract absurd abuse access accident";

describe("looksLikeSeedPhrase", () => {
  it("flags twelve lowercase 3-8 letter words", () => {
    expect(looksLikeSeedPhrase(TWELVE)).toBe(true);
  });

  it("flags twenty-four words split over lines and tabs", () => {
    const words = `${TWELVE} ${TWELVE}`.split(" ");
    expect(looksLikeSeedPhrase(words.join("\n"))).toBe(true);
    expect(looksLikeSeedPhrase(words.join("\t"))).toBe(true);
  });

  it("flags a phrase pasted after a command", () => {
    expect(looksLikeSeedPhrase(`/start ${TWELVE}`)).toBe(true);
  });

  it("does not flag eleven words", () => {
    expect(looksLikeSeedPhrase(TWELVE.split(" ").slice(0, 11).join(" "))).toBe(false);
  });

  it("does not flag a normal sentence with capitals and punctuation", () => {
    expect(
      looksLikeSeedPhrase("Hello, my name is Alice and I would like to know about my portfolio today."),
    ).toBe(false);
  });

  it("does not flag when any word is outside 3-8 lowercase letters", () => {
    const words = TWELVE.split(" ");
    expect(looksLikeSeedPhrase([...words.slice(0, 11), "ab"].join(" "))).toBe(false);
    expect(looksLikeSeedPhrase([...words.slice(0, 11), "abcdefghi"].join(" "))).toBe(false);
    expect(looksLikeSeedPhrase([...words.slice(0, 11), "Abandon"].join(" "))).toBe(false);
    expect(looksLikeSeedPhrase([...words.slice(0, 11), "abandon,"].join(" "))).toBe(false);
  });

  it("does not flag empty text or a bare command", () => {
    expect(looksLikeSeedPhrase("")).toBe(false);
    expect(looksLikeSeedPhrase("   ")).toBe(false);
    expect(looksLikeSeedPhrase("/status")).toBe(false);
  });
});
