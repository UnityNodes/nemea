import type { Chain } from "@nemea/shared-types";
import { describe, expect, it } from "vitest";
import { EtherscanProvider } from "../src/index.ts";
import { VITALIK, hangingFetch, json, makeFetch, readError, text, type Handler } from "./helpers.ts";

const KEY = "SECRETKEY123";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const PLAN_MESSAGE = "Free API access is not supported for this chain. Please upgrade your api plan for full chain coverage.";

const ok = (result: unknown) => json({ status: "1", message: "OK", result });
const notOk = (result: unknown, message = "NOTOK") => json({ status: "0", message, result });

function txRow(contract: string, symbol: string, decimals: string) {
  return { contractAddress: contract, tokenSymbol: symbol, tokenName: symbol, tokenDecimal: decimals, value: "1", from: "0x1", to: VITALIK, timeStamp: "1700000000" };
}

type Fake = { balance?: string; tokentx?: unknown[]; tokenbalances?: Record<string, string> };

function server(fake: Fake): Handler {
  return (url) => {
    const q = url.searchParams;
    const action = q.get("action");
    if (action === "balance") return ok(fake.balance ?? "0");
    if (action === "tokentx") return ok(fake.tokentx ?? []);
    if (action === "tokenbalance") return ok(fake.tokenbalances?.[(q.get("contractaddress") ?? "").toLowerCase()] ?? "0");
    return notOk("unexpected action");
  };
}

function make(handler: Handler, extra: Partial<ConstructorParameters<typeof EtherscanProvider>[0]> = {}) {
  const { fetchImpl, calls } = makeFetch(handler);
  const clock = { now: 1_000_000 };
  const sleeps: number[] = [];
  const p = new EtherscanProvider({
    apiKey: KEY,
    fetchImpl,
    now: () => clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.now += ms;
    },
    ...extra,
  });
  return { p, calls, sleeps, clock };
}

const actions = (calls: { url: URL }[]) => calls.map((c) => c.url.searchParams.get("action"));

describe("EtherscanProvider happy path", () => {
  const fake: Fake = {
    balance: "1500000000000000000",
    tokentx: [
      txRow(USDC, "USDC", "6"),
      txRow(USDC.toLowerCase(), "USDC", "6"),
      txRow(DAI, "DAI", "18"),
      txRow("0x00000000000000000000000000000000000000ff", "BADDEC", "abc"),
      txRow("not-an-address", "BADADDR", "18"),
      txRow("0x00000000000000000000000000000000000000ee", "", "18"),
    ],
    tokenbalances: { [USDC.toLowerCase()]: "5000000", [DAI.toLowerCase()]: "0", "0x00000000000000000000000000000000000000ee": "2500000000000000000" },
  };

  it("reads native, discovers contracts through tokentx and queries each balance", async () => {
    const { p, calls } = make(server(fake));
    const balances = await p.readBalances(VITALIK, "ethereum");
    expect(actions(calls)).toEqual(["balance", "tokentx", "tokenbalance", "tokenbalance", "tokenbalance"]);
    expect(balances.map((b) => [b.contractAddress, b.symbol, b.amount, b.decimals])).toEqual([
      [null, "ETH", 1.5, 18],
      [USDC.toLowerCase(), "USDC", 5, 6],
      ["0x00000000000000000000000000000000000000ee", null, 2.5, 18],
    ]);
    expect(balances.every((b) => b.provider === "etherscan" && b.chain === "ethereum")).toBe(true);
    expect(balances[1]?.rawAmount).toBe("5000000");
    expect(balances.filter((b) => b.contractAddress !== null).every((b) => b.looksLikeSpam)).toBe(true);
    expect(balances[0]?.looksLikeSpam).toBe(false);
    expect(balances.every((b) => b.usdRateHint === null)).toBe(true);
    expect(p.providesUsdRateHint).toBe(false);
  });

  it("sends chainid, module, key and tokentx paging parameters", async () => {
    const { p, calls } = make(server(fake));
    await p.readBalances(VITALIK, "arbitrum");
    const first = calls[0]?.url;
    expect(first ? first.origin + first.pathname : null).toBe("https://api.etherscan.io/v2/api");
    expect(calls.every((c) => c.url.searchParams.get("chainid") === "42161")).toBe(true);
    expect(calls.every((c) => c.url.searchParams.get("module") === "account")).toBe(true);
    expect(calls.every((c) => c.url.searchParams.get("apikey") === KEY)).toBe(true);
    expect(calls.every((c) => c.url.searchParams.get("address") === VITALIK)).toBe(true);
    const tx = calls[1]?.url.searchParams;
    expect(tx?.get("page")).toBe("1");
    expect(tx?.get("offset")).toBe("1000");
    expect(tx?.get("sort")).toBe("desc");
    expect(calls[2]?.url.searchParams.get("contractaddress")).toBe(USDC.toLowerCase());
  });

  it("uses chainid 1 for Ethereum and 8453 for Base", async () => {
    for (const [chain, id] of [["ethereum", "1"], ["base", "8453"]] as [Chain, string][]) {
      const { p, calls } = make(server({ balance: "1" }));
      await p.readBalances(VITALIK, chain);
      expect(calls[0]?.url.searchParams.get("chainid")).toBe(id);
    }
  });

  it("returns no native entry for a zero balance", async () => {
    const { p } = make(server({ balance: "0" }));
    expect(await p.readBalances(VITALIK, "ethereum")).toEqual([]);
  });

  it("passes an abort signal on every request", async () => {
    const { p, calls } = make(server(fake));
    await p.readBalances(VITALIK, "ethereum");
    expect(calls.every((c) => c.init?.signal instanceof AbortSignal)).toBe(true);
  });
});

