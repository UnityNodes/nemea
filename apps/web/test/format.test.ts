import { describe, expect, it } from "vitest";
import { MISSING, cadenceLabel, changeTone, durationPhrase, formatAmount, formatPct, formatUsd, hitRatio, relativeTime, shortAddress } from "../lib/format.ts";
import { isBlank, parsePositive, toInputString } from "../lib/parse.ts";

describe("formatUsd", () => {
  it("renders missing values as a dash, never zero", () => {
    expect(formatUsd(null)).toBe(MISSING);
    expect(formatUsd(undefined)).toBe(MISSING);
    expect(formatUsd(Number.NaN)).toBe(MISSING);
  });

  it("formats normal amounts with two decimals", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });

  it("keeps enough digits for sub-dollar prices", () => {
    expect(formatUsd(0.9987)).toBe("$0.9987");
    expect(formatUsd(0.00001234)).toBe("$0.00001234");
    expect(formatUsd(0.5)).toBe("$0.50");
  });
});

describe("formatPct", () => {
  it("signs positive and negative changes", () => {
    expect(formatPct(3.4567)).toBe("+3.46%");
    expect(formatPct(-12.3)).toBe("-12.30%");
  });

  it("never shows a signed zero", () => {
    expect(formatPct(0)).toBe("0.00%");
    expect(formatPct(-0.001)).toBe("0.00%");
  });

  it("renders missing as a dash", () => {
    expect(formatPct(null)).toBe(MISSING);
  });
});

describe("formatAmount", () => {
  it("scales precision with size", () => {
    expect(formatAmount(1234.56789)).toBe("1,234.57");
    expect(formatAmount(1.234567)).toBe("1.2346");
    expect(formatAmount(0.000123456789)).toBe("0.00012346");
    expect(formatAmount(null)).toBe(MISSING);
  });
});

describe("changeTone", () => {
  it("separates up, down, flat and unknown", () => {
    expect(changeTone(2)).toBe("up");
    expect(changeTone(-2)).toBe("down");
    expect(changeTone(0.001)).toBe("flat");
    expect(changeTone(null)).toBe("unknown");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it("describes recent, minute, hour and day gaps", () => {
    expect(relativeTime(ago(10), now)).toBe("just now");
    expect(relativeTime(ago(120), now)).toBe("2 min ago");
    expect(relativeTime(ago(3 * 3600), now)).toBe("3 h ago");
    expect(relativeTime(ago(30 * 3600), now)).toBe("yesterday");
    expect(relativeTime(ago(4 * 86400), now)).toBe("4 d ago");
  });

  it("handles future timestamps and bad input", () => {
    expect(relativeTime(new Date(now + 5 * 60 * 1000).toISOString(), now)).toBe("in 5 min");
    expect(relativeTime(null, now)).toBe(MISSING);
    expect(relativeTime("not a date", now)).toBe(MISSING);
  });
});

describe("cadence wording", () => {
  it("turns seconds into plain phrases", () => {
    expect(durationPhrase(30)).toBe("30 seconds");
    expect(durationPhrase(60)).toBe("1 minute");
    expect(durationPhrase(300)).toBe("5 minutes");
    expect(durationPhrase(7200)).toBe("2 hours");
    expect(cadenceLabel(60)).toBe("every minute");
    expect(cadenceLabel(240)).toBe("every 4 minutes");
    expect(cadenceLabel(0)).toBe(MISSING);
  });
});

describe("hitRatio", () => {
  it("is unknown with no traffic and a percentage otherwise", () => {
    expect(hitRatio(0, 0)).toBeNull();
    expect(hitRatio(3, 1)).toBe(75);
  });
});

describe("shortAddress", () => {
  it("shortens long addresses only", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    expect(shortAddress("0x12")).toBe("0x12");
  });
});

describe("parsePositive", () => {
  it("accepts grouped numbers and rejects zero, negatives and junk", () => {
    expect(parsePositive("1,250.5")).toBe(1250.5);
    expect(parsePositive(" 0.002 ")).toBe(0.002);
    expect(parsePositive("0")).toBeNull();
    expect(parsePositive("-3")).toBeNull();
    expect(parsePositive("abc")).toBeNull();
    expect(parsePositive("")).toBeNull();
    expect(isBlank("  ")).toBe(true);
  });

  it("round-trips tiny values without exponent notation", () => {
    expect(toInputString(0.0000001)).toBe("0.0000001");
    expect(toInputString(12.5)).toBe("12.5");
  });
});
