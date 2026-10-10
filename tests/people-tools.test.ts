import { describe, expect, it, vi } from 'vitest';
import { PEOPLE_TOOL_NAMES, createPeopleTools } from '@/lib/ai/people-tools';
import { HIRE_TOOL_NAMES } from '@/lib/ai/hire-tools';
import { CRM_WRITE_TOOL_NAMES } from '@/lib/ai/crm-tools';
import { REACH_WRITE_TOOL_NAMES } from '@/lib/ai/products';
import { createReachTools } from '@/lib/ai/tools';
import { toolMeta } from '@/components/chat/tool-parts';
import { buildPeopleOverviewModel } from '@/lib/people/overview';
import { createSeedPeopleData } from '@/lib/people/seed';
import { createSeedReachData } from '@/lib/reach/seed';
import type { PeopleData, PeopleViewer } from '@/lib/people/types';

// A Friday in Kuala Lumpur.
const NOW = new Date('2026-10-09T04:00:00Z');
const HR: PeopleViewer = { employeeId: null, isHr: true, isDemo: false };
const MEMBER: PeopleViewer = { employeeId: 'seed-emp-2', isHr: false, isDemo: false };
const data = createSeedPeopleData(NOW);

// The tool results are untyped JSON; the tests read them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const runner = (source: PeopleData, viewer: PeopleViewer = HR) => {
  const tools = createPeopleTools(source, viewer, NOW);
  return (name: string) => (input: Record<string, unknown>): Promise<Loose> =>
    (tools[name] as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute(input, {
      toolCallId: 't', messages: [],
    });
};
const run = runner(data);

const EMPTY: PeopleData = {
  listDepartments: async () => [], listEmployees: async () => [], getEmployeePrivate: async () => null,
  listLeaveRequests: async () => [], listLeaveBalances: async () => [], listTimeOffRequests: async () => [],
  listClaims: async () => [], listOvertime: async () => [], listAttendance: async () => [],
  listTimesheet: async () => [], listShifts: async () => [], listPublicHolidays: async () => [],
  listPayrollRuns: async () => [], listPayslips: async () => [], listGoals: async () => [],
  listScorecards: async () => [], listReviews: async () => [], listTrainings: async () => [],
  listTrainingEnrolments: async () => [], listAnnouncements: async () => [],
};

