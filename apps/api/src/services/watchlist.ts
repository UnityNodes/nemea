import type { Holding } from "@nemea/shared-types";
import type { Row } from "@nemea/alerts";
import { tierHoldings } from "@nemea/alerts";
import { PEGGED_USD_WATCHLIST } from "../config.ts";

export const PEGGED_IDS: ReadonlySet<number> = new Set(PEGGED_USD_WATCHLIST.map((p) => p.cmcId));

export type Workload = { stablecoinIds: number[]; topIds: number[]; smallIds: number[] };

export function buildWorkload(perUser: ReadonlyArray<{ rows: Row[] }>): Workload {
  const top = new Set<number>();
  const all = new Set<number>();
  for (const { rows } of perUser) {
    const tiers = tierHoldings(rows);
    for (const [id, tier] of tiers) {
      all.add(id);
      if (tier === "top") top.add(id);
    }
  }
  const stable = new Set<number>(PEGGED_IDS);
  const topIds = [...top].filter((id) => !stable.has(id));
  const smallIds = [...all].filter((id) => !top.has(id) && !stable.has(id));
  return { stablecoinIds: [...stable], topIds, smallIds };
}

export function heldIds(holdings: readonly Holding[]): number[] {
  return [...new Set(holdings.map((h) => h.cmcId))];
}
