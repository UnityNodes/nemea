import type {
  AlertFact,
  AlertKind,
  AlertPreferences,
  CategorySnapshot,
  GlobalMetricsSnapshot,
  Holding,
  PricePoint,
  QuoteSnapshot,
  RwaSnapshot,
  Severity,
  TokenMeta,
} from "@nemea/shared-types";

export type PriceLow = {
  lowUsd: number;
  lowAt: string | null;
  windowDays: number | null;
  scope: "all_time" | "window";
};

export type PastAlert = {
  kind: AlertKind;
  severity: Severity;
  cmcId: number | null;
  dedupeKey: string;
  createdAt: string;
  simulated: boolean;
};

export type EngineInput = {
  now: Date;
  holdings: readonly Holding[];
  quotes: ReadonlyMap<number, QuoteSnapshot>;
  meta: ReadonlyMap<number, TokenMeta>;
  global: GlobalMetricsSnapshot | null;
  categories: readonly CategorySnapshot[];
  preferences: AlertPreferences;
  peggedUsdIds: ReadonlySet<number>;
  lows: ReadonlyMap<number, PriceLow>;
  rwaByWrapperId: ReadonlyMap<number, RwaSnapshot>;
  past: readonly PastAlert[];
  maxQuoteAgeMs: number;
  maxMarketContextAgeMs?: number;
};

export type AlertContext = {
  cmcId: number | null;
  observed: Record<string, number | string | null>;
  categoryName: string | null;
  categoryChange24hPct: number | null;
  marketChange24hPct: number | null;
  attribution: DropAttribution | null;
};

export type Candidate = {
  kind: AlertKind;
  severity: Severity;
  cmcId: number | null;
  symbol: string | null;
  title: string;
  summary: string;
  facts: AlertFact[];
  dedupeKey: string;
  score: number;
  context: AlertContext;
};

export type SuppressedReason = "cooldown" | "weekly_cap" | "rolled_into_portfolio_alert" | "stale_quote" | "no_data" | "unit_mismatch";

export type Suppressed = {
  kind: AlertKind;
  cmcId: number | null;
  reason: SuppressedReason;
  detail: string;
};

export type EngineOutput = {
  emit: Candidate[];
  suppressed: Suppressed[];
  evaluated: { holdings: number; pricedFresh: number; stale: number; unpriced: number };
};

export type CategoryContribution = {
  categoryName: string;
  lossUsd: number;
  sharePct: number;
  categoryChange24hPct: number | null;
  symbols: string[];
  cmcIds: number[];
};

export type DropAttribution = {
  portfolioChange24hPct: number;
  lossUsd: number;
  valueNowUsd: number;
  byCategory: CategoryContribution[];
  marketChange24hPct: number | null;
};

export type SimilarDrop = {
  startedAt: string;
  dropPct: number;
  recoveredAfterDays: number | null;
};

export type SimilarDropsSummary = {
  thresholdPct: number;
  windowDays: number;
  events: SimilarDrop[];
  recoveredCount: number;
  notRecoveredCount: number;
  medianRecoveryDays: number | null;
};
