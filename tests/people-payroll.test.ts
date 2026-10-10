import { describe, expect, it, vi } from 'vitest';
import { payrollModel, readPayroll, readVouchers, vouchersModel } from '@/lib/people/payroll';
import { createSeedPeopleData } from '@/lib/people/seed';
import type { PaymentVoucher, PayrollRun, PeopleViewer, Payslip } from '@/lib/people/types';

const NOW = new Date('2026-10-09T04:00:00Z');
const TODAY = '2026-10-09';
const data = createSeedPeopleData(NOW);

const HR: PeopleViewer = { employeeId: null, isHr: true, isDemo: false };
const MEMBER: PeopleViewer = { employeeId: 'e1', isHr: false, isDemo: false };

describe('payrollModel on the sample data', () => {
  it('reports the latest run: draft, 20 payslips, RM 105,200.00 gross', async () => {
    const model = payrollModel(await data.listPayrollRuns(), await data.listPayslips());
    const latest = model.latest!;
    expect(latest.period_month).toBe('2026-10-01');
    expect(latest.label).toBe('October 2026');
    expect(latest.status).toBe('draft');
    expect(latest.headcount).toBe(20);
    expect(latest.gross_cents).toBe(10_520_000);
    expect(latest.slips).toHaveLength(20);
    expect(latest.gross_cents - latest.deductions_cents).toBe(latest.net_cents);
    expect(latest.epf_cents + latest.socso_cents + latest.eis_cents + latest.pcb_cents).toBe(latest.deductions_cents);
  });

  it('has gross by month, oldest first, for the runs that exist', async () => {
    const model = payrollModel(await data.listPayrollRuns(), await data.listPayslips());
    expect(model.by_month).toHaveLength(8);
    expect(model.by_month.at(-1)!.start).toBe('2026-10-01');
    expect(model.by_month.at(-1)!.value).toBe(105_200);
    const starts = model.by_month.map((b) => b.start);
    expect([...starts].sort()).toEqual(starts);
  });

  it('splits the latest run deductions into four named parts that add up', async () => {
    const model = payrollModel(await data.listPayrollRuns(), await data.listPayslips());
    expect(model.deductions.map((d) => d.label)).toEqual(['EPF', 'PCB', 'SOCSO', 'EIS']);
    expect(model.deductions.reduce((t, d) => t + d.value, 0)).toBe(model.latest!.deductions_cents);
  });
});

describe('payrollModel edge cases', () => {
  it('says there is no run rather than showing zeros', () => {
    const model = payrollModel([], []);
    expect(model.latest).toBeNull();
    expect(model.by_month).toEqual([]);
    expect(model.deductions).toEqual([]);
  });

  it('copes with a run that has no payslips', () => {
    const run: PayrollRun = { id: 'r', period_month: '2026-10-01', status: 'draft', paid_at: null };
    const model = payrollModel([run], []);
    expect(model.latest!.headcount).toBe(0);
    expect(model.latest!.gross_cents).toBe(0);
  });

  it('only lists the latest run payslips, by name', () => {
    const runs: PayrollRun[] = [
      { id: 'a', period_month: '2026-09-01', status: 'paid', paid_at: null },
      { id: 'b', period_month: '2026-10-01', status: 'draft', paid_at: null },
    ];
    const slip = (id: string, run: string, name: string): Payslip => ({
      id, employee_id: id, employee_name: name, payroll_run_id: run, period_month: '2026-10-01',
      gross_cents: 1000, epf_cents: 110, socso_cents: 5, eis_cents: 2, pcb_cents: 0, net_cents: 883, status: 'pending',
    });
    const model = payrollModel(runs, [slip('1', 'a', 'Old'), slip('2', 'b', 'Zed'), slip('3', 'b', 'Amy')]);
    expect(model.latest!.slips.map((s) => s.employee_name)).toEqual(['Amy', 'Zed']);
  });
});

describe('vouchersModel on the sample data', () => {
  it('counts the six vouchers: 4 paid, 1 issued, 1 draft, RM 27,465.00', async () => {
    const model = vouchersModel(await data.listPaymentVouchers(), TODAY);
    expect(model.count).toBe(6);
    expect(model.total_cents).toBe(2_746_500);
    expect(model.paid_count).toBe(4);
    expect(model.draft_count).toBe(1);
    expect(model.outstanding_count).toBe(1);
    expect(model.outstanding_cents).toBe(150_000);
  });

  it('totals issued and paid this month by issued date', async () => {
    const model = vouchersModel(await data.listPaymentVouchers(), TODAY);
    // October so far: the advance (issued) on the 6th and the draft on the 9th; the paid ones are in September.
    expect(model.month.issued_cents).toBe(150_000);
    expect(model.month.paid_cents).toBe(0);
  });

  it('has amount by month and by type, and the table newest first', async () => {
    const model = vouchersModel(await data.listPaymentVouchers(), TODAY);
    expect(model.by_month).toHaveLength(6);
    expect(model.by_month.reduce((t, b) => t + b.value, 0)).toBe(27_465);
    expect(model.by_type.map((t) => t.key)).toEqual([
      'Statutory payment', 'Claim reimbursement', 'Advance', 'Overtime payout',
    ]);
    const dates = model.rows.map((r) => r.issued_date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('is calm with no vouchers', () => {
    const model = vouchersModel([], TODAY);
    expect(model.count).toBe(0);
    expect(model.total_cents).toBe(0);
    expect(model.by_type).toEqual([]);
    expect(model.rows).toEqual([]);
  });

  it('puts a draft in neither issued nor paid', () => {
    const v: PaymentVoucher = {
      id: 'v', voucher_no: 'PV-1', payee: 'P', voucher_type: 'Advance', amount_cents: 500,
      issued_date: '2026-10-02', status: 'draft',
    };
    const model = vouchersModel([v], TODAY);
    expect(model.month.issued_cents).toBe(0);
    expect(model.outstanding_count).toBe(0);
  });
});

describe('reading is for HR only', () => {
  const spied = () => {
    const d = createSeedPeopleData(NOW);
    const spies = {
      listPayrollRuns: vi.spyOn(d, 'listPayrollRuns'),
      listPayslips: vi.spyOn(d, 'listPayslips'),
      listPaymentVouchers: vi.spyOn(d, 'listPaymentVouchers'),
    };
    return { d, spies };
  };

  it('a plain member reads nothing', async () => {
    const { d, spies } = spied();
    expect(await readPayroll(d, MEMBER)).toBeNull();
    expect(await readVouchers(d, MEMBER, TODAY)).toBeNull();
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it('HR reads both', async () => {
    const { d } = spied();
    expect((await readPayroll(d, HR))!.latest!.headcount).toBe(20);
    expect((await readVouchers(d, HR, TODAY))!.count).toBe(6);
  });

  it('a demo visitor reads too', async () => {
    const demo: PeopleViewer = { employeeId: 'e1', isHr: false, isDemo: true };
    expect((await readVouchers(data, demo, TODAY))!.count).toBe(6);
  });
});
