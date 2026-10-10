/**
 * Pure builders for the two payroll screens (Payroll, Payment Vouchers).
 * Both are for owners and admins: `readPayroll` / `readVouchers` return null
 * without reading anything for anyone else.
 */

import { monthLabel, monthYearLabel } from './dates';
import { isTeamView } from './own';
import { bucketByMonth, sumBy } from './series';
import type { Bucket } from './series';
import { payrollSummary } from './summaries';
import type { PaymentVoucher, PayrollRun, PeopleData, PeopleViewer, Payslip } from './types';

/** How many runs the cost chart shows. */
const RUN_MONTHS = 12;

export type PayslipRow = Payslip & { deductions_cents: number };

export type PayrollModel = {
  /** The newest run, or null when the workspace has none. */
  latest: {
    period_month: string;
    /** `October 2026`. */
    label: string;
    status: PayrollRun['status'];
    /** Payslips in the run. */
    headcount: number;
    paid_count: number;
    gross_cents: number;
    net_cents: number;
    deductions_cents: number;
    epf_cents: number;
    socso_cents: number;
    eis_cents: number;
    pcb_cents: number;
    slips: PayslipRow[];
  } | null;
  /** Gross in ringgit per run, oldest first. */
  by_month: Bucket[];
  /** The latest run's deductions in cents, as recorded on the payslips. Empty when there is no run. */
  deductions: { key: string; label: string; value: number }[];
};

type DeductionField = 'epf_cents' | 'socso_cents' | 'eis_cents' | 'pcb_cents';

const sum = (rows: Payslip[], field: DeductionField) => rows.reduce((total, row) => total + row[field], 0);

export function payrollModel(runs: PayrollRun[], payslips: Payslip[]): PayrollModel {
  // Newest first. A run with no payslips has nothing to show, so it is left out (the Dashboard does the same).
  const totals = payrollSummary(runs, payslips).filter((t) => t.headcount > 0);
  const newest = totals[0];
  if (!newest) return { latest: null, by_month: [], deductions: [] };
  const run = runs.find((r) => r.period_month === newest.period_month)!;
  const slips = payslips
    .filter((p) => p.payroll_run_id === run.id)
    .map((p) => ({ ...p, deductions_cents: p.gross_cents - p.net_cents }))
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  const epf = sum(slips, 'epf_cents');
  const socso = sum(slips, 'socso_cents');
  const eis = sum(slips, 'eis_cents');
  const pcb = sum(slips, 'pcb_cents');
  return {
    latest: {
      period_month: newest.period_month,
      label: monthYearLabel(newest.period_month),
      status: newest.status,
      headcount: newest.headcount,
      paid_count: slips.filter((s) => s.status === 'paid').length,
      gross_cents: newest.gross_cents,
      net_cents: newest.net_cents,
      deductions_cents: newest.deductions_cents,
      epf_cents: epf,
      socso_cents: socso,
      eis_cents: eis,
      pcb_cents: pcb,
      slips,
    },
    by_month: totals
      .slice(0, RUN_MONTHS)
      .reverse()
      .map((t) => ({
        start: t.period_month,
        label: monthLabel(t.period_month),
        value: t.gross_cents / 100,
      })),
    deductions: [
      { key: 'epf', label: 'EPF', value: epf },
      { key: 'pcb', label: 'PCB', value: pcb },
      { key: 'socso', label: 'SOCSO', value: socso },
      { key: 'eis', label: 'EIS', value: eis },
    ],
  };
}

/** Reads and builds the payroll model; null (and no read) unless the viewer is HR or in the demo. */
export async function readPayroll(data: PeopleData, viewer: PeopleViewer): Promise<PayrollModel | null> {
  if (!isTeamView(viewer)) return null;
  const [runs, payslips] = await Promise.all([data.listPayrollRuns(), data.listPayslips()]);
  return payrollModel(runs, payslips);
}

export type VouchersModel = {
  count: number;
  total_cents: number;
  paid_count: number;
  draft_count: number;
  /** Issued but not yet paid, whatever the date. */
  outstanding_count: number;
  outstanding_cents: number;
  /** Vouchers dated this month; a draft has not been issued, so it is in neither figure. */
  month: { issued_cents: number; paid_cents: number };
  /** Ringgit per month, last 6 months, oldest first. */
  by_month: Bucket[];
  /** Cents per voucher type, largest first. */
  by_type: { key: string; value: number }[];
  /** Newest first. */
  rows: PaymentVoucher[];
};

export function vouchersModel(vouchers: PaymentVoucher[], today: string): VouchersModel {
  const total = (rows: PaymentVoucher[]) => rows.reduce((t, v) => t + v.amount_cents, 0);
  const thisMonth = vouchers.filter((v) => v.issued_date.slice(0, 7) === today.slice(0, 7));
  const outstanding = vouchers.filter((v) => v.status === 'issued');
  return {
    count: vouchers.length,
    total_cents: total(vouchers),
    paid_count: vouchers.filter((v) => v.status === 'paid').length,
    draft_count: vouchers.filter((v) => v.status === 'draft').length,
    outstanding_count: outstanding.length,
    outstanding_cents: total(outstanding),
    month: {
      issued_cents: total(thisMonth.filter((v) => v.status !== 'draft')),
      paid_cents: total(thisMonth.filter((v) => v.status === 'paid')),
    },
    by_month: bucketByMonth(vouchers, (v) => v.issued_date, (v) => v.amount_cents / 100, today, 6),
    by_type: sumBy(vouchers, (v) => v.voucher_type, (v) => v.amount_cents),
    rows: [...vouchers].sort(
      (a, b) => b.issued_date.localeCompare(a.issued_date) || b.voucher_no.localeCompare(a.voucher_no),
    ),
  };
}

/** Reads and builds the vouchers model; null (and no read) unless the viewer is HR or in the demo. */
export async function readVouchers(
  data: PeopleData,
  viewer: PeopleViewer,
  today: string,
): Promise<VouchersModel | null> {
  if (!isTeamView(viewer)) return null;
  return vouchersModel(await data.listPaymentVouchers(), today);
}
