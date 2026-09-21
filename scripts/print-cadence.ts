import { DESIRED_CADENCE, estimateMonthlyCredits, planCadence } from "@nemea/cmc-client";

const workload = {
  stablecoinIds: [825, 3408, 4943, 29470],
  topIds: [1, 1027, 5426],
  smallIds: [1975, 7083, 52],
};

const plans: Array<[string, number]> = [
  ["Basic (free)", 15_000],
  ["Builder", 150_000],
  ["Startup", 450_000],
];

const min = (sec: number) => (sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`);

console.log(`desired: depeg ${min(DESIRED_CADENCE.stablecoinsSec)}, top ${min(DESIRED_CADENCE.topSec)}, small ${min(DESIRED_CADENCE.smallSec)}, global ${min(DESIRED_CADENCE.globalSec)}, categories ${min(DESIRED_CADENCE.categoriesSec)}`);
console.log(`desired cadence costs ${estimateMonthlyCredits(DESIRED_CADENCE, workload).perMonth} credits/month for this workload\n`);
console.log("| Plan | Credits/month | Depeg check | Top holdings | Small holdings | Global | Est. credits/month | Verdict |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [name, limit] of plans) {
  const p = planCadence(limit, workload);
  console.log(`| ${name} | ${limit.toLocaleString("en-US")} | every ${min(p.cadence.stablecoinsSec)} | every ${min(p.cadence.topSec)} | every ${min(p.cadence.smallSec)} | every ${min(p.cadence.globalSec)} | ${p.estimatedCreditsPerMonth.toLocaleString("en-US")} | ${p.verdict} |`);
}
