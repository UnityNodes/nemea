import type { Chain } from "@nemea/shared-types";
import { BlockscoutProvider } from "./blockscout.ts";
import { EtherscanProvider } from "./etherscan.ts";
import type { BalanceProvider } from "./types.ts";

export type DefaultProvidersOptions = {
  etherscanApiKey?: string;
  fetchImpl?: typeof fetch;
};

export function defaultProviders(opts: DefaultProvidersOptions = {}): Record<Chain, BalanceProvider[]> {
  const blockscout = new BlockscoutProvider({ fetchImpl: opts.fetchImpl });
  if (!opts.etherscanApiKey) return { ethereum: [blockscout], base: [blockscout], arbitrum: [blockscout] };
  const etherscan = new EtherscanProvider({ apiKey: opts.etherscanApiKey, fetchImpl: opts.fetchImpl });
  return { ethereum: [etherscan, blockscout], base: [blockscout, etherscan], arbitrum: [etherscan, blockscout] };
}
