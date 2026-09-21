import { z } from "zod";
import { AlertPreferences, AlertRecord, Explanation, ProtectionLevel } from "./alerts.ts";
import { Chain, EvmAddress } from "./chains.ts";
import { Holding, HoldingInput } from "./portfolio.ts";
import type { QuoteSnapshot } from "./market.ts";

export const UserView = z.object({
  id: z.string(),
  kind: z.enum(["guest", "wallet"]),
  walletAddress: z.string().nullable(),
  createdAt: z.string(),
});
export type UserView = z.infer<typeof UserView>;

export const SiweVerifyRequest = z.object({
  message: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});
export type SiweVerifyRequest = z.infer<typeof SiweVerifyRequest>;

export const TokenLookupCandidate = z.object({
  cmcId: z.number().int(),
  symbol: z.string(),
  name: z.string(),
  rank: z.number().int().nullable(),
  isStablecoin: z.boolean(),
});
export type TokenLookupCandidate = z.infer<typeof TokenLookupCandidate>;

export type PricedHoldingView = Holding & {
  valueUsd: number | null;
  priceUsd: number | null;
  percentChange1h: number | null;
  percentChange24h: number | null;
  quoteAgeSeconds: number | null;
  quoteStale: boolean;
  tier: "top" | "small";
  costBasisDeltaPct: number | null;
};

export type PortfolioView = {
  holdings: PricedHoldingView[];
  totalValueUsd: number | null;
  change24hPct: number | null;
  unpricedCount: number;
  updatedAt: string | null;
};

export const HoldingUpsertRequest = HoldingInput;
export type HoldingUpsertRequest = z.infer<typeof HoldingUpsertRequest>;

export const WalletImportRequest = z.object({
  address: EvmAddress,
  chains: z.array(Chain).min(1),
});
export type WalletImportRequest = z.infer<typeof WalletImportRequest>;

export const WalletImportItem = z.object({
  cmcId: z.number().int(),
  symbol: z.string(),
  name: z.string(),
  amount: z.number().positive(),
  chain: Chain,
  contractAddress: z.string().nullable(),
});
export type WalletImportItem = z.infer<typeof WalletImportItem>;

export const WalletImportPreview = z.object({
  address: z.string(),
  items: z.array(WalletImportItem),
  skipped: z.array(
    z.object({
      chain: Chain,
      contractAddress: z.string().nullable(),
      symbol: z.string().nullable(),
      reason: z.string(),
    }),
  ),
  chainErrors: z.array(z.object({ chain: Chain, message: z.string() })),
});
export type WalletImportPreview = z.infer<typeof WalletImportPreview>;

export const WalletImportConfirm = z
  .object({
    address: EvmAddress,
    chains: z.array(Chain).min(1).optional(),
    items: z.array(WalletImportItem),
  })
  .refine((v) => v.items.length > 0 || (v.chains?.length ?? 0) > 0, { message: "nothing to import" });
export type WalletImportConfirm = z.infer<typeof WalletImportConfirm>;

export const PreferencesUpdate = AlertPreferences.partial();
export type PreferencesUpdate = z.infer<typeof PreferencesUpdate>;

export const SimulateScenario = z.enum(["drop", "portfolio_drop", "depeg", "volume_spike"]);
export type SimulateScenario = z.infer<typeof SimulateScenario>;
export const SimulateRequest = z.object({
  scenario: SimulateScenario,
  cmcId: z.number().int().optional(),
});
export type SimulateRequest = z.infer<typeof SimulateRequest>;

export const ExplainResponse = z.object({
  alert: AlertRecord,
  explanation: Explanation,
});
export type ExplainResponse = z.infer<typeof ExplainResponse>;

export const SwapSuggestion = z.object({
  fromSymbol: z.string(),
  fromCmcId: z.number().int(),
  chain: Chain,
  fromAddress: z.string().nullable(),
  toSymbol: z.string(),
  toAddress: z.string(),
  suggestedAmount: z.number().positive(),
  uniswapUrl: z.string().url().nullable(),
  oneInchUrl: z.string().url().nullable(),
  referralConfigured: z.boolean(),
  notes: z.array(z.string()),
});
export type SwapSuggestion = z.infer<typeof SwapSuggestion>;

export const ActionResponse = z.object({
  level: ProtectionLevel,
  suggestions: z.array(SwapSuggestion),
  unavailableReason: z.string().nullable(),
  disclaimer: z.string(),
});
export type ActionResponse = z.infer<typeof ActionResponse>;

export const TelegramLinkCode = z.object({
  code: z.string(),
  deepLink: z.string().nullable(),
  expiresAt: z.string(),
});
export type TelegramLinkCode = z.infer<typeof TelegramLinkCode>;

export const EmailChannelRequest = z.object({ email: z.string().email() });
export type EmailChannelRequest = z.infer<typeof EmailChannelRequest>;

export const PushSubscriptionRequest = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});
export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionRequest>;

export const InternalTelegramLink = z.object({
  code: z.string().min(1),
  chatId: z.string().min(1),
  username: z.string().nullable(),
});
export type InternalTelegramLink = z.infer<typeof InternalTelegramLink>;

export type MeView = {
  user: UserView;
  preferences: AlertPreferences;
  channels: ChannelsView;
  capabilities: { telegram: boolean; email: boolean; push: boolean; wallets: boolean; autoSwap: boolean; telegramBot: string | null };
};

export type ChannelsView = {
  telegram: { linked: boolean; username: string | null };
  email: { address: string | null; verified: boolean };
  push: { subscribed: boolean };
  web: { enabled: true };
};

export type PollLaneStatus = {
  lane: "stablecoins" | "top" | "small" | "global" | "categories";
  intervalSeconds: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  itemCount: number;
};

export type CallReceiptView = {
  at: string;
  endpoint: string;
  httpStatus: number | null;
  ok: boolean;
  creditCount: number | null;
  ms: number;
  detail: string;
};

export type SystemStatus = {
  cmcPlan: string | null;
  rateLimitPerMinute: number | null;
  creditLimitMonthly: number | null;
  creditsSpentThisRun: number;
  receipts: CallReceiptView[];
  channels: { telegram: boolean; email: boolean; push: boolean };
  pausedUntil: string | null;
  estimatedCreditsPerMonth: number;
  budgetVerdict: "fits" | "stretched" | "insufficient" | "unknown";
  cadenceMultiplier: number;
  lanes: PollLaneStatus[];
  cache: { hits: number; misses: number };
  version: string;
  requestIp: string;
};

export type ApiError = { error: { code: string; message: string } };

export type QuoteView = QuoteSnapshot;
