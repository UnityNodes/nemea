import { CHAIN_IDS, CHAIN_LABELS, type Chain } from "@nemea/shared-types";
import { DIGITS_ONLY, EVM_ADDRESS, asObject, httpGet, parseJson, realSleep, type Sleep } from "./http.ts";
import { ChainReadError, NATIVE_DECIMALS, NATIVE_SYMBOL, type BalanceProvider, type RawBalance } from "./types.ts";
import { toDecimalAmount } from "./units.ts";

export const ETHERSCAN_V2_URL = "https://api.etherscan.io/v2/api";

const TOKENTX_PAGE_SIZE = 1000;
const MAX_DECIMALS = 255;
const NO_RECORDS = /no (transactions|records) found/i;

export type EtherscanOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: Sleep;
  now?: () => number;
  minIntervalMs?: number;
  maxTokens?: number;
  maxTokentxPages?: number;
  baseUrl?: string;
};

type Discovered = { contractAddress: string; symbol: string | null; decimals: number };

export class EtherscanProvider implements BalanceProvider {
  readonly name = "etherscan";
  readonly providesUsdRateHint = false;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly sleep: Sleep;
  private readonly now: () => number;
  private readonly minIntervalMs: number;
  private readonly maxTokens: number;
  private readonly maxTokentxPages: number;
  private readonly baseUrl: string;
  private lastCallAt: number | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(opts: EtherscanOptions) {
    if (!opts.apiKey) throw new Error("Etherscan API key is empty");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 12_000;
    this.sleep = opts.sleep ?? realSleep;
    this.now = opts.now ?? Date.now;
    this.minIntervalMs = opts.minIntervalMs ?? 350;
    this.maxTokens = opts.maxTokens ?? 40;
    this.maxTokentxPages = opts.maxTokentxPages ?? 2;
    this.baseUrl = opts.baseUrl ?? ETHERSCAN_V2_URL;
  }

  supports(chain: Chain): boolean {
    return chain in CHAIN_IDS;
  }

  async readBalances(address: string, chain: Chain): Promise<RawBalance[]> {
    if (!this.supports(chain)) throw new ChainReadError(chain, this.name, "bad_response", "chain is not supported by Etherscan V2");
    const out: RawBalance[] = [];
    const wei = this.digits(chain, await this.call(chain, { action: "balance", address, tag: "latest" }), "balance");
    const nativeAmount = toDecimalAmount(wei, NATIVE_DECIMALS);
    if (nativeAmount > 0) {
      out.push({ chain, contractAddress: null, symbol: NATIVE_SYMBOL, decimals: NATIVE_DECIMALS, rawAmount: wei, amount: nativeAmount, provider: this.name, looksLikeSpam: false, usdRateHint: null });
    }
    for (const token of await this.discover(address, chain)) {
      const raw = this.digits(chain, await this.call(chain, { action: "tokenbalance", address, contractaddress: token.contractAddress, tag: "latest" }), `tokenbalance of ${token.contractAddress}`);
      const amount = toDecimalAmount(raw, token.decimals);
      if (amount === 0) continue;
      out.push({ chain, contractAddress: token.contractAddress, symbol: token.symbol, decimals: token.decimals, rawAmount: raw, amount, provider: this.name, looksLikeSpam: true, usdRateHint: null });
    }
    return out;
  }

  private digits(chain: Chain, result: unknown, what: string): string {
    if (typeof result !== "string" || !DIGITS_ONLY.test(result)) throw new ChainReadError(chain, this.name, "bad_response", `${what} is not a raw-unit string`);
    return result;
  }

  private async discover(address: string, chain: Chain): Promise<Discovered[]> {
    const found = new Map<string, Discovered>();
    for (let page = 1; page <= this.maxTokentxPages; page++) {
      const result = await this.call(chain, { action: "tokentx", address, page: String(page), offset: String(TOKENTX_PAGE_SIZE), sort: "desc" });
      if (!Array.isArray(result)) throw new ChainReadError(chain, this.name, "bad_response", "tokentx result is not a list");
      for (const row of result) {
        const entry = asObject(row);
        const contract = entry?.contractAddress;
        const decimalText = entry?.tokenDecimal;
        if (typeof contract !== "string" || !EVM_ADDRESS.test(contract)) continue;
        if (typeof decimalText !== "string" || !DIGITS_ONLY.test(decimalText) || Number(decimalText) > MAX_DECIMALS) continue;
        const key = contract.toLowerCase();
        if (found.has(key)) continue;
        const symbol = entry?.tokenSymbol;
        found.set(key, { contractAddress: key, symbol: typeof symbol === "string" && symbol.length > 0 ? symbol : null, decimals: Number(decimalText) });
      }
      if (result.length < TOKENTX_PAGE_SIZE) break;
    }
    return [...found.values()].slice(0, this.maxTokens);
  }

  private acquire(): Promise<void> {
    const turn = this.queue.then(async () => {
      if (this.lastCallAt !== null) {
        const wait = this.lastCallAt + this.minIntervalMs - this.now();
        if (wait > 0) await this.sleep(wait);
      }
      this.lastCallAt = this.now();
    });
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  private async call(chain: Chain, params: Record<string, string>): Promise<unknown> {
    await this.acquire();
    const url = new URL(this.baseUrl);
    url.searchParams.set("chainid", String(CHAIN_IDS[chain]));
    url.searchParams.set("module", "account");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("apikey", this.apiKey);
    const res = await httpGet(this.fetchImpl, url.toString(), this.timeoutMs, chain, this.name);
    if (res.status === 429) throw new ChainReadError(chain, this.name, "rate_limited", "HTTP 429");
    if (res.status < 200 || res.status >= 300) throw new ChainReadError(chain, this.name, "network", `HTTP ${res.status}`);
    const body = asObject(parseJson(res.text, chain, this.name));
    if (!body || typeof body.status !== "string" || typeof body.message !== "string") throw new ChainReadError(chain, this.name, "bad_response", "response is not an Etherscan envelope");
    if (body.status === "1") return body.result;
    if (NO_RECORDS.test(body.message) && Array.isArray(body.result)) return body.result;
    throw this.classify(chain, body.message, body.result);
  }

  private classify(chain: Chain, message: string, result: unknown): ChainReadError {
    const text = typeof result === "string" && result.length > 0 ? result : message;
    const lower = `${message} ${text}`.toLowerCase();
    if (lower.includes("rate limit") || lower.includes("max calls per sec")) return new ChainReadError(chain, this.name, "rate_limited", text.slice(0, 200));
    if (lower.includes("free api access") || lower.includes("not supported for this chain") || lower.includes("upgrade your api plan")) {
      return new ChainReadError(chain, this.name, "plan_unsupported", `${CHAIN_LABELS[chain]} needs a paid Etherscan key`);
    }
    if (lower.includes("invalid api key")) return new ChainReadError(chain, this.name, "plan_unsupported", "Etherscan rejected the API key");
    return new ChainReadError(chain, this.name, "bad_response", text.slice(0, 200));
  }
}
