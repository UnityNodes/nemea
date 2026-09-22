import { z } from "zod";

export const ALERT_KINDS = [
  "price_drop_1h",
  "price_drop_24h",
  "below_cost_basis",
  "near_low",
  "depeg",
  "stable_volume_anomaly",
  "volume_spike",
  "volume_dry_up",
  "category_rotation",
  "portfolio_drop",
  "rwa_drift",
] as const;
export const AlertKind = z.enum(ALERT_KINDS);
export type AlertKind = z.infer<typeof AlertKind>;

export const Severity = z.enum(["info", "warning", "critical"]);
export type Severity = z.infer<typeof Severity>;

export const ProtectionLevel = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type ProtectionLevel = z.infer<typeof ProtectionLevel>;

export const AlertPreferences = z.object({
  drop1hPct: z.number().min(1).max(90),
  drop24hPct: z.number().min(1).max(90),
  depegFloorUsd: z.number().min(0.5).max(0.999),
  stableVolumeMultiple: z.number().min(2).max(100),
  volumeSpikeMultiple: z.number().min(2).max(100),
  volumeDryUpPct: z.number().min(30).max(99),
  portfolioDropPct: z.number().min(2).max(90),
  nearLowWithinPct: z.number().min(1).max(50),
  categoryDropPct: z.number().min(2).max(90),
  rwaDriftPct: z.number().min(1).max(50),
  weeklyCap: z.number().int().min(1).max(3),
  protectionLevel: ProtectionLevel,
  telegram: z.boolean(),
  email: z.boolean(),
  push: z.boolean(),
});
export type AlertPreferences = z.infer<typeof AlertPreferences>;

export const DEFAULT_PREFERENCES: AlertPreferences = {
  drop1hPct: 8,
  drop24hPct: 15,
  depegFloorUsd: 0.98,
  stableVolumeMultiple: 10,
  volumeSpikeMultiple: 5,
  volumeDryUpPct: 70,
  portfolioDropPct: 10,
  nearLowWithinPct: 10,
  categoryDropPct: 10,
  rwaDriftPct: 3,
  weeklyCap: 3,
  protectionLevel: 1,
  telegram: true,
  email: true,
  push: true,
};

export const AlertFact = z.object({
  label: z.string(),
  value: z.string(),
});
export type AlertFact = z.infer<typeof AlertFact>;

export const ExplainSection = z.object({
  heading: z.string(),
  body: z.string(),
});
export type ExplainSection = z.infer<typeof ExplainSection>;

export const Explanation = z.object({
  headline: z.string(),
  sections: z.array(ExplainSection),
  calmNote: z.string(),
  dataGaps: z.array(z.string()),
});
export type Explanation = z.infer<typeof Explanation>;

export const AlertRecord = z.object({
  id: z.string(),
  kind: AlertKind,
  severity: Severity,
  cmcId: z.number().int().nullable(),
  symbol: z.string().nullable(),
  title: z.string(),
  summary: z.string(),
  facts: z.array(AlertFact),
  dedupeKey: z.string(),
  simulated: z.boolean(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
  disclaimer: z.string(),
});
export type AlertRecord = z.infer<typeof AlertRecord>;

export const DISCLAIMER =
  "Not financial advice. Nemea shows data and context; you decide what to do. Nothing happens to your funds unless you approve it in your own wallet.";