describe("EtherscanProvider empty results", () => {
  it("treats 'No transactions found' as an empty token history, not an error", async () => {
    const handler: Handler = (url) => (url.searchParams.get("action") === "tokentx" ? notOk([], "No transactions found") : ok("2000000000000000000"));
    const { p, calls } = make(handler);
    const balances = await p.readBalances(VITALIK, "ethereum");
    expect(balances.map((b) => [b.symbol, b.amount])).toEqual([["ETH", 2]]);
    expect(actions(calls)).toEqual(["balance", "tokentx"]);
  });

  it("does not treat a NOTOK with a string result as empty", async () => {
    const handler: Handler = (url) => (url.searchParams.get("action") === "tokentx" ? notOk("Some other failure") : ok("1"));
    const { p } = make(handler);
    expect((await readError(p.readBalances(VITALIK, "ethereum"))).kind).toBe("bad_response");
  });
});

describe("EtherscanProvider discovery limits", () => {
  const many = Array.from({ length: 5 }, (_, i) => txRow(`0x${String(i + 1).padStart(40, "0")}`, `T${i}`, "18"));

  it("checks at most maxTokens contracts, most recent first", async () => {
    const tokenbalances = Object.fromEntries(many.map((r) => [r.contractAddress, "1000000000000000000"]));
    const { p, calls } = make(server({ balance: "0", tokentx: many, tokenbalances }), { maxTokens: 2 });
    const balances = await p.readBalances(VITALIK, "ethereum");
    expect(actions(calls).filter((a) => a === "tokenbalance")).toHaveLength(2);
    expect(balances.map((b) => b.symbol)).toEqual(["T0", "T1"]);
  });

  it("fetches a second tokentx page only when the first is full, up to maxTokentxPages", async () => {
    const full = Array.from({ length: 1000 }, () => txRow(USDC, "USDC", "6"));
    for (const [limit, expected] of [[2, 2], [1, 1], [5, 5]] as [number, number][]) {
      const { p, calls } = make(server({ balance: "0", tokentx: full, tokenbalances: { [USDC.toLowerCase()]: "1" } }), { maxTokentxPages: limit });
      await p.readBalances(VITALIK, "ethereum");
      const pages = calls.filter((c) => c.url.searchParams.get("action") === "tokentx").map((c) => c.url.searchParams.get("page"));
      expect(pages).toHaveLength(expected);
      expect(pages).toEqual(Array.from({ length: expected }, (_, i) => String(i + 1)));
    }
  });

  it("stops after a short first page", async () => {
    const { p, calls } = make(server({ balance: "0", tokentx: many.slice(0, 2) }), { maxTokentxPages: 5 });
    await p.readBalances(VITALIK, "ethereum");
    expect(calls.filter((c) => c.url.searchParams.get("action") === "tokentx")).toHaveLength(1);
  });
});

