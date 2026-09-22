import type { Chain } from "@nemea/shared-types";
import { DIGITS_ONLY, EVM_ADDRESS, asObject, httpGet, parseJson, realSleep, retryAfterMs, type HttpResult, type Sleep } from "./http.ts";
import { ChainReadError, NATIVE_DECIMALS, NATIVE_SYMBOL, type BalanceProvider, type RawBalance } from "./types.ts";
import { toDecimalAmount } from "./units.ts";

export const BLOCKSCOUT_BASE_URLS: Record<Chain, string> = {
  ethereum: "https://eth.blockscout.com",
  base: "https://base.blockscout.com",
  arbitrum: "https://arbitrum.blockscout.com",
};

export const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_PAGES = 3;
const MAX_RETRY_AFTER_MS = 2000;
const MAX_DECIMALS = 255;

function parseRate(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export type BlockscoutOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  baseUrls?: Partial<Record<Chain, string>>;
  sleep?: Sleep;
};

export class BlockscoutProvider implements BalanceProvider {
  readonly name = "blockscout";
  readonly providesUsdRateHint = true;
  readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrls: Partial<Record<Chain, string>>;
  private readonly sleep: Sleep;

  constructor(opts: BlockscoutOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseUrls = { ...BLOCKSCOUT_BASE_URLS, ...opts.baseUrls };
    this.sleep = opts.sleep ?? realSleep;
  }

  supports(chain: Chain): boolean {
    return typeof this.baseUrls[chain] === "string";
  }

  async readBalances(address: string, chain: Chain): Promise<RawBalance[]> {
    const base = this.baseUrls[chain];
    if (!base) throw new ChainReadError(chain, this.name, "bad_response", "no Blockscout host configured for this chain");
    const root = `${base.replace(/\/+$/, "")}/api/v2/addresses/${encodeURIComponent(address)}`;
    const out: RawBalance[] = [];
    const native = await this.readNative(root, chain);
    if (native) out.push(native);
    out.push(...(await this.readTokens(root, chain)));
    return out;
  }

  private async get(url: string, chain: Chain): Promise<HttpResult> {
    for (let attempt = 0; ; attempt++) {
      const res = await httpGet(this.fetchImpl, url, this.timeoutMs, chain, this.name);
      if (res.status === 429) {
        const wait = retryAfterMs(res.headers);
        if (attempt === 0 && wait !== null && wait <= MAX_RETRY_AFTER_MS) {
          await this.sleep(wait);
          continue;
        }
        throw new ChainReadError(chain, this.name, "rate_limited", wait === null ? "HTTP 429" : `HTTP 429, retry after ${wait}ms`);
      }
      if (res.status === 404) return res;
      if (res.status < 200 || res.status >= 300) throw new ChainReadError(chain, this.name, "network", `HTTP ${res.status}`);
      return res;
    }
  }

  private async readNative(root: string, chain: Chain): Promise<RawBalance | null> {
    const res = await this.get(root, chain);
    if (res.status === 404) return null;
    const body = asObject(parseJson(res.text, chain, this.name));
    if (!body || !("coin_balance" in body)) throw new ChainReadError(chain, this.name, "bad_response", "address response has no coin_balance field");
    const wei = body.coin_balance;
    if (wei === null) return null;
    if (typeof wei !== "string" || !DIGITS_ONLY.test(wei)) throw new ChainReadError(chain, this.name, "bad_response", "coin_balance is not a wei string");
    const amount = toDecimalAmount(wei, NATIVE_DECIMALS);
    if (amount === 0) return null;
    return { chain, contractAddress: null, symbol: NATIVE_SYMBOL, decimals: NATIVE_DECIMALS, rawAmount: wei, amount, provider: this.name, looksLikeSpam: false, usdRateHint: null };
  }

  private async readTokens(root: string, chain: Chain): Promise<RawBalance[]> {
    const rows: unknown[] = [];
    let query = "";
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.get(`${root}/token-balances${query}`, chain);
      if (res.status === 404) return [];
      const body = parseJson(res.text, chain, this.name);
      if (Array.isArray(body)) {
        rows.push(...body);
        return this.parseRows(rows, chain);
      }
      const paged = asObject(body);
      if (!paged || !Array.isArray(paged.items)) throw new ChainReadError(chain, this.name, "bad_response", "token-balances is neither an array nor a page with items");
      rows.push(...paged.items);
      const next = asObject(paged.next_page_params);
      if (!next) return this.parseRows(rows, chain);
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) if (value !== null && value !== undefined) params.set(key, String(value));
      query = `?${params.toString()}`;
    }
    throw new ChainReadError(chain, this.name, "bad_response", `token balances continue past ${MAX_PAGES} pages`);
  }

  private parseRows(rows: unknown[], chain: Chain): RawBalance[] {
    const out: RawBalance[] = [];
    for (const row of rows) {
      const entry = asObject(row);
      const token = asObject(entry?.token);
      if (!entry || !token || token.type !== "ERC-20") continue;
      const contract = token.address_hash;
      const decimals = typeof token.decimals === "string" && DIGITS_ONLY.test(token.decimals) ? Number(token.decimals) : null;
      if (typeof contract !== "string" || !EVM_ADDRESS.test(contract) || decimals === null || decimals > MAX_DECIMALS) continue;
      const value = entry.value;
      if (typeof value !== "string" || !DIGITS_ONLY.test(value)) throw new ChainReadError(chain, this.name, "bad_response", `ERC-20 balance of ${contract} is not a raw-unit string`);
      const amount = toDecimalAmount(value, decimals);
      if (amount === 0) continue;
      out.push({
        chain,
        contractAddress: contract.toLowerCase(),
        symbol: typeof token.symbol === "string" && token.symbol.length > 0 ? token.symbol : null,
        decimals,
        rawAmount: value,
        amount,
        provider: this.name,
        looksLikeSpam: token.reputation !== "ok",
        usdRateHint: parseRate(token.exchange_rate),
      });
    }
    return out;
  }
}
