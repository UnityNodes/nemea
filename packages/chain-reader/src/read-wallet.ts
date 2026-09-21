import type { CmcClient } from "@nemea/cmc-client";
import { CHAINS, EvmAddress, type Chain, type TokenMeta, type WalletImportPreview } from "@nemea/shared-types";
import { ChainReadError, NATIVE_CMC_ID, NATIVE_NAME, NATIVE_SYMBOL, type BalanceProvider, type RawBalance } from "./types.ts";

export const UNLISTED_REASON = "Not listed on CoinMarketCap — usually airdrop spam, ignored";
export const NO_SYMBOL_REASON = "No usable token symbol, ignored";
export const MIN_HINT_VALUE_USD = 1;
export const MAX_PRICED_TOKENS_PER_CHAIN = 60;
export const MAX_UNPRICED_TOKENS_PER_CHAIN = 40;

const LOOKUP_SYMBOL = /^[A-Za-z0-9._-]{1,20}$/;

const FALL_THROUGH_KINDS: ReadonlySet<string> = new Set(["plan_unsupported", "network", "timeout", "rate_limited"]);

export type ReadWalletOptions = {
  address: string;
  chains: Chain[];
  providers: Record<Chain, BalanceProvider[]>;
  cmc: Pick<CmcClient, "getInfoBySymbols">;
};

type ChainOutcome = { chain: Chain; balances: RawBalance[]; hinted: boolean; error: string | null };

type Candidate = { chain: Chain; balance: RawBalance; contract: string };

function describeFailure(error: ChainReadError): string {
  return `${error.provider}: ${error.kind}${error.detail ? ` — ${error.detail}` : ""}`;
}

async function readChain(address: string, chain: Chain, candidates: BalanceProvider[] | undefined): Promise<ChainOutcome> {
  const usable = (candidates ?? []).filter((p) => p.supports(chain));
  if (usable.length === 0) return { chain, balances: [], hinted: false, error: "no balance provider is configured for this chain" };
  const failures: string[] = [];
  for (const provider of usable) {
    try {
      return { chain, balances: await provider.readBalances(address, chain), hinted: provider.providesUsdRateHint === true, error: null };
    } catch (error) {
      if (!(error instanceof ChainReadError)) throw error;
      failures.push(describeFailure(error));
      if (!FALL_THROUGH_KINDS.has(error.kind)) break;
    }
  }
  return { chain, balances: [], hinted: false, error: failures.join("; ") };
}

function prefilter(candidates: Candidate[], hinted: boolean): { kept: Candidate[]; notes: string[] } {
  if (!hinted) {
    const overflow = candidates.length - MAX_UNPRICED_TOKENS_PER_CHAIN;
    return {
      kept: candidates.slice(0, MAX_UNPRICED_TOKENS_PER_CHAIN),
      notes: overflow > 0 ? [`${overflow} tokens beyond the first ${MAX_UNPRICED_TOKENS_PER_CHAIN} were not checked`] : [],
    };
  }
  const priced: { candidate: Candidate; hintValueUsd: number }[] = [];
  for (const candidate of candidates) {
    const rate = candidate.balance.usdRateHint;
    if (typeof rate !== "number") continue;
    const hintValueUsd = candidate.balance.amount * rate;
    if (Number.isFinite(hintValueUsd) && hintValueUsd >= MIN_HINT_VALUE_USD) priced.push({ candidate, hintValueUsd });
  }
  priced.sort((a, b) => b.hintValueUsd - a.hintValueUsd);
  const notes: string[] = [];
  const unpriced = candidates.length - priced.length;
  if (unpriced > 0) notes.push(`${unpriced} tokens with no market price or worth under $${MIN_HINT_VALUE_USD} were ignored (mostly airdrop spam)`);
  const overflow = priced.length - MAX_PRICED_TOKENS_PER_CHAIN;
  if (overflow > 0) notes.push(`${overflow} smaller tokens beyond the ${MAX_PRICED_TOKENS_PER_CHAIN} largest were not checked`);
  return { kept: priced.slice(0, MAX_PRICED_TOKENS_PER_CHAIN).map((p) => p.candidate), notes };
}