describe("EtherscanProvider pacing", () => {
  it("spaces calls at least minIntervalMs apart", async () => {
    const fake: Fake = { balance: "1", tokentx: [txRow(USDC, "USDC", "6"), txRow(DAI, "DAI", "18")], tokenbalances: { [USDC.toLowerCase()]: "1", [DAI.toLowerCase()]: "1" } };
    const { p, sleeps } = make(server(fake));
    await p.readBalances(VITALIK, "ethereum");
    expect(sleeps).toEqual([350, 350, 350]);
  });

  it("honours a custom minIntervalMs", async () => {
    const { p, sleeps } = make(server({ balance: "1" }), { minIntervalMs: 900 });
    await p.readBalances(VITALIK, "ethereum");
    expect(sleeps).toEqual([900]);
  });

  it("spaces calls even when two chains are read in parallel on one instance", async () => {
    const starts: number[] = [];
    const clock = { now: 5_000 };
    const handler: Handler = (url) => {
      starts.push(clock.now);
      return server({ balance: "1", tokentx: [txRow(USDC, "USDC", "6")], tokenbalances: { [USDC.toLowerCase()]: "1" } })(url, undefined);
    };
    const { fetchImpl } = makeFetch(handler);
    const p = new EtherscanProvider({
      apiKey: KEY,
      fetchImpl,
      now: () => clock.now,
      sleep: async (ms) => {
        clock.now += ms;
      },
    });
    await Promise.all([p.readBalances(VITALIK, "ethereum"), p.readBalances(VITALIK, "arbitrum")]);
    expect(starts).toHaveLength(6);
    for (let i = 1; i < starts.length; i++) expect((starts[i] ?? 0) - (starts[i - 1] ?? 0)).toBeGreaterThanOrEqual(350);
  });

  it("does not stall later calls after an earlier call failed", async () => {
    let n = 0;
    const healthy = server({ balance: "1000000000000000000" });
    const handler: Handler = (url, init) => (n++ === 0 ? text("down", 503) : healthy(url, init));
    const { p } = make(handler);
    expect((await readError(p.readBalances(VITALIK, "ethereum"))).kind).toBe("network");
    expect((await p.readBalances(VITALIK, "ethereum")).map((b) => b.amount)).toEqual([1]);
  });
});

