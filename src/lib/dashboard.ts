import { MODEL_PRICES } from "./prices";
import type { CacheStatsRow, DailyBreakdownRow } from "./queries";

export const fmtUsd = (n: number | null) =>
  n === null ? "—" : `$${n.toFixed(n >= 1 ? 2 : 4)}`;

export const fmtSignedUsd = (n: number) =>
  `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(n >= 1 || n <= -1 ? 2 : 4)}`;

export function summarizeCache(rows: CacheStatsRow[]) {
  let totalInput = 0;
  let totalCacheRead = 0;
  let totalCacheCreate = 0;
  let savings = 0;
  for (const r of rows) {
    totalInput += r.input;
    totalCacheRead += r.cacheRead;
    totalCacheCreate += r.cacheCreate;
    const price = MODEL_PRICES[r.model];
    if (!price) continue;
    const perToken = price.input - (price.cacheRead ?? 0);
    savings += (r.cacheRead * perToken) / 1_000_000;
  }
  const denom = totalInput + totalCacheRead;
  const hitRatio = denom > 0 ? totalCacheRead / denom : null;
  return {
    hitRatio,
    cacheRead: totalCacheRead,
    cacheCreate: totalCacheCreate,
    savings: Number(savings.toFixed(4)),
  };
}

export function pivot(rows: DailyBreakdownRow[]) {
  const days = new Set<string>();
  const keys = new Set<string>();
  for (const r of rows) {
    days.add(r.day);
    keys.add(r.key);
  }
  const sortedDays = [...days].sort();
  const sortedKeys = [...keys].sort();
  const byDay = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const row = byDay.get(r.day) ?? {};
    row[r.key] = (row[r.key] ?? 0) + r.cost;
    byDay.set(r.day, row);
  }
  return {
    data: sortedDays.map((day) => ({ day, ...(byDay.get(day) ?? {}) })),
    keys: sortedKeys,
  };
}
