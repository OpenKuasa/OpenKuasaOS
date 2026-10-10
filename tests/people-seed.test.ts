import { describe, expect, it } from 'vitest';
import { addDays, monthStart, todayInMalaysia } from '@/lib/people/dates';
import { createSeedPeopleData } from '@/lib/people/seed';
import { DEMO_EMPLOYEE_ID } from '@/lib/people/types';

const NOW = new Date('2026-10-10T04:00:00Z');
const TODAY = todayInMalaysia(NOW);
const data = createSeedPeopleData(NOW);

describe('people seed', () => {
  it('has 20 active employees in 5 departments, mixed as the demo is', async () => {
    const employees = await data.listEmployees();
    expect(employees).toHaveLength(20);
    expect(employees.every((e) => e.status === 'active')).toBe(true);
    expect(await data.listDepartments()).toHaveLength(5);
    const count = (name: string) => employees.filter((e) => e.department_name === name).length;
    expect(['Sales', 'Operations', 'Marketing', 'Finance', 'Management'].map(count)).toEqual([6, 5, 3, 3, 3]);
    expect(new Set(employees.map((e) => e.id)).size).toBe(20);
    expect(new Set(employees.map((e) => e.employee_no)).size).toBe(20);
  });

  it('makes Aisyah Rahim the demo employee', async () => {
    const aisyah = (await data.listEmployees()).find((e) => e.id === DEMO_EMPLOYEE_ID);
    expect(aisyah).toMatchObject({ name: 'Aisyah Rahim', employee_no: 'EMP-001', department_name: 'Sales' });
  });

  it('always has three people on leave today', async () => {
    const onLeave = (await data.listLeaveRequests()).filter(
      (r) => r.status === 'approved' && r.start_date <= TODAY && r.end_date >= TODAY,
    );
    expect(onLeave.map((r) => r.employee_name).sort()).toEqual(['Lim Wei Jie', 'Nurul Huda', 'Siti Lestari']);
  });

  it('always has six approvals waiting: 3 leave, 2 claims, 1 overtime, no time-off', async () => {
    const pending = <T extends { status: string }>(rows: T[]) => rows.filter((r) => r.status === 'pending').length;
    expect(pending(await data.listLeaveRequests())).toBe(3);
    expect(pending(await data.listClaims())).toBe(2);
    expect(pending(await data.listOvertime())).toBe(1);
    expect(pending(await data.listTimeOffRequests())).toBe(0);
  });

  it('has eight payroll runs, this month in draft, with a payslip per employee', async () => {
    const runs = await data.listPayrollRuns();
    expect(runs).toHaveLength(8);
    expect(runs.filter((r) => r.status === 'draft').map((r) => r.period_month)).toEqual([monthStart(TODAY)]);
    const payslips = await data.listPayslips();
    expect(payslips).toHaveLength(160);
    for (const slip of payslips) {
      expect(slip.net_cents).toBe(slip.gross_cents - slip.epf_cents - slip.socso_cents - slip.eis_cents - slip.pcb_cents);
      expect(slip.net_cents).toBeGreaterThan(0);
    }
  });

  it('has attendance for every weekday of the last eight weeks, and only in the window asked for', async () => {
    const all = await data.listAttendance(addDays(TODAY, -55), TODAY);
    expect(all).toHaveLength(800);
    const oneDay = await data.listAttendance('2026-10-09', '2026-10-09');
    expect(oneDay).toHaveLength(20);
    expect(oneDay.every((d) => d.work_date === '2026-10-09')).toBe(true);
    expect(await data.listAttendance('2026-10-10', '2026-10-11')).toEqual([]); // a weekend
  });

  it('marks people on approved leave as on leave in attendance', async () => {
    const day = await data.listAttendance('2026-10-09', '2026-10-09');
    const lestari = (await data.listEmployees()).find((e) => e.name === 'Siti Lestari')!;
    expect(day.find((d) => d.employee_id === lestari.id)?.status).toBe('on_leave');
  });

  it('keeps private details off the directory and gives each employee a private row', async () => {
    const [first] = await data.listEmployees();
    expect(first).not.toHaveProperty('base_salary_cents');
    expect(first).not.toHaveProperty('nric');
    const priv = await data.getEmployeePrivate(DEMO_EMPLOYEE_ID);
    expect(priv?.base_salary_cents).toBe(560000);
    expect(await data.getEmployeePrivate('no-such-employee')).toBeNull();
  });

  it('fills every other list the lookups read', async () => {
    expect((await data.listLeaveBalances(2026)).length).toBe(60);
    expect(await data.listLeaveBalances(2025)).toEqual([]);
    expect(await data.listShifts('2026-10-05', '2026-10-11')).toHaveLength(35);
    expect(await data.listPublicHolidays()).toHaveLength(6);
    expect(await data.listGoals()).toHaveLength(40);
    expect(await data.listScorecards()).toHaveLength(20);
    expect(await data.listReviews()).toHaveLength(20);
    expect(await data.listTrainings()).toHaveLength(5);
    expect((await data.listTrainingEnrolments()).length).toBeGreaterThan(0);
    expect(await data.listAnnouncements()).toHaveLength(5);
    expect((await data.listTimesheet(addDays(TODAY, -55), TODAY)).length).toBeGreaterThan(600);
  });

  it('moves with the clock', async () => {
    const later = createSeedPeopleData(new Date('2027-01-05T04:00:00Z'));
    const onLeave = (await later.listLeaveRequests()).filter(
      (r) => r.status === 'approved' && r.start_date <= '2027-01-05' && r.end_date >= '2027-01-05',
    );
    expect(onLeave).toHaveLength(3);
    expect((await later.listPayrollRuns()).find((r) => r.status === 'draft')?.period_month).toBe('2027-01-01');
  });
});