function contractKey(chain: Chain, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}

function indexByContract(metas: TokenMeta[]): Map<string, TokenMeta> {
  const index = new Map<string, TokenMeta>();
  for (const meta of metas) {
    for (const contract of meta.contracts) {
      const key = contractKey(contract.chain, contract.address);
      if (!index.has(key)) index.set(key, meta);
    }
  }
  return index;
}

export async function readWallet(opts: ReadWalletOptions): Promise<WalletImportPreview> {
  const parsed = EvmAddress.safeParse(opts.address);
  if (!parsed.success) throw new Error(`not an EVM address: ${JSON.stringify(opts.address)}`);
  const unknown = opts.chains.filter((c) => !CHAINS.includes(c));
  if (unknown.length > 0) throw new Error(`unsupported chain: ${unknown.join(", ")}`);
  const chains = CHAINS.filter((c) => opts.chains.includes(c));
  if (chains.length === 0) throw new Error("no chain requested");

  const outcomes = await Promise.all(chains.map((chain) => readChain(parsed.data, chain, opts.providers[chain])));

  const preview: WalletImportPreview = {
    address: parsed.data,
    items: [],
    skipped: [],
    chainErrors: outcomes.flatMap((o) => (o.error === null ? [] : [{ chain: o.chain, message: o.error }])),
  };

  const importance = new WeakMap<object, number>();
  const tokens: Candidate[] = [];
  const seen = new Set<string>();
  for (const outcome of outcomes) {
    const candidates: Candidate[] = [];
    for (const balance of outcome.balances) {
      if (!(balance.amount > 0)) continue;
      if (balance.contractAddress === null) {
        const nativeItem = { cmcId: NATIVE_CMC_ID, symbol: NATIVE_SYMBOL, name: NATIVE_NAME, amount: balance.amount, chain: outcome.chain, contractAddress: null };
        importance.set(nativeItem, Number.POSITIVE_INFINITY);
        preview.items.push(nativeItem);
        continue;
      }
      const contract = balance.contractAddress.toLowerCase();
      const key = contractKey(outcome.chain, contract);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ chain: outcome.chain, balance, contract });
    }
    const { kept, notes } = prefilter(candidates, outcome.hinted);
    tokens.push(...kept);
    for (const reason of notes) preview.skipped.push({ chain: outcome.chain, contractAddress: null, symbol: null, reason });
  }

  const lookable: Candidate[] = [];
  for (const token of tokens) {
    if (typeof token.balance.symbol === "string" && LOOKUP_SYMBOL.test(token.balance.symbol)) lookable.push(token);
    else preview.skipped.push({ chain: token.chain, contractAddress: token.contract, symbol: token.balance.symbol, reason: NO_SYMBOL_REASON });
  }

  if (lookable.length > 0) {
    const symbols = [...new Set(lookable.map((t) => (t.balance.symbol as string).toUpperCase()))];
    const metas = await opts.cmc.getInfoBySymbols(symbols);
    const index = indexByContract(metas);
    for (const { chain, balance, contract } of lookable) {
      const meta = index.get(contractKey(chain, contract));
      if (meta) {
        const item = { cmcId: meta.cmcId, symbol: meta.symbol, name: meta.name, amount: balance.amount, chain, contractAddress: contract };
        importance.set(item, typeof balance.usdRateHint === "number" ? balance.amount * balance.usdRateHint : 0);
        preview.items.push(item);
      } else {
        const note = balance.looksLikeSpam ? ` (${balance.provider} does not vouch for this token)` : "";
        preview.skipped.push({ chain, contractAddress: contract, symbol: balance.symbol, reason: `${UNLISTED_REASON}${note}` });
      }
    }
  }

  const weight = (item: object) => importance.get(item) ?? 0;
  preview.items.sort((a, b) => {
    const wa = weight(a);
    const wb = weight(b);
    if (wa !== wb) return wb > wa ? 1 : -1;
    return CHAINS.indexOf(a.chain) - CHAINS.indexOf(b.chain) || b.amount - a.amount;
  });
  return preview;
}
