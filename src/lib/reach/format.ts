/** Format cents as `RM 1,234.50`. */
export function rm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
