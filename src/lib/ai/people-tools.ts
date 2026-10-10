/**
 * Lekiu's lookup tools. Each reads through the {@link PeopleData} seam and
 * calls the same pure helpers the screens call, so a number in the chat is the
 * number on the screen. `org_id` is never taken from the model, and nothing
 * here decides who may see a row: the provider returns what the caller's
 * session is allowed to read, and each personal lookup says which that is in
 * `scope`. There are no change tools yet.
 */

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { LOOKUP_MAX, limitSchema, rowLimit } from '@/lib/ai/limits';
import { matchesText } from '@/lib/hire/applications-view';
import { addDays, monthStart, todayInMalaysia, weekStart } from '@/lib/people/dates';
import {
  approvalCounts,
  attendanceOn,
  claimLabel,
  headcountByDepartment,
  leaveLabel,
  onLeaveOn,
  pendingApprovals,
} from '@/lib/people/overview';
import {
  attendanceCounts,
  lateByEmployee,
  leaveBalanceRows,
  payrollSummary,
  performanceSummary,
  timesheetByEmployee,
} from '@/lib/people/summaries';
import type { Employee, PeopleData, PeopleViewer } from '@/lib/people/types';
import { rm } from '@/lib/reach/format';

export const PEOPLE_TOOL_NAMES = [
  'getPeopleOverview',
  'listEmployees',
  'getEmployee',
  'getHeadcountByDepartment',
  'listWhoIsOnLeave',
  'listLeaveRequests',
  'getLeaveBalances',
  'listPendingApprovals',
  'listClaims',
  'listOvertime',
  'getAttendanceSummary',
  'getTimesheet',
  'listShifts',
  'listPublicHolidays',
  'getPayrollSummary',
  'listPayslips',
  'getPerformanceSummary',
  'listTrainings',
  'listAnnouncements',
] as const;

const READ_ERROR = { ok: false as const, error: 'Could not read HR data.' };

/** A lookup never throws at the model: a failed read is logged and reported plainly. */
async function safe<T>(name: string, read: () => Promise<T>): Promise<T | typeof READ_ERROR> {
  try {
    return await read();
  } catch (error) {
    console.error(`[lekiu] ${name} failed:`, error instanceof Error ? error.message : error);
    return READ_ERROR;
  }
}

const employee = z
  .string()
  .optional()
  .describe('Only this employee, by name. Part of the name is enough, in any letter case.');
const requestStatus = z
  .enum(['pending', 'approved', 'rejected', 'cancelled'])
  .optional()
  .describe('Only requests with this status.');
const limit = limitSchema(`How many rows to return, at most ${LOOKUP_MAX}.`);
const days = z.number().optional().describe('How many days back to cover, counting today. 7 if left out, at most 31.');

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const directoryRow = (e: Employee) => ({
  name: e.name,
  employee_no: e.employee_no,
  department: e.department_name,
  designation: e.designation,
  employment_type: e.employment_type,
  is_manager: e.is_manager,
  join_date: e.join_date,
  status: e.status,
  work_email: e.work_email,
});

