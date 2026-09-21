export const MISSING = "—";

const usdStandard = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const clock = new Intl.DateTimeFormat("en-US", { timeStyle: "medium" });
const dayMonth = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatUsd(value: number | null | undefined): string {
  if (!isNumber(value)) return MISSING;
  const abs = Math.abs(value);
  if (abs >= 1 || abs === 0) return usdStandard.format(value);
  const digits = Math.min(8, Math.max(4, Math.ceil(-Math.log10(abs)) + 3));
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
}

export function formatUsdWhole(value: number | null | undefined): string {
  if (!isNumber(value)) return MISSING;
  return usdWhole.format(value);
}

export function formatAmount(value: number | null | undefined): string {
  if (!isNumber(value)) return MISSING;
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export function formatInt(value: number | null | undefined): string {
  if (!isNumber(value)) return MISSING;
  return integer.format(value);
}

export function formatPct(value: number | null | undefined, digits = 2): string {
  if (!isNumber(value)) return MISSING;
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  const body = new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "exceptZero" }).format(rounded);
  return `${body}%`;
}

export type Tone = "up" | "down" | "flat" | "unknown";

export function changeTone(value: number | null | undefined): Tone {
  if (!isNumber(value)) return "unknown";
  if (value > 0.005) return "up";
  if (value < -0.005) return "down";
  return "flat";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return MISSING;
  return dateTime.format(new Date(t));
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return MISSING;
  return clock.format(new Date(t));
}

export function relativeTime(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return MISSING;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return MISSING;
  const diff = (nowMs - t) / 1000;
  const future = diff < 0;
  const s = Math.abs(diff);
  const wrap = (body: string) => (future ? `in ${body}` : `${body} ago`);
  if (s < 45) return future ? "in a moment" : "just now";
  if (s < 90) return wrap("1 min");
  if (s < 45 * 60) return wrap(`${Math.round(s / 60)} min`);
  if (s < 90 * 60) return wrap("1 h");
  if (s < 22 * 3600) return wrap(`${Math.round(s / 3600)} h`);
  if (s < 36 * 3600) return future ? "tomorrow" : "yesterday";
  if (s < 30 * 86400) return wrap(`${Math.round(s / 86400)} d`);
  return dayMonth.format(new Date(t));
}

export function durationPhrase(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return MISSING;
  if (seconds < 60) {
    const n = Math.round(seconds);
    return n === 1 ? "1 second" : `${n} seconds`;
  }
  if (seconds < 5400) {
    const n = Math.round(seconds / 60);
    return n === 1 ? "1 minute" : `${n} minutes`;
  }
  const n = Math.round(seconds / 3600);
  return n === 1 ? "1 hour" : `${n} hours`;
}

export function cadenceLabel(seconds: number): string {
  const phrase = durationPhrase(seconds);
  if (phrase === MISSING) return MISSING;
  if (phrase.startsWith("1 ")) return `every ${phrase.slice(2)}`;
  return `every ${phrase}`;
}

export function formatMs(ms: number | null | undefined): string {
  if (!isNumber(ms)) return MISSING;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function hitRatio(hits: number, misses: number): number | null {
  const total = hits + misses;
  if (total <= 0) return null;
  return (hits / total) * 100;
}
