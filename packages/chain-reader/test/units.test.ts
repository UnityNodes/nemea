import { describe, expect, it } from "vitest";
import { toDecimalAmount } from "../src/index.ts";

describe("toDecimalAmount", () => {
  it("returns 0 for a zero raw amount at any decimals", () => {
    expect(toDecimalAmount("0", 18)).toBe(0);
    expect(toDecimalAmount("0", 6)).toBe(0);
    expect(toDecimalAmount("0", 0)).toBe(0);
  });

  it("handles a 1e28-scale raw value with 18 decimals", () => {
    expect(toDecimalAmount("10000000000000000000000000000", 18)).toBe(1e10);
  });

  it("handles 6, 9 and 0 decimals", () => {
    expect(toDecimalAmount("37192124", 6)).toBe(37.192124);
    expect(toDecimalAmount("1", 6)).toBe(0.000001);
    expect(toDecimalAmount("1500000000", 9)).toBe(1.5);
    expect(toDecimalAmount("42", 0)).toBe(42);
  });

  it("keeps the fraction of an 18-decimal value instead of dividing floats", () => {
    expect(toDecimalAmount("6712603153701629485", 18)).toBe(Number("6.712603153701629485"));
    expect(toDecimalAmount("12345678901234567890123456789", 18)).toBe(Number("12345678901.234567890123456789"));
    expect(toDecimalAmount("1", 18)).toBe(1e-18);
  });

  it("handles values wider than a double can hold exactly", () => {
    expect(toDecimalAmount("115792089237316195423570985008687907853269984665640564039457584007913129639935", 18)).toBeGreaterThan(1e58);
  });

  it.each(["-1", "-0", "1.5", "", " 1", "1 ", "abc", "0x10", "1e18", "١٢٣"])("rejects the non-integer raw string %j", (raw) => {
    expect(() => toDecimalAmount(raw, 18)).toThrow(/non-negative integer/);
  });

  it("rejects a non-string raw value", () => {
    expect(() => toDecimalAmount(5 as unknown as string, 18)).toThrow(/non-negative integer/);
  });

  it.each([-1, 1.5, 256, Number.NaN, Number.POSITIVE_INFINITY])("rejects decimals %s", (decimals) => {
    expect(() => toDecimalAmount("1", decimals)).toThrow(/decimals out of range/);
  });

  it("rejects an amount that does not fit in a number instead of returning Infinity", () => {
    expect(() => toDecimalAmount(`1${"0".repeat(400)}`, 0)).toThrow(/does not fit/);
  });
});
