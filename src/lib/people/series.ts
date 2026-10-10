/**
 * Pure helpers that turn rows into chart series and figures. Dates are
 * `YYYY-MM-DD` strings; "today" comes from `todayInMalaysia`.
 */

import { addDays, addMonths, formatDay, monthLabel, monthStart, weekStart } from './dates';

export type Bucket = { start: string; label: string; value: number };

const round2 = (value: number) => Math.round(value * 100) / 100;

function fill<T>(
  rows: T[],
  dateOf: (row: T) => string | null,
  valueOf: (row: T) => number,
  starts: string[],
  startOf: (date: string) => string,
  labelOf: (start: string) => string,
): Bucket[] {
  const totals = new Map(starts.map((start) => [start, 0]));
  for (const row of rows) {
    const date = dateOf(row);
    if (!date) continue;
    const start = startOf(date);
    const total = totals.get(start);
    if (total !== undefined) totals.set(start, total + valueOf(row));
  }
  return starts.map((start) => ({ start, label: labelOf(start), value: round2(totals.get(start) ?? 0) }));
}

/** The last `months` calendar months ending with today's, oldest first, zero-filled. label: 'Oct'. */
export function bucketByMonth<T>(
  rows: T[],
  dateOf: (row: T) => string | null,
  valueOf: (row: T) => number,
  today: string,
  months: number,
): Bucket[] {
  const last = monthStart(today);
  const starts = Array.from({ length: Math.max(0, months) }, (_, i) => addMonths(last, i - (months - 1)));
  return fill(rows, dateOf, valueOf, starts, monthStart, monthLabel);
}

/** The last `weeks` Monday-started weeks ending with today's, oldest first, zero-filled. label: '05 Oct' (the Monday). */
export function bucketByWeek<T>(
  rows: T[],
  dateOf: (row: T) => string | null,
  valueOf: (row: T) => number,
  today: string,
  weeks: number,
): Bucket[] {
  const last = weekStart(today);
  const starts = Array.from({ length: Math.max(0, weeks) }, (_, i) => addDays(last, (i - (weeks - 1)) * 7));
  return fill(rows, dateOf, valueOf, starts, weekStart, formatDay);
}

/** Totals per key, largest first, ties by key. Rows whose key is null are left out. */
export function sumBy<T>(
  rows: T[],
  keyOf: (row: T) => string | null,
  valueOf: (row: T) => number,
): { key: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    totals.set(key, (totals.get(key) ?? 0) + valueOf(row));
  }
  return [...totals.entries()]
    .map(([key, value]) => ({ key, value: round2(value) }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

/** value / total as a whole percent, or null when total is 0. */
export function percent(value: number, total: number): number | null {
  return total === 0 ? null : Math.round((value / total) * 100);
}

/** The mean to 1 decimal, or null for no values. */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}
