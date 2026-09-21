import { describe, expect, it } from "vitest";
import { BlockscoutProvider, EtherscanProvider, defaultProviders } from "../src/index.ts";
import { VITALIK, json, makeFetch } from "./helpers.ts";

const names = (list: { name: string }[]) => list.map((p) => p.name);

describe("defaultProviders", () => {
  it("uses only Blockscout when there is no Etherscan key", () => {
    const p = defaultProviders({});
    expect(names(p.ethereum)).toEqual(["blockscout"]);
    expect(names(p.base)).toEqual(["blockscout"]);
    expect(names(p.arbitrum)).toEqual(["blockscout"]);
  });

  it("treats an empty key as no key", () => {
    expect(names(defaultProviders({ etherscanApiKey: "" }).ethereum)).toEqual(["blockscout"]);
  });

  it("puts Etherscan first on Ethereum and Arbitrum and after Blockscout on Base", () => {
    const p = defaultProviders({ etherscanApiKey: "k" });
    expect(names(p.ethereum)).toEqual(["etherscan", "blockscout"]);
    expect(names(p.arbitrum)).toEqual(["etherscan", "blockscout"]);
    expect(names(p.base)).toEqual(["blockscout", "etherscan"]);
  });

  it("shares one Etherscan instance across chains so the rate limit is shared", () => {
    const p = defaultProviders({ etherscanApiKey: "k" });
    const eth = p.ethereum[0];
    expect(eth).toBeInstanceOf(EtherscanProvider);
    expect(p.arbitrum[0]).toBe(eth);
    expect(p.base[1]).toBe(eth);
    expect(p.ethereum[1]).toBeInstanceOf(BlockscoutProvider);
    expect(p.ethereum[1]).toBe(p.base[0]);
  });

  it("hands its fetch implementation to the providers", async () => {
    const { fetchImpl, calls } = makeFetch((url) => (url.pathname.endsWith("/token-balances") ? json([]) : json({ coin_balance: "1000000000000000000" })));
    const p = defaultProviders({ fetchImpl });
    const balances = await p.base[0]?.readBalances(VITALIK, "base");
    expect(balances?.map((b) => b.amount)).toEqual([1]);
    expect(calls.length).toBeGreaterThan(0);
  });
});
