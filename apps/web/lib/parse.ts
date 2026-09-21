export function parsePositive(raw: string): number | null {
  const cleaned = raw.trim().replace(/[,\s_]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function isBlank(raw: string): boolean {
  return raw.trim() === "";
}

export function toInputString(value: number): string {
  const plain = value.toString();
  if (!plain.includes("e")) return plain;
  return value.toFixed(18).replace(/0+$/, "").replace(/\.$/, "");
}
