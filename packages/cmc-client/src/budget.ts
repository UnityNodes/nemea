export const SECONDS_PER_MONTH = 30 * 24 * 3600;
export const BASE_TICK_SECONDS = 60;
export const IDS_PER_CREDIT = 100;
export const ON_DEMAND_RESERVE = 0.15;

export type Cadence = {
  stablecoinsSec: number;
  topSec: number;
  smallSec: number;
  globalSec: number;
  categoriesSec: number;
};

export const DESIRED_CADENCE: Cadence = {
  stablecoinsSec: 60,
  topSec: 300,
  smallSec: 1800,
  globalSec: 900,
  categoriesSec: 1800,
};

export type Workload = {
  stablecoinIds: readonly number[];
  topIds: readonly number[];
  smallIds: readonly number[];
};

export type LaneName = "stablecoins" | "top" | "small" | "global" | "categories";

export function scaleCadence(base: Cadence, multiplier: number): Cadence {
  const snap = (sec: number) => Math.max(BASE_TICK_SECONDS, Math.round((sec * multiplier) / BASE_TICK_SECONDS) * BASE_TICK_SECONDS);
  return {
    stablecoinsSec: snap(base.stablecoinsSec),
    topSec: snap(base.topSec),
    smallSec: snap(base.smallSec),
    globalSec: snap(base.globalSec),
    categoriesSec: snap(base.categoriesSec),
  };
}

function ticksEvery(sec: number): number {
  return Math.max(1, Math.round(sec / BASE_TICK_SECONDS));
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

export function idsDueOnTick(tick: number, cadence: Cadence, workload: Workload): number[] {
  const due = new Set<number>();
  if (tick % ticksEvery(cadence.stablecoinsSec) === 0) for (const id of workload.stablecoinIds) due.add(id);
  if (tick % ticksEvery(cadence.topSec) === 0) for (const id of workload.topIds) due.add(id);
  if (tick % ticksEvery(cadence.smallSec) === 0) for (const id of workload.smallIds) due.add(id);
  return [...due];
}

export function globalDueOnTick(tick: number, cadence: Cadence): boolean {
  return tick % ticksEvery(cadence.globalSec) === 0;
}

export function categoriesDueOnTick(tick: number, cadence: Cadence): boolean {
  return tick % ticksEvery(cadence.categoriesSec) === 0;
}

export function creditsForIds(count: number): number {
  return count === 0 ? 0 : Math.ceil(count / IDS_PER_CREDIT);
}

export type CreditEstimate = {
  perMonth: number;
  callsPerMonth: number;
  cycleTicks: number;
};

export function estimateMonthlyCredits(cadence: Cadence, workload: Workload): CreditEstimate {
  const periods = [
    ticksEvery(cadence.stablecoinsSec),
    ticksEvery(cadence.topSec),
    ticksEvery(cadence.smallSec),
    ticksEvery(cadence.globalSec),
    ticksEvery(cadence.categoriesSec),
  ];
  const cycleTicks = periods.reduce(lcm, 1);
  let credits = 0;
  let calls = 0;
  for (let tick = 0; tick < cycleTicks; tick++) {
    const ids = idsDueOnTick(tick, cadence, workload);
    if (ids.length > 0) {
      credits += creditsForIds(ids.length);
      calls += Math.ceil(ids.length / IDS_PER_CREDIT);
    }
    if (globalDueOnTick(tick, cadence)) {
      credits += 1;
      calls += 1;
    }
    if (categoriesDueOnTick(tick, cadence)) {
      credits += 1;
      calls += 1;
    }
  }
  const cyclesPerMonth = SECONDS_PER_MONTH / (cycleTicks * BASE_TICK_SECONDS);
  return {
    perMonth: Math.ceil(credits * cyclesPerMonth),
    callsPerMonth: Math.ceil(calls * cyclesPerMonth),
    cycleTicks,
  };
}

export type BudgetVerdict = "fits" | "stretched" | "insufficient" | "unknown";

export type CadencePlan = {
  cadence: Cadence;
  multiplier: number;
  estimatedCreditsPerMonth: number;
  verdict: BudgetVerdict;
};

const MULTIPLIERS = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 24, 32, 48, 96];

export function planCadence(creditLimitMonthly: number | null, workload: Workload, desired: Cadence = DESIRED_CADENCE): CadencePlan {
  if (creditLimitMonthly === null) {
    const est = estimateMonthlyCredits(desired, workload);
    return { cadence: desired, multiplier: 1, estimatedCreditsPerMonth: est.perMonth, verdict: "unknown" };
  }
  const usable = creditLimitMonthly * (1 - ON_DEMAND_RESERVE);
  for (const multiplier of MULTIPLIERS) {
    const cadence = scaleCadence(desired, multiplier);
    const est = estimateMonthlyCredits(cadence, workload);
    if (est.perMonth <= usable) {
      return { cadence, multiplier, estimatedCreditsPerMonth: est.perMonth, verdict: multiplier === 1 ? "fits" : "stretched" };
    }
  }
  const last = MULTIPLIERS[MULTIPLIERS.length - 1] as number;
  const cadence = scaleCadence(desired, last);
  return {
    cadence,
    multiplier: last,
    estimatedCreditsPerMonth: estimateMonthlyCredits(cadence, workload).perMonth,
    verdict: "insufficient",
  };
}