describe("EtherscanProvider error classification", () => {
  it("classifies the HTTP-200 'free API not supported' answer on Base as plan_unsupported", async () => {
    const { p, calls } = make(() => notOk(PLAN_MESSAGE));
    const error = await readError(p.readBalances(VITALIK, "base"));
    expect(error.kind).toBe("plan_unsupported");
    expect(error.chain).toBe("base");
    expect(error.provider).toBe("etherscan");
    expect(error.message).toContain("Base");
    expect(error.message).not.toContain(KEY);
    expect(calls).toHaveLength(1);
  });

  it.each(["Max calls per sec rate limit reached (3/sec)", "Max rate limit reached, please use API Key for higher rate limit"])("classifies %j as rate_limited", async (message) => {
    const { p } = make(() => notOk(message));
    expect((await readError(p.readBalances(VITALIK, "ethereum"))).kind).toBe("rate_limited");
  });

  it("classifies HTTP 429 as rate_limited", async () => {
    const { p } = make(() => text("slow", 429));
    expect((await readError(p.readBalances(VITALIK, "ethereum"))).kind).toBe("rate_limited");
  });

  it("classifies an invalid key as plan_unsupported so the next provider can be tried", async () => {
    const { p } = make(() => notOk("Invalid API Key"));
    const error = await readError(p.readBalances(VITALIK, "ethereum"));
    expect(error.kind).toBe("plan_unsupported");
    expect(error.message).not.toContain(KEY);
  });

  it("classifies an unrecognised NOTOK as bad_response with Etherscan's text", async () => {
    const { p } = make(() => notOk("Unexpected internal error"));
    const error = await readError(p.readBalances(VITALIK, "ethereum"));
    expect(error.kind).toBe("bad_response");
    expect(error.detail).toBe("Unexpected internal error");
  });

  it("classifies a server error as network and a failing fetch as network", async () => {
    expect((await readError(make(() => text("down", 502)).p.readBalances(VITALIK, "ethereum"))).kind).toBe("network");
    const failing = make(() => {
      throw new Error("ECONNREFUSED");
    });
    expect((await readError(failing.p.readBalances(VITALIK, "ethereum"))).kind).toBe("network");
  });

  it("aborts a hanging request after timeoutMs and reports timeout without leaking the key", async () => {
    const p = new EtherscanProvider({ apiKey: KEY, fetchImpl: hangingFetch, timeoutMs: 30, minIntervalMs: 0 });
    const error = await readError(p.readBalances(VITALIK, "arbitrum"));
    expect(error.kind).toBe("timeout");
    expect(error.chain).toBe("arbitrum");
    expect(error.message).not.toContain(KEY);
  });

  it("rejects a non-JSON body and a body that is not an Etherscan envelope", async () => {
    expect((await readError(make(() => text("<html>")).p.readBalances(VITALIK, "ethereum"))).kind).toBe("bad_response");
    expect((await readError(make(() => json({ hello: "world" })).p.readBalances(VITALIK, "ethereum"))).kind).toBe("bad_response");
    expect((await readError(make(() => json([1, 2])).p.readBalances(VITALIK, "ethereum"))).kind).toBe("bad_response");
  });

  it.each(["abc", "-5", "1.5", 12, null])("rejects a native balance result of %j", async (result) => {
    const { p } = make(() => ok(result));
    expect((await readError(p.readBalances(VITALIK, "ethereum"))).kind).toBe("bad_response");
  });

  it("rejects a tokentx result that is not a list", async () => {
    const handler: Handler = (url) => (url.searchParams.get("action") === "tokentx" ? ok("nope") : ok("1"));
    expect((await readError(make(handler).p.readBalances(VITALIK, "ethereum"))).kind).toBe("bad_response");
  });

  it("rejects a tokenbalance that is not a raw-unit string and does not return a partial list", async () => {
    const handler: Handler = (url) => {
      const action = url.searchParams.get("action");
      if (action === "tokentx") return ok([txRow(USDC, "USDC", "6")]);
      if (action === "tokenbalance") return ok("oops");
      return ok("1");
    };
    expect((await readError(make(handler).p.readBalances(VITALIK, "ethereum"))).kind).toBe("bad_response");
  });

  it("fails the whole read when a later tokenbalance is rate limited", async () => {
    const handler: Handler = (url) => {
      const action = url.searchParams.get("action");
      if (action === "tokentx") return ok([txRow(USDC, "USDC", "6"), txRow(DAI, "DAI", "18")]);
      if (action === "tokenbalance" && url.searchParams.get("contractaddress") === DAI.toLowerCase()) return notOk("Max calls per sec rate limit reached (3/sec)");
      return ok("1");
    };
    expect((await readError(make(handler).p.readBalances(VITALIK, "ethereum"))).kind).toBe("rate_limited");
  });
});

describe("EtherscanProvider configuration", () => {
  it("refuses an empty API key", () => {
    expect(() => new EtherscanProvider({ apiKey: "" })).toThrow(/API key is empty/);
  });

  it("supports the three chains and rejects an unknown one", () => {
    const { p } = make(server({}));
    for (const chain of ["ethereum", "base", "arbitrum"] as Chain[]) expect(p.supports(chain)).toBe(true);
    expect(p.supports("polygon" as Chain)).toBe(false);
  });

  it("refuses to read an unknown chain without calling the network", async () => {
    const { p, calls } = make(server({}));
    expect((await readError(p.readBalances(VITALIK, "polygon" as Chain))).kind).toBe("bad_response");
    expect(calls).toHaveLength(0);
  });
});
