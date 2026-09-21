const DIGITS = /^[0-9]+$/;
const MAX_DECIMALS = 255;

export function toDecimalAmount(raw: string, decimals: number): number {
  if (typeof raw !== "string" || !DIGITS.test(raw)) throw new Error(`raw amount is not a non-negative integer string: ${JSON.stringify(raw)}`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) throw new Error(`decimals out of range: ${decimals}`);
  const value = BigInt(raw);
  if (value === 0n) return 0;
  const unit = 10n ** BigInt(decimals);
  const whole = value / unit;
  const fraction = value % unit;
  const text = decimals === 0 ? whole.toString() : `${whole}.${fraction.toString().padStart(decimals, "0")}`;
  const amount = Number(text);
  if (!Number.isFinite(amount)) throw new Error(`amount does not fit in a number: ${raw} with ${decimals} decimals`);
  return amount;
}