export function createPeopleTools(
  data: PeopleData,
  viewer: PeopleViewer,
  nowArg: Date | (() => Date) = () => new Date(),
): ToolSet {
  const now = typeof nowArg === 'function' ? nowArg : () => nowArg;
  const today = () => todayInMalaysia(now());
  /** Whose rows a personal lookup returned: everyone's for HR and in the demo, otherwise the caller's own. */
  const scope = viewer.isHr || viewer.isDemo ? 'everyone in the workspace' : 'your own records only';
  /** The first day of a window of `requested` days ending today. */
  const windowStart = (requested: number | undefined) => addDays(today(), -(rowLimit(requested, 7, 31) - 1));

  return {
    getPeopleOverview: tool({
      description:
        'The team at a glance today: headcount, number of departments, how many are on leave today, how many came in ' +
        'and the attendance rate, and how many requests are waiting for approval (leave, claims, overtime, time-off).',
      inputSchema: z.object({}),
      execute: async () =>
        safe('getPeopleOverview', async () => {
          const date = today();
          const [employees, leave, claims, overtime, timeOff, attendance] = await Promise.all([
            data.listEmployees(), data.listLeaveRequests(), data.listClaims(), data.listOvertime(),
            data.listTimeOffRequests(), data.listAttendance(date, date),
          ]);
          const at = attendanceOn(attendance, date);
          return {
            date,
            headcount: employees.filter((e) => e.status === 'active').length,
            departments: headcountByDepartment(employees).length,
            on_leave_today: onLeaveOn(leave, date).length,
            at_work_today: at.at_work,
            attendance_rate_pct: at.rate_pct,
            pending_approvals: approvalCounts(pendingApprovals(leave, claims, overtime, timeOff)),
            scope,
          };
        }),
    }),

    listEmployees: tool({
      description:
        'The staff directory: name, employee number, department, designation, employment type, whether they manage ' +
        'people, join date, status and work email. Never pay or identity details. Filter by department or status.',
      inputSchema: z.object({
        department: z.string().optional().describe('Only this department. Part of the name is enough.'),
        status: z.enum(['active', 'inactive']).optional().describe('Only staff with this status.'),
        limit,
      }),
      execute: async ({ department, status, limit: requested }) =>
        safe('listEmployees', async () => {
          const rows = (await data.listEmployees()).filter(
            (e) => (!department?.trim() || matchesText(e.department_name, department)) && (!status || e.status === status),
          );
          return { total: rows.length, employees: rows.slice(0, rowLimit(requested, 20)).map(directoryRow) };
        }),
    }),

    getEmployee: tool({
      description:
        'One employee by name. Returns their directory details. Pay, NRIC, bank, statutory numbers, address, phone ' +
        'and emergency contact are returned only when includePrivate is true, and only if this user may see them: ' +
        'private_access false means this user may not, not that the details do not exist. ' +
        'If several people match the name, several_match lists them and nothing else is returned.',
      inputSchema: z.object({
        employee: z.string().describe('The employee, by name. Part of the name is enough, in any letter case.'),
        includePrivate: z
          .boolean()
          .optional()
          .describe('Set true only when the user asked for pay, identity, bank or contact details. Leave it out otherwise.'),
      }),
      execute: async ({ employee: name, includePrivate }) =>
        safe('getEmployee', async () => {
          if (!name.trim()) return { found: false as const };
          const matches = (await data.listEmployees()).filter((e) => matchesText(e.name, name));
          if (matches.length === 0) return { found: false as const };
          if (matches.length > 1) {
            return { found: false as const, several_match: matches.slice(0, 10).map((e) => e.name) };
          }
          const [match] = matches;
          const found = { found: true as const, employee: directoryRow(match) };
          if (!includePrivate) return found;
          const priv = await data.getEmployeePrivate(match.id);
          return {
            ...found,
            private_access: priv !== null,
            private: priv && {
              base_salary: priv.base_salary_cents === null ? null : rm(priv.base_salary_cents),
              nric: priv.nric,
              date_of_birth: priv.date_of_birth,
              phone: priv.phone,
              address: priv.address,
              bank_name: priv.bank_name,
              bank_account: priv.bank_account,
              epf_no: priv.epf_no,
              socso_no: priv.socso_no,
              tax_no: priv.tax_no,
              emergency_contact_name: priv.emergency_contact_name,
              emergency_contact_phone: priv.emergency_contact_phone,
            },
          };
        }),
    }),

    getHeadcountByDepartment: tool({
      description: 'Active headcount in total and per department, the biggest department first.',
      inputSchema: z.object({}),
      execute: async () =>
        safe('getHeadcountByDepartment', async () => {
          const departments = headcountByDepartment(await data.listEmployees());
          return { headcount: departments.reduce((sum, d) => sum + d.headcount, 0), departments };
        }),
    }),

    listWhoIsOnLeave: tool({
      description:
        'Who is on approved leave on a day: today if no date is given. Returns each person, the kind of leave and its dates.',
      inputSchema: z.object({
        date: z.string().optional().describe('The day to check, as YYYY-MM-DD. Leave it out for today.'),
      }),
      execute: async ({ date }) =>
        safe('listWhoIsOnLeave', async () => {
          const day = date && DATE.test(date) ? date : today();
          return {
            date: day,
            people: onLeaveOn(await data.listLeaveRequests(), day).map((r) => ({
              name: r.employee_name,
              leave_type: leaveLabel(r.leave_type),
              start_date: r.start_date,
              end_date: r.end_date,
              days: r.days,
            })),
            scope,
          };
        }),
    }),

    listLeaveRequests: tool({
      description:
        'Leave requests, newest first: who, the kind of leave, the dates, the number of days, the reason and the status. ' +
        'Filter by employee, status or kind of leave.',
      inputSchema: z.object({
        employee,
        status: requestStatus,
        leaveType: z
          .enum(['annual', 'medical', 'emergency', 'unpaid', 'maternity', 'paternity'])
          .optional()
          .describe('Only this kind of leave.'),
        limit,
      }),
      execute: async ({ employee: name, status, leaveType, limit: requested }) =>
        safe('listLeaveRequests', async () => {
          const rows = (await data.listLeaveRequests()).filter(
            (r) =>
              matchesText(r.employee_name, name) && (!status || r.status === status) && (!leaveType || r.leave_type === leaveType),
          );
          return {
            total: rows.length,
            requests: rows.slice(0, rowLimit(requested, 20)).map((r) => ({
              employee: r.employee_name,
              type: leaveLabel(r.leave_type),
              start_date: r.start_date,
              end_date: r.end_date,
              days: r.days,
              reason: r.reason,
              status: r.status,
            })),
            scope,
          };
        }),
    }),

    getLeaveBalances: tool({
      description:
        'Leave balances for this year: days entitled, used and remaining, per employee and kind of leave. Filter by employee.',
      inputSchema: z.object({ employee }),
      execute: async ({ employee: name }) =>
        safe('getLeaveBalances', async () => {
          const year = Number(today().slice(0, 4));
          const [balances, employees] = await Promise.all([data.listLeaveBalances(year), data.listEmployees()]);
          const rows = leaveBalanceRows(balances, employees).filter((b) => matchesText(b.employee, name));
          return { year, total: rows.length, balances: rows.slice(0, LOOKUP_MAX), scope };
        }),
    }),

    listPendingApprovals: tool({
      description:
        'Everything waiting for a decision: leave, financial claims, overtime and time-off requests, newest first, ' +
        'with a count for each kind.',
      inputSchema: z.object({ limit }),
      execute: async ({ limit: requested }) =>
        safe('listPendingApprovals', async () => {
          const [leave, claims, overtime, timeOff] = await Promise.all([
            data.listLeaveRequests(), data.listClaims(), data.listOvertime(), data.listTimeOffRequests(),
          ]);
          const rows = pendingApprovals(leave, claims, overtime, timeOff);
          return {
            counts: approvalCounts(rows),
            approvals: rows.slice(0, rowLimit(requested, 20)).map((r) => ({
              kind: r.kind,
              employee: r.employee,
              type: r.type,
              detail: r.detail,
            })),
            scope,
          };
        }),
    }),

    listClaims: tool({
      description:
        'Financial claims, newest first: who, the category, the amount in Ringgit, the date, the description, ' +
        'whether a receipt was attached and the status. Filter by employee, status or category.',
      inputSchema: z.object({
        employee,
        status: requestStatus,
        category: z.enum(['medical', 'travel', 'meals', 'equipment', 'other']).optional().describe('Only this category.'),
        limit,
      }),
      execute: async ({ employee: name, status, category, limit: requested }) =>
        safe('listClaims', async () => {
          const rows = (await data.listClaims()).filter(
            (c) => matchesText(c.employee_name, name) && (!status || c.status === status) && (!category || c.category === category),
          );
          return {
            total: rows.length,
            total_amount: rm(rows.reduce((sum, c) => sum + c.amount_cents, 0)),
            claims: rows.slice(0, rowLimit(requested, 20)).map((c) => ({
              employee: c.employee_name,
              category: claimLabel(c.category),
              amount: rm(c.amount_cents),
              claim_date: c.claim_date,
              description: c.description,
              has_receipt: c.has_receipt,
              status: c.status,
            })),
            scope,
          };
        }),
    }),

    listOvertime: tool({
      description:
        'Overtime records, newest first: who, the date, the hours, the rate multiplier, the amount in Ringgit and the status. ' +
        'Filter by employee or status.',
      inputSchema: z.object({ employee, status: requestStatus, limit }),
      execute: async ({ employee: name, status, limit: requested }) =>
        safe('listOvertime', async () => {
          const rows = (await data.listOvertime()).filter(
            (o) => matchesText(o.employee_name, name) && (!status || o.status === status),
          );
          return {
            total: rows.length,
            total_hours: rows.reduce((sum, o) => sum + o.hours, 0),
            overtime: rows.slice(0, rowLimit(requested, 20)).map((o) => ({
              employee: o.employee_name,
              work_date: o.work_date,
              hours: o.hours,
              rate_multiplier: o.rate_multiplier,
              amount: rm(o.amount_cents),
              status: o.status,
            })),
            scope,
          };
        }),
    }),

    getAttendanceSummary: tool({
      description:
        'Attendance over the last few days: how many attendances were on time (present), late, absent or on leave, ' +
        'the attendance rate, and who was late most often. A null rate means nobody was expected.',
      inputSchema: z.object({ days }),
      execute: async ({ days: requested }) =>
        safe('getAttendanceSummary', async () => {
          const to = today();
          const from = windowStart(requested);
          const [rows, employees] = await Promise.all([data.listAttendance(from, to), data.listEmployees()]);
          return {
            from,
            to,
            ...attendanceCounts(rows),
            late_most_often: lateByEmployee(rows, employees).slice(0, 5),
            scope,
          };
        }),
    }),

    getTimesheet: tool({
      description:
        'Hours worked over the last few days: total and billable hours, and per employee, most hours first. Filter by employee.',
      inputSchema: z.object({ days, employee }),
      execute: async ({ days: requested, employee: name }) =>
        safe('getTimesheet', async () => {
          const to = today();
          const from = windowStart(requested);
          const [entries, employees] = await Promise.all([data.listTimesheet(from, to), data.listEmployees()]);
          const rows = timesheetByEmployee(entries, employees).filter((r) => matchesText(r.employee, name));
          return {
            from,
            to,
            total_hours: rows.reduce((sum, r) => sum + r.hours, 0),
            billable_hours: rows.reduce((sum, r) => sum + r.billable_hours, 0),
            by_employee: rows.slice(0, LOOKUP_MAX),
            scope,
          };
        }),
    }),

    listShifts: tool({
      description:
        'The shift roster for a week, Monday to Sunday: who is on the morning shift, the night shift or off each day.',
      inputSchema: z.object({
        week: z.enum(['this', 'next']).optional().describe('This week or next week. This week if left out.'),
      }),
      execute: async ({ week }) =>
        safe('listShifts', async () => {
          const from = addDays(weekStart(today()), week === 'next' ? 7 : 0);
          const to = addDays(from, 6);
          const [shifts, employees] = await Promise.all([data.listShifts(from, to), data.listEmployees()]);
          const name = new Map(employees.map((e) => [e.id, e.name]));
          return {
            from,
            to,
            total: shifts.length,
            shifts: shifts.slice(0, 100).map((s) => ({
              employee: name.get(s.employee_id) ?? 'Unknown',
              work_date: s.work_date,
              shift: s.shift,
            })),
            scope,
          };
        }),
    }),

    listPublicHolidays: tool({
      description: 'The public holidays the workspace observes this year, earliest first, national or for one state.',
      inputSchema: z.object({
        upcomingOnly: z.boolean().optional().describe('Set true for only the holidays still ahead.'),
      }),
      execute: async ({ upcomingOnly }) =>
        safe('listPublicHolidays', async () => {
          const day = today();
          const holidays = (await data.listPublicHolidays()).filter((h) => !upcomingOnly || h.holiday_date >= day);
          return {
            holidays: holidays.slice(0, LOOKUP_MAX).map((h) => ({
              name: h.name,
              date: h.holiday_date,
              scope: h.scope,
              state: h.state,
            })),
          };
        }),
    }),

    getPayrollSummary: tool({
      description:
        'Payroll by month, newest first: whether the run is a draft or paid, how many payslips, and gross pay, ' +
        'deductions and net pay in Ringgit. Only HR can see payroll runs: an empty list for anyone else means ' +
        'they may not see them.',
      inputSchema: z.object({
        months: z.number().optional().describe('How many months to return. 3 if left out, at most 12.'),
      }),
      execute: async ({ months }) =>
        safe('getPayrollSummary', async () => {
          const [runs, payslips] = await Promise.all([data.listPayrollRuns(), data.listPayslips()]);
          return {
            runs: payrollSummary(runs, payslips)
              .slice(0, rowLimit(months, 3, 12))
              .map((r) => ({
                month: r.period_month.slice(0, 7),
                status: r.status,
                headcount: r.headcount,
                gross: rm(r.gross_cents),
                deductions: rm(r.deductions_cents),
                net: rm(r.net_cents),
              })),
            scope,
          };
        }),
    }),

    listPayslips: tool({
      description:
        'Payslips, newest month first: who, the month, gross pay, each deduction (EPF, SOCSO, EIS, PCB), net pay ' +
        'in Ringgit, and whether it is paid. Filter by employee or month.',
      inputSchema: z.object({
        employee,
        month: z.string().optional().describe('Only this month, as YYYY-MM.'),
        limit,
      }),
      execute: async ({ employee: name, month, limit: requested }) =>
        safe('listPayslips', async () => {
          const wanted = month && /^\d{4}-\d{2}$/.test(month) ? monthStart(`${month}-01`) : null;
          const rows = (await data.listPayslips()).filter(
            (p) => matchesText(p.employee_name, name) && (!wanted || p.period_month === wanted),
          );
          return {
            total: rows.length,
            payslips: rows.slice(0, rowLimit(requested, 20)).map((p) => ({
              employee: p.employee_name,
              month: p.period_month.slice(0, 7),
              gross: rm(p.gross_cents),
              epf: rm(p.epf_cents),
              socso: rm(p.socso_cents),
              eis: rm(p.eis_cents),
              pcb: rm(p.pcb_cents),
              net: rm(p.net_cents),
              status: p.status,
            })),
            scope,
          };
        }),
    }),

    getPerformanceSummary: tool({
      description:
        'Performance at a glance: goals on track, at risk and done; the average scorecard score out of 5; how many ' +
        'reviews were rated exceeds, meets or below; and the five highest scores.',
      inputSchema: z.object({}),
      execute: async () =>
        safe('getPerformanceSummary', async () => {
          const [goals, scorecards, reviews] = await Promise.all([
            data.listGoals(), data.listScorecards(), data.listReviews(),
          ]);
          return { ...performanceSummary(goals, scorecards, reviews), scope };
        }),
    }),

    listTrainings: tool({
      description:
        'Training sessions, newest first: title, category, provider, dates, status and how many people are enrolled. ' +
        'Filter by status.',
      inputSchema: z.object({
        status: z.enum(['upcoming', 'in_progress', 'completed']).optional().describe('Only trainings with this status.'),
      }),
      execute: async ({ status }) =>
        safe('listTrainings', async () => {
          const [trainings, enrolments] = await Promise.all([data.listTrainings(), data.listTrainingEnrolments()]);
          return {
            trainings: trainings
              .filter((t) => !status || t.status === status)
              .slice(0, LOOKUP_MAX)
              .map((t) => ({
                title: t.title,
                category: t.category,
                provider: t.provider,
                starts_on: t.starts_on,
                ends_on: t.ends_on,
                status: t.status,
                enrolled: enrolments.filter((e) => e.training_id === t.id).length,
              })),
            scope,
          };
        }),
    }),

    listAnnouncements: tool({
      description: 'Company announcements, newest first: title, text, category, who posted it and when.',
      inputSchema: z.object({ limit }),
      execute: async ({ limit: requested }) =>
        safe('listAnnouncements', async () => {
          const rows = await data.listAnnouncements();
          return {
            total: rows.length,
            announcements: rows.slice(0, rowLimit(requested, 10)).map((a) => ({
              title: a.title,
              body: a.body,
              category: a.category,
              author: a.author_name,
              published_at: a.published_at,
            })),
          };
        }),
    }),
  };
}
