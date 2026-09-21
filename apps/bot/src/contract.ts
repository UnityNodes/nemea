import { z } from "zod";

export const LinkResponse = z.object({ ok: z.literal(true) });
export type LinkResponse = z.infer<typeof LinkResponse>;

export const UnlinkResponse = z.object({ ok: z.literal(true), wasLinked: z.boolean() });
export type UnlinkResponse = z.infer<typeof UnlinkResponse>;

export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

const DashboardUrl = z
  .string()
  .max(500)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "must be an http(s) url");

export const LinkedSummary = z.object({
  linked: z.literal(true),
  portfolioValueUsd: z.number().finite().nullable(),
  change24hPct: z.number().finite().nullable(),
  holdings: z.number().int().nonnegative(),
  alertsThisWeek: z.number().int().nonnegative(),
  weeklyCap: z.number().int().nonnegative(),
  lastAlertAt: z.string().datetime({ offset: true }).nullable(),
  dashboardUrl: DashboardUrl,
});
export type LinkedSummary = z.infer<typeof LinkedSummary>;

export const UnlinkedSummary = z.object({ linked: z.literal(false) });
export type UnlinkedSummary = z.infer<typeof UnlinkedSummary>;

export const SummaryResponse = z.discriminatedUnion("linked", [LinkedSummary, UnlinkedSummary]);
export type SummaryResponse = z.infer<typeof SummaryResponse>;

export type LinkOutcome = "linked" | "invalid_code" | "expired_code";
