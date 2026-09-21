import type { PricePoint } from "@nemea/shared-types";
import type { SimilarDrop, SimilarDropsSummary } from "./types.ts";

const DAY_MS = 24 * 3600_000;
const RECENT_EXCLUDE_DAYS = 2;
const MERGE_WITHIN_DAYS = 3;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function sortedPoints(points: readonly PricePoint[]): Array<{ t: number; ts: string; price: number }> {
  return points
    .map((p) => ({ t: Date.parse(p.ts), ts: p.ts, price: p.priceUsd }))
    .filter((p) => Number.isFinite(p.t) && p.price > 0)
    .sort((a, b) => a.t - b.t);
}

export function findSimilarDrops(points: readonly PricePoint[], thresholdPct: number): SimilarDropsSummary | null {
  const pts = sortedPoints(points);
  if (pts.length < 10) return null;
  const first = pts[0] as { t: number };
  const last = pts[pts.length - 1] as { t: number };
  const windowDays = Math.round((last.t - first.t) / DAY_MS);
  const events: SimilarDrop[] = [];
  let lastEventIndex = -Infinity;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1] as { t: number; ts: string; price: number };
    const cur = pts[i] as { t: number; ts: string; price: number };
    const change = (cur.price / prev.price - 1) * 100;
    if (change > -thresholdPct) continue;
    if (last.t - cur.t < RECENT_EXCLUDE_DAYS * DAY_MS) continue;
    const continuesSlide = i - lastEventIndex <= MERGE_WITHIN_DAYS;
    lastEventIndex = i;
    if (continuesSlide) continue;
    let recoveredAfterDays: number | null = null;
    for (let j = i + 1; j < pts.length; j++) {
      const later = pts[j] as { t: number; price: number };
      if (later.price >= prev.price) {
        recoveredAfterDays = Math.max(1, Math.round((later.t - cur.t) / DAY_MS));
        break;
      }
    }
    events.push({ startedAt: prev.ts, dropPct: change, recoveredAfterDays });
  }
  const recovered = events.filter((e) => e.recoveredAfterDays !== null);
  return {
    thresholdPct,
    windowDays,
    events,
    recoveredCount: recovered.length,
    notRecoveredCount: events.length - recovered.length,
    medianRecoveryDays: median(recovered.map((e) => e.recoveredAfterDays as number)),
  };
}

export type PegSummary = {
  floorUsd: number;
  windowDays: number;
  episodes: number;
  medianDaysBelow: number | null;
  longestDaysBelow: number | null;
  lowestCloseUsd: number | null;
  stillBelow: boolean;
};

export function summarizePegExcursions(points: readonly PricePoint[], floorUsd: number): PegSummary | null {
  const pts = sortedPoints(points);
  if (pts.length < 10) return null;
  const first = pts[0] as { t: number };
  const last = pts[pts.length - 1] as { t: number };
  const durations: number[] = [];
  let startIndex: number | null = null;
  let lowest: number | null = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as { t: number; price: number };
    if (p.price < floorUsd) {
      if (startIndex === null) startIndex = i;
      lowest = lowest === null ? p.price : Math.min(lowest, p.price);
    } else if (startIndex !== null) {
      const startT = (pts[startIndex] as { t: number }).t;
      durations.push(Math.max(1, Math.round((p.t - startT) / DAY_MS)));
      startIndex = null;
    }
  }
  const stillBelow = startIndex !== null;
  return {
    floorUsd,
    windowDays: Math.round((last.t - first.t) / DAY_MS),
    episodes: durations.length + (stillBelow ? 1 : 0),
    medianDaysBelow: median(durations),
    longestDaysBelow: durations.length > 0 ? Math.max(...durations) : null,
    lowestCloseUsd: lowest,
    stillBelow,
  };
}
