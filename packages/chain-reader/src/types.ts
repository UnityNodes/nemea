import { CHAIN_LABELS, type Chain } from "@nemea/shared-types";

export const NATIVE_CMC_ID = 1027;
export const NATIVE_SYMBOL = "ETH";
export const NATIVE_NAME = "Ethereum";
export const NATIVE_DECIMALS = 18;

export type RawBalance = {
  chain: Chain;
  contractAddress: string | null;
  symbol: string | null;
  decimals: number;
  rawAmount: string;
  amount: number;
  provider: string;
  looksLikeSpam: boolean;
  usdRateHint: number | null;
};

export interface BalanceProvider {
  readonly name: string;
  readonly providesUsdRateHint?: boolean;
  supports(chain: Chain): boolean;
  readBalances(address: string, chain: Chain): Promise<RawBalance[]>;
}

export type ChainReadErrorKind = "plan_unsupported" | "rate_limited" | "network" | "timeout" | "bad_response";

export class ChainReadError extends Error {
  readonly chain: Chain;
  readonly provider: string;
  readonly kind: ChainReadErrorKind;
  readonly detail: string | null;
  constructor(chain: Chain, provider: string, kind: ChainReadErrorKind, detail: string | null = null) {
    super(`${provider} on ${CHAIN_LABELS[chain]}: ${kind}${detail ? ` — ${detail}` : ""}`);
    this.name = new.target.name;
    this.chain = chain;
    this.provider = provider;
    this.kind = kind;
    this.detail = detail;
  }
}
