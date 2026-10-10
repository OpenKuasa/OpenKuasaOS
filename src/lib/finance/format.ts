/** RM 1,240.00 */
export function rm(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Short money for KPI cards: RM 2,600 / RM 12.7k. */
export function rmShort(n: number) {
  return n >= 10_000
    ? `RM ${(n / 1000).toFixed(1)}k`
    : `RM ${Math.round(n).toLocaleString('en-MY')}`;
}
