import { AlertPreferences } from "@nemea/shared-types";

export type NumericPrefKey =
  | "drop1hPct"
  | "drop24hPct"
  | "portfolioDropPct"
  | "depegFloorUsd"
  | "volumeSpikeMultiple"
  | "stableVolumeMultiple"
  | "volumeDryUpPct"
  | "nearLowWithinPct"
  | "categoryDropPct";

export type PrefUnit = "pct" | "usd" | "times";

export type PrefField = { key: NumericPrefKey; label: string; help: string; step: number; unit: PrefUnit };

export const MAIN_FIELDS: PrefField[] = [
  { key: "drop1hPct", label: "Fast drop", help: "Alert me when a coin falls this much within one hour.", step: 1, unit: "pct" },
  { key: "drop24hPct", label: "Daily drop", help: "Alert me when a coin falls this much within a day.", step: 1, unit: "pct" },
  { key: "portfolioDropPct", label: "Whole portfolio drop", help: "Alert me when everything together falls this much.", step: 1, unit: "pct" },
  { key: "depegFloorUsd", label: "Stablecoin floor", help: "Alert me when a stablecoin trades below this price.", step: 0.001, unit: "usd" },
  { key: "volumeSpikeMultiple", label: "Trading surge", help: "Alert me when trading volume is this many times its usual level.", step: 1, unit: "times" },
];

export const MORE_FIELDS: PrefField[] = [
  { key: "stableVolumeMultiple", label: "Stablecoin trading surge", help: "Unusual trading in a stablecoin you hold, as a multiple of normal.", step: 1, unit: "times" },
  { key: "volumeDryUpPct", label: "Trading dries up", help: "Alert me when volume falls by this much.", step: 1, unit: "pct" },
  { key: "nearLowWithinPct", label: "Close to a recent low", help: "Alert me when a coin is within this distance of its low.", step: 1, unit: "pct" },
  { key: "categoryDropPct", label: "Whole sector drop", help: "Alert me when a sector your coins belong to falls this much.", step: 1, unit: "pct" },
];

export function rangeOf(key: NumericPrefKey): { min: number; max: number } {
  const check = AlertPreferences.shape[key];
  const min = check.minValue;
  const max = check.maxValue;
  if (min === null || max === null) throw new Error(`Preference ${key} has no range in the shared schema`);
  return { min, max };
}

export function weeklyCapRange(): { min: number; max: number } {
  const check = AlertPreferences.shape.weeklyCap;
  const min = check.minValue;
  const max = check.maxValue;
  if (min === null || max === null) throw new Error("weeklyCap has no range in the shared schema");
  return { min, max };
}

export function formatPref(unit: PrefUnit, value: number): string {
  if (unit === "usd") return `$${value.toFixed(3)}`;
  if (unit === "times") return `${value}×`;
  return `${value}%`;
}
