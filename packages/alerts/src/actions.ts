import type { ActionResponse, AlertPreferences, CategorySnapshot, Chain, Holding, QuoteSnapshot, SwapSuggestion, TokenMeta } from "@nemea/shared-types";
import { CHAINS, CHAIN_IDS, DISCLAIMER } from "@nemea/shared-types";
import { categoryFor } from "./portfolio.ts";
import type { AlertContext } from "./types.ts";
import type { AlertKind } from "@nemea/shared-types";

export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const NATIVE_CMC_ID = 1027;
export const MAX_SUGGESTIONS = 3;

export type ActionInput = {
  alert: { kind: AlertKind; cmcId: number | null; context: AlertContext };
  holdings: readonly Holding[];
  meta: ReadonlyMap<number, TokenMeta>;
  quotes: ReadonlyMap<number, QuoteSnapshot>;
  categories: readonly CategorySnapshot[];
  preferences: AlertPreferences;
  stableTargets: readonly TokenMeta[];
  peggedUsdIds: ReadonlySet<number>;
  fraction: number;
  now?: Date;
  maxQuoteAgeMs?: number;
};

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function formatAmount(amount: number): string {
  return String(Number(amount.toPrecision(8)));
}

function quoteIsFresh(quote: QuoteSnapshot | undefined, input: ActionInput): boolean {
  if (!quote || quote.priceUsd === null) return false;
  if (!input.now || input.maxQuoteAgeMs === undefined) return true;
  const t = Date.parse(quote.cmcLastUpdated ?? quote.fetchedAt);
  return Number.isFinite(t) && input.now.getTime() - t <= input.maxQuoteAgeMs;
}

function uniswapUrl(chain: Chain, from: string | null, to: string, amount: number): string {
  const url = new URL("https://app.uniswap.org/swap");
  url.searchParams.set("chain", chain);
  url.searchParams.set("inputCurrency", from ?? "ETH");
  url.searchParams.set("outputCurrency", to);
  url.searchParams.set("exactAmount", formatAmount(amount));
  url.searchParams.set("exactField", "input");
  return url.toString();
}

function oneInchUrl(chain: Chain, from: string | null, to: string): string {
  return `https://app.1inch.io/#/${CHAIN_IDS[chain]}/simple/swap/${from ?? NATIVE_TOKEN_ADDRESS}/${to}`;
}

function chainsFor(holding: Holding, meta: TokenMeta | undefined): Array<{ chain: Chain; address: string | null }> {
  if (holding.chain) {
    if (holding.contractAddress !== null && !EVM_ADDRESS.test(holding.contractAddress)) return [];
    return [{ chain: holding.chain, address: holding.contractAddress }];
  }
  if (holding.cmcId === NATIVE_CMC_ID) return CHAINS.map((chain) => ({ chain, address: null }));
  return (meta?.contracts ?? []).filter((c) => EVM_ADDRESS.test(c.address)).map((c) => ({ chain: c.chain, address: c.address }));
}

function pickTarget(chain: Chain, excludeId: number, input: ActionInput): { meta: TokenMeta; address: string } | null {
  const floor = input.preferences.depegFloorUsd;
  for (const target of input.stableTargets) {
    if (target.cmcId === excludeId) continue;
    const quote = input.quotes.get(target.cmcId);
    if (!quoteIsFresh(quote, input) || (quote?.priceUsd as number) < floor) continue;
    const contract = target.contracts.find((c) => c.chain === chain);
    if (contract && EVM_ADDRESS.test(contract.address)) return { meta: target, address: contract.address };
  }
  return null;
}

export function selectActionHoldings(input: ActionInput): Holding[] {
  const { alert } = input;
  if (alert.cmcId !== null) return input.holdings.filter((h) => h.cmcId === alert.cmcId);
  const nonStable = input.holdings.filter((h) => !input.peggedUsdIds.has(h.cmcId));
  const value = (h: Holding) => (input.quotes.get(h.cmcId)?.priceUsd ?? 0) * h.amount;
  if (alert.kind === "category_rotation" && alert.context.categoryName) {
    const name = alert.context.categoryName;
    return nonStable
      .filter((h) => categoryFor(input.meta.get(h.cmcId), input.categories)?.name === name)
      .sort((a, b) => value(b) - value(a))
      .slice(0, MAX_SUGGESTIONS);
  }
  if (alert.kind === "portfolio_drop") {
    const ids = new Set((alert.context.attribution?.byCategory ?? []).flatMap((c) => c.cmcIds ?? []));
    const pool = ids.size > 0 ? nonStable.filter((h) => ids.has(h.cmcId)) : nonStable;
    return pool.sort((a, b) => value(b) - value(a)).slice(0, MAX_SUGGESTIONS);
  }
  return [];
}

export function buildActions(input: ActionInput): ActionResponse {
  const level = input.preferences.protectionLevel;
  const base = { level, disclaimer: DISCLAIMER } as const;
  if (level < 2) {
    return { ...base, suggestions: [], unavailableReason: "Protection level 1 is alert-only. Raise it to level 2 in Settings to get swap suggestions." };
  }
  if (!(input.fraction > 0 && input.fraction <= 1)) {
    return { ...base, suggestions: [], unavailableReason: "The share to protect must be between 0 and 100%." };
  }
  const holdings = selectActionHoldings(input);
  if (holdings.length === 0) {
    return { ...base, suggestions: [], unavailableReason: "This alert is not about a coin you could swap." };
  }
  const suggestions: SwapSuggestion[] = [];
  const skipped: string[] = [];
  for (const holding of holdings) {
    const options = chainsFor(holding, input.meta.get(holding.cmcId));
    if (options.length === 0) {
      skipped.push(`${holding.symbol}: no supported network known`);
      continue;
    }
    for (const option of options) {
      const target = pickTarget(option.chain, holding.cmcId, input);
      if (!target) {
        skipped.push(`${holding.symbol} on ${option.chain}: no stablecoin on this network that CoinMarketCap currently shows on peg`);
        continue;
      }
      const amount = holding.amount * input.fraction;
      if (!(amount > 0)) continue;
      const notes = [
        "You review the price, fees and slippage in the swap app and approve in your own wallet. Nemea never holds your keys or moves funds.",
      ];
      if (!holding.chain && options.length > 1) notes.push("Nemea does not know which network you hold this on. Use the row that matches your wallet.");
      suggestions.push({
        fromSymbol: holding.symbol,
        fromCmcId: holding.cmcId,
        chain: option.chain,
        fromAddress: option.address,
        toSymbol: target.meta.symbol,
        toAddress: target.address,
        suggestedAmount: amount,
        uniswapUrl: uniswapUrl(option.chain, option.address, target.address, amount),
        oneInchUrl: oneInchUrl(option.chain, option.address, target.address),
        referralConfigured: false,
        notes,
      });
    }
  }
  const limited = suggestions.slice(0, MAX_SUGGESTIONS * 3);
  return {
    ...base,
    suggestions: limited,
    unavailableReason: limited.length === 0 ? skipped.join("; ") || "No swap could be prepared." : null,
  };
}
