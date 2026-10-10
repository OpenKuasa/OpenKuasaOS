/**
 * CSV for the Export buttons. Pure; the browser download itself is in
 * src/components/finance/download-csv.ts.
 */

/** Excel reads a file that starts with this as UTF-8, so Malay and Chinese names survive. */
export const CSV_BOM = '﻿';

export type CsvValue = string | number | null;

function cell(value: CsvValue): string {
  if (value === null) return '';
  // A number is written as it is: -120.5 is an amount, not a formula.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  // A spreadsheet runs text starting with one of these as a formula, and names are typed by people.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * RFC 4180: a field with a comma, a quote or a line break is quoted, quotes
 * are doubled, and every line ends CRLF.
 */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return CSV_BOM + [headers, ...rows].map((row) => `${row.map(cell).join(',')}\r\n`).join('');
}

/** supplier-bills and 2026-10-11 give supplier-bills-2026-10-11.csv */
export function csvFileName(prefix: string, today: string): string {
  return `${prefix}-${today}.csv`;
}
