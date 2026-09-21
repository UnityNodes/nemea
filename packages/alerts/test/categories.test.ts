import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CategorySnapshot, TokenMeta } from "@nemea/shared-types";
import { categoryFor, isThematicCategory } from "../src/index.ts";

type Fixture = {
  categories: Array<{ id: string; name: string; numTokens: number }>;
  coins: Array<{ id: number; symbol: string; tags: string[]; tagGroups: string[] }>;
};

const fixture = JSON.parse(readFileSync(new URL("./fixtures/cmc-tags.json", import.meta.url), "utf8")) as Fixture;

const categories: CategorySnapshot[] = fixture.categories.map((c) => ({
  id: c.id,
  name: c.name,
  avgPriceChange24hPct: 0,
  marketCapChange24hPct: 0,
  volumeChange24hPct: 0,
  numTokens: c.numTokens,
  fetchedAt: "2026-09-21T07:41:00.000Z",
}));

function metaOf(symbol: string, withGroups = true): TokenMeta {
  const c = fixture.coins.find((x) => x.symbol === symbol);
  if (!c) throw new Error(`no fixture coin ${symbol}`);
  return {
    cmcId: c.id,
    symbol: c.symbol,
    name: c.symbol,
    slug: c.symbol.toLowerCase(),
    tags: c.tags,
    ...(withGroups ? { tagGroups: c.tagGroups } : {}),
    category: null,
    isStablecoin: false,
    contracts: [],
    dateAdded: null,
    fetchedAt: "2026-09-21T07:41:00.000Z",
  };
}

describe("category choice on real CoinMarketCap data (captured 2026-09-21)", () => {
  it("has a real fixture behind it", () => {
    expect(fixture.categories.length).toBe(359);
    expect(fixture.coins.length).toBe(10);
  });

  it.each([
    ["ETH", "Smart Contracts"],
    ["BTC", "Layer 1"],
    ["SOL", "Layer 1"],
    ["LINK", "DeFi"],
    ["USDC", "Stablecoin"],
    ["USDT", "Stablecoin"],
    ["ARB", "Scaling"],
    ["UNI", "Decentralized Exchange (DEX) Token"],
    ["PEPE", "Memes"],
    ["SHIB", "Memes"],
  ])("%s is explained by %s", (symbol, expected) => {
    expect(categoryFor(metaOf(symbol), categories)?.name).toBe(expected);
  });

  it("never picks an investor bucket, a platform ecosystem or a launchpad", () => {
    for (const c of fixture.coins) {
      const name = categoryFor(metaOf(c.symbol), categories)?.name ?? "";
      expect(name, c.symbol).not.toMatch(/portfolio|ecosystem|launchpad|capital|bankruptcy/i);
    }
  });

  it("removes the non-thematic buckets and keeps the near misses", () => {
    for (const name of ["a16z Portfolio", "Alameda Research Portfolio", "FTX Bankruptcy Estate", "SEC/CFTC Token Taxonomy", "US Strategic Crypto Reserve", "Solana Ecosystem", "Coinlist Launchpad"]) {
      expect(isThematicCategory(name), name).toBe(false);
    }
    for (const name of ["Real Estate", "Internet Capital Markets", "Tokenized Treasury Bills (T-Bills)", "DeFi Index", "Stablecoin", "Layer 1", "Memes"]) {
      expect(isThematicCategory(name), name).toBe(true);
    }
    const kept = fixture.categories.filter((c) => isThematicCategory(c.name)).length;
    expect(fixture.categories.length - kept).toBeGreaterThan(60);
  });

  it("without tag groups it still avoids the junk by name, and still finds a thematic category", () => {
    expect(categoryFor(metaOf("BTC", false), categories)?.name).toBe("Layer 1");
    expect(categoryFor(undefined, categories)).toBeNull();
  });
});
