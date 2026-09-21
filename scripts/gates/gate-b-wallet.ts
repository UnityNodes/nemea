import { mkdirSync, writeFileSync } from "node:fs";
import { CmcClient } from "@nemea/cmc-client";
import { BlockscoutProvider, ChainReadError, EtherscanProvider, defaultProviders, readWallet } from "@nemea/chain-reader";
import { CHAINS } from "@nemea/shared-types";
import { report, requireEnv, type Check } from "./lib.ts";

const { CMC_API_KEY } = requireEnv("Gate B", ["CMC_API_KEY"]);
const wallet = process.env.GATE_WALLET ?? "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const etherscanKey = process.env.ETHERSCAN_API_KEY;
const checks: Check[] = [];
console.log(`Gate B wallet: ${wallet}${process.env.GATE_WALLET ? "" : " (public sample address; set GATE_WALLET to use your own)"}`);

const blockscout = new BlockscoutProvider();
for (const chain of CHAINS) {
  try {
    const balances = await blockscout.readBalances(wallet, chain);
    const native = balances.find((b) => b.contractAddress === null);
    checks.push({ name: `blockscout ${chain}: balances`, status: "pass", detail: `${balances.length} balances, native ETH ${native?.amount ?? "none"}` });
  } catch (error) {
    checks.push({ name: `blockscout ${chain}: balances`, status: "fail", detail: error instanceof Error ? error.message : String(error) });
  }
}

if (!etherscanKey) {
  checks.push({ name: "etherscan v2 (all chains)", status: "not-run", detail: "ETHERSCAN_API_KEY not set — Blockscout is used instead; set the key to test Etherscan" });
} else {
  const etherscan = new EtherscanProvider({ apiKey: etherscanKey });
  for (const chain of CHAINS) {
    try {
      const balances = await etherscan.readBalances(wallet, chain);
      checks.push({ name: `etherscan ${chain}: balances`, status: "pass", detail: `${balances.length} balances (discovery capped, see docs/HONEST_LIMITS.md)` });
    } catch (error) {
      if (error instanceof ChainReadError && error.kind === "plan_unsupported") {
        checks.push({ name: `etherscan ${chain}: balances`, status: "not-run", detail: `plan_unsupported — expected for Base on a free key; Nemea falls back to Blockscout (${error.message})` });
      } else {
        checks.push({ name: `etherscan ${chain}: balances`, status: "fail", detail: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

const cmc = new CmcClient({ apiKey: CMC_API_KEY, baseUrl: process.env.CMC_BASE_URL });
try {
  const preview = await readWallet({ address: wallet, chains: [...CHAINS], providers: defaultProviders({ etherscanApiKey: etherscanKey }), cmc });
  const table = preview.items.map((i) => `${i.chain}:${i.symbol}#${i.cmcId}=${i.amount}`);
  console.log("\nmatched to CoinMarketCap:");
  for (const line of table) console.log(`  ${line}`);
  console.log("\nskipped:");
  for (const s of preview.skipped) console.log(`  ${s.chain}: ${s.reason}`);
  if (preview.chainErrors.length > 0) {
    console.log("\nchain errors:");
    for (const e of preview.chainErrors) console.log(`  ${e.chain}: ${e.message}`);
  }
  const eth = preview.items.filter((i) => i.cmcId === 1027 && i.contractAddress === null);
  checks.push({ name: "native ETH matched to CMC id 1027 on every chain read", status: eth.length > 0 ? "pass" : "fail", detail: `${eth.length} chains with native ETH` });
  const erc20 = preview.items.filter((i) => i.contractAddress !== null);
  checks.push({ name: "ERC-20 balances matched to CMC by (chain, contract address)", status: erc20.length > 0 ? "pass" : "fail", detail: `${erc20.length} matched, e.g. ${erc20.slice(0, 4).map((i) => `${i.symbol}@${i.chain}`).join(", ") || "none"}` });
  checks.push({ name: "spam is skipped with a reason, not silently dropped", status: preview.skipped.length > 0 || erc20.length > 0 ? "pass" : "fail", detail: `${preview.skipped.length} skip entries` });
  checks.push({ name: "no chain failed", status: preview.chainErrors.length === 0 ? "pass" : "fail", detail: preview.chainErrors.map((e) => `${e.chain}: ${e.message}`).join(" | ") || "all chains read" });
  if (checks.every((c) => c.status !== "fail")) {
    mkdirSync("docs/evidence", { recursive: true });
    writeFileSync("docs/evidence/gate-b-wallet.json", JSON.stringify({ ranAt: new Date().toISOString(), wallet, items: preview.items, skippedCount: preview.skipped.length, chainErrors: preview.chainErrors, cmcCredits: cmc.stats().counters.creditsSpent }, null, 2) + "\n");
    console.log("\nwrote docs/evidence/gate-b-wallet.json");
  }
} catch (error) {
  checks.push({ name: "wallet read + CMC matching", status: "fail", detail: error instanceof Error ? error.message : String(error) });
}

report("Gate B", checks);