describe('people tools', () => {
  it('is exactly the nineteen lookups, none sharing a name with another product', () => {
    expect(Object.keys(createPeopleTools(data, HR, NOW))).toEqual([...PEOPLE_TOOL_NAMES]);
    expect(PEOPLE_TOOL_NAMES).toEqual([
      'getPeopleOverview', 'listEmployees', 'getEmployee', 'getHeadcountByDepartment', 'listWhoIsOnLeave',
      'listLeaveRequests', 'getLeaveBalances', 'listPendingApprovals', 'listClaims', 'listOvertime',
      'getAttendanceSummary', 'getTimesheet', 'listShifts', 'listPublicHolidays', 'getPayrollSummary',
      'listPayslips', 'getPerformanceSummary', 'listTrainings', 'listAnnouncements',
    ]);
    const others = new Set<string>([
      ...Object.keys(createReachTools(createSeedReachData())),
      ...REACH_WRITE_TOOL_NAMES,
      ...CRM_WRITE_TOOL_NAMES,
      ...HIRE_TOOL_NAMES,
      'listCrmContacts', 'listDeals', 'listPipelines', 'getDealStats', 'listFollowUps', 'getCalendar',
    ]);
    for (const name of PEOPLE_TOOL_NAMES) expect(others.has(name), name).toBe(false);
  });

  it('has a named card for every tool', () => {
    for (const name of PEOPLE_TOOL_NAMES) expect(toolMeta(name).isFallback, name).toBe(false);
  });

  it('never lets the model choose the workspace', () => {
    const tools = createPeopleTools(data, HR, NOW);
    for (const name of PEOPLE_TOOL_NAMES) {
      const shape = (tools[name] as unknown as { inputSchema: { shape: Record<string, unknown> } }).inputSchema.shape;
      for (const key of Object.keys(shape)) expect(key.toLowerCase(), `${name}.${key}`).not.toMatch(/org|workspace/);
    }
  });

  it('gives the same overview totals as the screen', async () => {
    const model = await buildPeopleOverviewModel(data, NOW);
    const overview = await run('getPeopleOverview')({});
    expect(overview).toMatchObject({
      date: '2026-10-09', headcount: 20, departments: 5, on_leave_today: 3, at_work_today: 17, attendance_rate_pct: 100,
      pending_approvals: { leave: 3, claims: 2, overtime: 1, time_off: 0, total: 6 },
    });
    expect(overview.headcount).toBe(model.totals.headcount);
  });

  it('lists the directory, filtered and capped, without private details', async () => {
    const all = await run('listEmployees')({});
    expect(all.total).toBe(20);
    expect(all.employees).toHaveLength(20);
    expect((await run('listEmployees')({ department: 'sales' })).total).toBe(6);
    expect((await run('listEmployees')({ limit: 5 })).employees).toHaveLength(5);
    expect(JSON.stringify(all)).not.toMatch(/salary|nric|bank/i);
  });

  it('looks up one employee, and gives private details only when asked', async () => {
    const plain = await run('getEmployee')({ employee: 'aisyah' });
    expect(plain).toMatchObject({ found: true, employee: { name: 'Aisyah Rahim', department: 'Sales' } });
    expect(plain).not.toHaveProperty('private');
    const full = await run('getEmployee')({ employee: 'Aisyah Rahim', includePrivate: true });
    expect(full.private_access).toBe(true);
    expect(full.private).toMatchObject({ base_salary: 'RM 5,600.00', bank_name: 'CIMB' });
  });

  it('says the caller has no access to private details, not that there are none', async () => {
    const hidden: PeopleData = { ...data, getEmployeePrivate: async () => null };
    const result = await runner(hidden, MEMBER)('getEmployee')({ employee: 'Ahmad Zaki', includePrivate: true });
    expect(result).toMatchObject({ found: true, private: null, private_access: false });
  });

  it('asks which one when a name matches several people, and says so when it matches none', async () => {
    expect(await run('getEmployee')({ employee: 'siti' })).toEqual({
      found: false, several_match: ['Siti Aminah', 'Siti Lestari'],
    });
    expect(await run('getEmployee')({ employee: 'nobody at all' })).toEqual({ found: false });
    expect(await run('getEmployee')({ employee: '   ' })).toEqual({ found: false });
  });

  it('gives headcount by department', async () => {
    const result = await run('getHeadcountByDepartment')({});
    expect(result.headcount).toBe(20);
    expect(result.departments[0]).toEqual({ department: 'Sales', headcount: 6 });
  });

  it('says who is on leave today, or on another day', async () => {
    const today = await run('listWhoIsOnLeave')({});
    expect(today.date).toBe('2026-10-09');
    expect(today.people.map((p: { name: string }) => p.name)).toEqual(['Lim Wei Jie', 'Nurul Huda', 'Siti Lestari']);
    expect((await run('listWhoIsOnLeave')({ date: '2026-10-07' })).people).toHaveLength(1);
    expect((await run('listWhoIsOnLeave')({ date: 'next friday' })).date).toBe('2026-10-09');
  });

  it('lists leave requests by employee, status and type', async () => {
    expect((await run('listLeaveRequests')({ status: 'pending' })).total).toBe(3);
    const aisyah = await run('listLeaveRequests')({ employee: 'aisyah' });
    expect(aisyah.total).toBe(3);
    expect(aisyah.requests[0]).toMatchObject({ employee: 'Aisyah Rahim', type: 'Annual leave', status: 'pending' });
    expect((await run('listLeaveRequests')({ leaveType: 'medical', status: 'approved' })).total).toBe(4);
  });

  it('gives leave balances with what is left', async () => {
    const result = await run('getLeaveBalances')({ employee: 'aisyah' });
    expect(result.year).toBe(2026);
    expect(result.balances).toHaveLength(3);
    expect(result.balances.find((b: { leave_type: string }) => b.leave_type === 'annual')).toMatchObject({
      entitled_days: 16, used_days: 2, remaining_days: 14,
    });
  });

  it('lists what is waiting for approval', async () => {
    const result = await run('listPendingApprovals')({});
    expect(result.counts).toEqual({ leave: 3, claims: 2, overtime: 1, time_off: 0, total: 6 });
    expect(result.approvals).toHaveLength(6);
  });

  it('lists claims and overtime with amounts in Ringgit', async () => {
    const pending = await run('listClaims')({ status: 'pending' });
    expect(pending.total).toBe(2);
    expect(pending.claims.map((c: { amount: string }) => c.amount).sort()).toEqual(['RM 180.00', 'RM 240.00']);
    expect((await run('listClaims')({ category: 'travel' })).total).toBe(4);
    const overtime = await run('listOvertime')({ employee: 'ahmad zaki' });
    expect(overtime.total).toBe(2);
    expect(overtime.overtime.find((o: { status: string }) => o.status === 'pending')).toMatchObject({
      hours: 4, amount: 'RM 150.00',
    });
  });

  it('summarises attendance over a window that it caps at 31 days', async () => {
    const week = await run('getAttendanceSummary')({});
    expect(week).toMatchObject({ from: '2026-10-03', to: '2026-10-09' });
    expect(week.present + week.late + week.absent + week.on_leave).toBe(100);
    const capped = await run('getAttendanceSummary')({ days: 500 });
    expect(capped.from).toBe('2026-09-09');
    expect((await run('getAttendanceSummary')({ days: 1 })).from).toBe('2026-10-09');
  });

  it('adds up timesheet hours', async () => {
    const result = await run('getTimesheet')({ days: 1 });
    expect(result.by_employee).toHaveLength(17);
    expect(result.total_hours).toBe(result.by_employee.reduce((s: number, r: { hours: number }) => s + r.hours, 0));
    expect((await run('getTimesheet')({ days: 1, employee: 'aisyah' })).by_employee).toHaveLength(1);
  });

  it('gives this week\'s roster and next week\'s', async () => {
    const week = await run('listShifts')({});
    expect(week).toMatchObject({ from: '2026-10-05', to: '2026-10-11', total: 35 });
    expect(week.shifts[0]).toHaveProperty('employee');
    expect((await run('listShifts')({ week: 'next' })).from).toBe('2026-10-12');
  });

  it('lists public holidays, all or only those still ahead', async () => {
    expect((await run('listPublicHolidays')({})).holidays).toHaveLength(6);
    expect((await run('listPublicHolidays')({ upcomingOnly: true })).holidays.map((h: { name: string }) => h.name)).toEqual([
      'Christmas Day',
    ]);
  });

  it('totals payroll and lists payslips in Ringgit', async () => {
    const payroll = await run('getPayrollSummary')({});
    expect(payroll.runs).toHaveLength(3);
    expect(payroll.runs[0]).toMatchObject({ month: '2026-10', status: 'draft', headcount: 20, gross: 'RM 105,200.00' });
    expect((await run('getPayrollSummary')({ months: 50 })).runs).toHaveLength(8);
    const slips = await run('listPayslips')({ employee: 'aisyah', month: '2026-09' });
    expect(slips.total).toBe(1);
    expect(slips.payslips[0]).toMatchObject({ employee: 'Aisyah Rahim', month: '2026-09', gross: 'RM 5,600.00', status: 'paid' });
  });

  it('summarises performance, trainings and announcements', async () => {
    expect((await run('getPerformanceSummary')({})).goals.total).toBe(40);
    const trainings = await run('listTrainings')({});
    expect(trainings.trainings).toHaveLength(5);
    expect(trainings.trainings.every((t: { enrolled: number }) => t.enrolled > 0)).toBe(true);
    expect((await run('listTrainings')({ status: 'upcoming' })).trainings).toHaveLength(2);
    expect((await run('listAnnouncements')({ limit: 2 })).announcements).toHaveLength(2);
  });

  it('tells the model whose records it is looking at', async () => {
    expect((await run('listClaims')({})).scope).toBe('everyone in the workspace');
    expect((await runner(data, MEMBER)('listClaims')({})).scope).toBe('your own records only');
    expect((await runner(data, { employeeId: null, isHr: false, isDemo: true })('listPayslips')({})).scope).toBe(
      'everyone in the workspace',
    );
  });

  it('answers a filter that matches nothing with nothing, not everything', async () => {
    expect((await run('listLeaveRequests')({ employee: 'zzzz' })).total).toBe(0);
    expect((await run('listEmployees')({ department: 'legal' })).total).toBe(0);
  });

  it('answers from an empty workspace without NaN', async () => {
    const empty = runner(EMPTY);
    for (const name of PEOPLE_TOOL_NAMES) {
      const result = await empty(name)(name === 'getEmployee' ? { employee: 'aisyah' } : {});
      expect(JSON.stringify(result), name).not.toContain('NaN');
      expect(result.ok, name).not.toBe(false);
    }
    expect((await empty('getPeopleOverview')({})).attendance_rate_pct).toBeNull();
  });

  it('reports a failed read as an error, without the database message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken: PeopleData = {
      ...data,
      listEmployees: async () => {
        throw new Error('relation "hr_employees" does not exist');
      },
    };
    const result = await runner(broken)('listEmployees')({});
    expect(result).toEqual({ ok: false, error: 'Could not read HR data.' });
    expect(JSON.stringify(result)).not.toContain('hr_employees');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
