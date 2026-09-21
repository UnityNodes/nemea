export function pct(value: number, digits = 1): string {
  const abs = Math.abs(value);
  const d = abs >= 10 ? 0 : digits;
  return `${value < 0 ? "-" : value > 0 ? "+" : ""}${abs.toFixed(d)}%`;
}

export function pctAbs(value: number): string {
  const abs = Math.abs(value);
  return `${abs.toFixed(abs >= 10 ? 0 : 1)}%`;
}

export function usd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${Math.round(value).toLocaleString("en-US")}`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(3)}`;
}

export function multiple(pctChange: number): string {
  const m = 1 + pctChange / 100;
  return `${m >= 10 ? Math.round(m) : m.toFixed(1)}x`;
}
