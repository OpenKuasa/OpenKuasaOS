/**
 * Bill arithmetic for the form's live totals. Pure, and exact: the sums are
 * done in whole numbers, so the figure on the form is the figure the database
 * stores, to the sen.
 */
import { isIsoDate, roundRate } from './bills';

export type LineNumbers = { quantity: number; unit_price: number; sst_rate: number };
export type LineAmounts = { amount: number; sst: number };
export type BillTotals = { subtotal: number; sst: number; total: number };

/** A whole number of 10^-places units; 0 for anything that is not a number above 0. */
function units(value: number, places: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return BigInt(0);
  const scaled = Math.round(value * 10 ** places);
  return Number.isFinite(scaled) ? BigInt(scaled) : BigInt(0);
}

/** Divides and rounds half up, as Postgres rounds a numeric. Both numbers are 0 or more. */
function divideRounded(value: bigint, by: bigint): bigint {
  return (value + by / BigInt(2)) / by;
}

function lineSen(line: LineNumbers): { amount: bigint; sst: bigint } {
  // Quantity keeps 3 decimals, unit price 4 and the SST rate 2, as saveBillInput rounds them.
  const product = units(line.quantity, 3) * units(line.unit_price, 4);
  return {
    amount: divideRounded(product, BigInt(100_000)),
    sst: divideRounded(product * units(roundRate(line.sst_rate), 2), BigInt(1_000_000_000)),
  };
}

/**
 * One line's amount and SST. These mirror the generated columns
 * supplier_bill_lines.amount = round(quantity * unit_price, 2) and
 * supplier_bill_lines.sst_amount = round(quantity * unit_price * sst_rate / 100, 2).
 */
export function lineAmounts(line: LineNumbers): LineAmounts {
  const sen = lineSen(line);
  return { amount: Number(sen.amount) / 100, sst: Number(sen.sst) / 100 };
}

/** Subtotal, SST and total: the sum of each line's rounded amounts, as supplier_bill_totals adds them. */
export function billTotals(lines: LineNumbers[]): BillTotals {
  let subtotal = BigInt(0);
  let sst = BigInt(0);
  for (const line of lines) {
    const sen = lineSen(line);
    subtotal += sen.amount;
    sst += sen.sst;
  }
  return { subtotal: Number(subtotal) / 100, sst: Number(sst) / 100, total: Number(subtotal + sst) / 100 };
}

/** 2026-10-11 plus 30 days is 2026-11-10. A date that is not valid comes back unchanged. */
export function addDaysIso(iso: string, days: number): string {
  if (!isIsoDate(iso) || !Number.isFinite(days)) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.trunc(days));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

/**
 * The date on the person's own calendar, as YYYY-MM-DD. Form defaults use it:
 * the UTC date is still yesterday until 08:00 in Malaysia.
 */
export function localIsoDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
