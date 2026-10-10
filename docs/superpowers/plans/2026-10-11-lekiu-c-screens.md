# Lekiu C: The Remaining 25 Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Task 1 runs alone. Tasks 2–8 run in parallel (superpowers:dispatching-parallel-agents), each on its own files. Task 9 is run by the coordinator. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Lekiu screen reads the workspace's real HR data, read-only, restricted by role, with honest empty states; nothing on any screen is a sample number.

**Architecture:** Task 1 freezes a shared surface: four new reads on the `PeopleData` seam, date and series helpers, and the shared screen pieces. Tasks 2–8 each convert one group of screens, building that group's figures in its own pure module under `src/lib/people/` and rendering them from async server components that follow the two screens already live (`assistant.tsx`, `employees.tsx`). No task after Task 1 edits a file another task owns.

**Tech Stack:** Next.js 16 App Router (async server components), Supabase Postgres under RLS, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-10-lekiu-foundation-chat-design.md` (§2.2, §4, §5.1, §5.2, §7, §9).

**Survey:** `docs/superpowers/plans/2026-10-11-lekiu-c-screen-digest.md`. For each of the 25 screens it lists every widget, what real data can back it ("NO SOURCE" where nothing can), every control that would change data, and what the sample data holds. Each screen task names the sections it works from. Where this plan and the survey disagree, this plan wins.

**How this plan differs from plans A, B1 and B2:** those gave every line of code. This one gives exact interfaces, rules, the list of what each screen keeps and removes, and the tests each module must pass; the implementer writes the JSX, adapting the sample screen that is already there. The sample screens are the layout; the rules below are the behaviour.

## Global Constraints

- pnpm only. One test file: `pnpm vitest run --dir tests <name>`. Lint named files: `pnpm eslint <paths>`. Typecheck: `pnpm tsc --noEmit`. Full suite: `pnpm test` (coordinator only: it creates users and workspaces in the live database on every run).
- Before writing a server component, read the matching page under `node_modules/next/dist/docs/` (AGENTS.md: this Next.js differs from older versions).
- No migration. No write to any table. No change to Lekiu's tools, prompt or chat route, or to any other product.
- The database decides which rows come back. Code never filters by role to hide data; it filters to `viewer.employeeId` only to turn "everything I may read" into "mine" on a personal screen.
- Field names, allowed values and scales come from the database (`src/lib/people/types.ts`), never from the sample screen: claim categories are medical, travel, meals, equipment, other; attendance has four statuses; requests can be `cancelled`; scores are 0 to 5; there is no "Replacement" leave.
- Money is integer cents, shown with `rm()` from `@/lib/reach/format`. Dates are `YYYY-MM-DD` strings; "today" is `todayInMalaysia(now)`.
- No sample names, companies or numbers left in any converted file. No "Saudara" in subtitles (the sample wording), no "Rimba Ventures".
- No Kuasa names in `src/`. No purple or violet.
- 2-space indent, single quotes, semicolons, named exports (screens keep `export default`).
- Tasks 2–8: touch only the files your task lists. Do not edit `src/screens/people/parts.tsx`, `src/lib/people/types.ts`, `dates.ts`, `series.ts`, `supabase.ts`, `seed.ts`, `overview.ts`, `summaries.ts`, `overtime.ts`, `src/config/*`. If you need something from one of them that is not there, stop and report it. Do not run `pnpm test`, `pnpm tsc` or `pnpm build` (other agents' half-written files would fail them); do not commit.

## Screen Rules

These bind every screen task.

1. **Shape.** `export default async function XScreen()` calling `loadPeople('<tag>', build)` from `./parts`. `build(data, now, ctx)` reads through `data`, and returns a plain model made by pure functions in the task's own module. Every card renders `!model ? LOAD_FAILED : …`. Nothing is a client component unless it needs state; a control that only filters a list on the page may be a small client component under `src/components/people/` named in the task.
2. **No source means gone.** A widget the survey marks NO SOURCE is removed, not faked and not greyed out. Each task lists its removals; remove exactly those. A removed tile's grid space is given to its neighbours.
3. **Sparklines and deltas.** Every KPI sparkline and every delta chip is removed, except where a task says to keep one. A KPI tile is a label, a value and at most a plain caption.
4. **Charts over time** are kept only where the task says, built with `bucketByWeek` / `bucketByMonth`, and never reach back further than 8 weeks for attendance or timesheet data.
5. **Controls that would change data** (Apply, Approve, Reject, New, Upload, Export, Clock In, Save, Mark all read, Batch pay…) stay where they are, rendered with `<LaterButton>`: disabled, with the note "Available in a later update". They submit nothing. A filter that does nothing (the period `Select` on approvals and the dashboard, "Previous week"/"Next week") is removed.
6. **Personal screens** (My Attendance, My Goals, My Documents, Records, Leave, Time-Off, Financial Claims, OT Claims): every personal row goes through `ownRows(rows, viewer)`. When `viewer.employeeId` is null the screen shows `<NotLinkedCard />` in place of its cards, whatever the viewer's role, and nothing else but the header. An owner's "My Attendance" is the owner's, never the team's.
7. **HR-only screens** (the four approvals, Payroll, Payment Vouchers, Settings): when `!isTeamView(viewer)` the builder returns without reading and the screen renders `<HrOnlyScreen title="…" />`.
8. **Team screens open to everyone** (Dashboard, Timesheet, Shift Calendar, Overtime, Scorecard, Review Scores, Training, Letters): a member who is not HR gets only their own rows back. For them (`!isTeamView(viewer)`), a figure titled as the team's (a total, an average, a ranking, a per-department chart) shows `HR_ONLY`; a table shows the rows that came back under a subtitle that says "Your records"; nothing is presented as the team's.
9. **Empty is not zero.** A list with no rows shows `<Muted>` with a plain sentence. A rate or average with nothing to divide is `null` and shows "—", never `NaN`, `0%` or `Infinity`.
10. **Labels** come from one place per value set: `leaveLabel`, `claimLabel`, `EMPLOYMENT_LABEL`, and the label maps Task 1 adds. Status pills use `<StatusPill tone=…>` with `requestTone(status)`.

## Review Focus

1. **An owner, admin or demo visitor on a personal screen** sees one person's rows (their own, or the demo's fixed employee), never the team's. Test in Tasks 2, 4, 6, 7.
2. **A member reaching an HR-only page by URL** gets the notice and no data is read. Test in Task 1 (`isTeamView`) and Tasks 3, 5, 7.
3. **An empty workspace** renders every screen with no `NaN`, no division by zero and no crash. Each module's test builds its model from no rows.
4. **An account not linked to an employee** sees "not linked", never "no leave" or "no claims". Test in Task 1 (`ownRows`) and each personal module.
5. **A member on a team screen** is never shown their own numbers under a team title. Test in Tasks 4, 6, 8.

## Decisions carried from earlier plans

- **Taken:** `todayInMalaysia` no longer depends on the server's locale data (Task 1).
- **Deferred, with reasons:** provider-side filters and a `truncated` flag at the 5,000-row stop. Rule 4 keeps every attendance and timesheet read inside 8 weeks, which stays under the stop up to about 125 employees; changing 24 read methods' signatures belongs with the slices that add writes. The decision timestamps (`decided_at`) stay out of the seam: the demo's values do not relate to when a request was made, so any "turnaround" figure would be wrong.
- **Deferred:** stripping `user_id` from the directory rows a non-HR member's page receives (B2).

---

### Task 1: The shared surface (runs alone, before everything else)

**Files:**
- Modify: `src/lib/people/types.ts`, `src/lib/people/supabase.ts`, `src/lib/people/seed.ts`, `src/lib/people/dates.ts`
- Create: `src/lib/people/series.ts`, `src/lib/people/own.ts`, `src/lib/people/overtime.ts`
- Modify: `src/screens/people/parts.tsx`, `src/screens/people/assistant.tsx` (use the extracted card only)
- Modify, to keep them compiling: every hand-built `PeopleData` object in the tests gains the four new methods (find them with `grep -rln "listAnnouncements:" tests`; `tests/people-tools.test.ts` has one called `EMPTY`, and `tests/setup/people-member-view.ts` spreads the data it is given: its `listDocuments` and `listLetters` must filter to the member's own rows, `listPaymentVouchers` must return `[]`, and `getSettings` the defaults)
- Test: `tests/people-dates.test.ts`, `tests/people-seed.test.ts`, `tests/people-provider.test.ts`, `tests/people-provider.rls.test.ts` (extend each); `tests/people-series.test.ts`, `tests/people-own.test.ts`, `tests/people-overtime.test.ts`, `tests/people-parts.test.tsx` (create)

**Interfaces (produced; Tasks 2–8 rely on these exact names):**

`src/lib/people/types.ts`
```ts
export type DocumentType = 'payslip' | 'contract' | 'letter' | 'tax' | 'benefits';
export type DocumentStatus = 'signed' | 'pending_signature' | 'available' | 'expiring';
export type HrDocument = {
  id: string; employee_id: string; employee_name: string; title: string;
  doc_type: DocumentType; status: DocumentStatus; issued_on: string | null; expires_on: string | null;
};
export type Letter = {
  id: string; employee_id: string; employee_name: string; letter_type: string; title: string;
  status: 'draft' | 'issued'; issued_on: string | null; created_at: string;
};
export type PaymentVoucher = {
  id: string; voucher_no: string; payee: string; voucher_type: string;
  amount_cents: number; issued_date: string; status: 'draft' | 'issued' | 'paid';
};
export type PeopleSettings = {
  work_week: string[];
  default_annual_leave_days: number;
  overtime_rates: { weekday: number; rest_day: number; public_holiday: number };
  notifications: Record<string, boolean>;
};
/** What a workspace with no settings row has: the table's own defaults. */
export const DEFAULT_PEOPLE_SETTINGS: PeopleSettings = {
  work_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
  default_annual_leave_days: 14,
  overtime_rates: { weekday: 1.5, rest_day: 2, public_holiday: 3 },
  notifications: {},
};
// PeopleData gains:
listDocuments(): Promise<HrDocument[]>;        // hr_documents, newest issued_on first
listLetters(): Promise<Letter[]>;              // hr_letters, newest created_at first
listPaymentVouchers(): Promise<PaymentVoucher[]>; // hr_payment_vouchers, newest issued_date first
/** The workspace's settings, or DEFAULT_PEOPLE_SETTINGS when there is no row or the caller may not read it. */
getSettings(): Promise<PeopleSettings>;
```

`src/lib/people/dates.ts` (all pure, none uses `Intl` or `toLocale*`; Malaysia is UTC+8 all year)
```ts
export function todayInMalaysia(now: Date): string;            // same results as before, without locale data
export function malaysiaDate(iso: string): string;             // the YYYY-MM-DD an instant falls on in Malaysia
export function formatDate(date: string): string;              // '09 Oct 2026'
export function monthYearLabel(date: string): string;          // 'October 2026'
export function weekdayName(date: string): string;             // 'Friday'
export function clockTime(iso: string): string;                // '08:59', Malaysia time
export function hoursBetween(startIso: string, endIso: string): number;      // to 1 decimal; 0 when end is not after start
export function hoursBetweenTimes(start: string, end: string): number;       // 'HH:MM[:SS]' pair, to 2 decimals
export function relativeTime(iso: string, now: Date): string;  // 'just now', '5 minutes ago', '2 hours ago', 'yesterday', '3 days ago', '2 weeks ago', then formatDate
```

`src/lib/people/series.ts`
```ts
export type Bucket = { start: string; label: string; value: number };
/** The last `months` calendar months ending with today's, oldest first, zero-filled. label: 'Oct'. */
export function bucketByMonth<T>(rows: T[], dateOf: (row: T) => string | null, valueOf: (row: T) => number, today: string, months: number): Bucket[];
/** The last `weeks` Monday-started weeks ending with today's, oldest first, zero-filled. label: '05 Oct' (the Monday). */
export function bucketByWeek<T>(rows: T[], dateOf: (row: T) => string | null, valueOf: (row: T) => number, today: string, weeks: number): Bucket[];
/** Totals per key, largest first, ties by key. Rows whose key is null are left out. */
export function sumBy<T>(rows: T[], keyOf: (row: T) => string | null, valueOf: (row: T) => number): { key: string; value: number }[];
/** value / total as a whole percent, or null when total is 0. */
export function percent(value: number, total: number): number | null;
/** The mean to 1 decimal, or null for no values. */
export function average(values: number[]): number | null;
```
Values are rounded to 2 decimals after summing (float hours).

`src/lib/people/own.ts`
```ts
/** HR, or anyone in the demo workspace: the people for whom the database returns the whole team. */
export function isTeamView(viewer: PeopleViewer): boolean;
/** The rows that belong to the viewer's own employee record. None when the account is not linked. */
export function ownRows<T extends { employee_id: string }>(rows: T[], viewer: PeopleViewer): T[];
/** Approved leave days per kind for leave starting in `year`, largest first. label from leaveLabel. */
export function leaveDaysByTypeInYear(requests: LeaveRequest[], year: number): { leave_type: LeaveType; label: string; days: number }[];
/** The mean score per department for rows carrying an employee and a score, highest first. Unassigned staff under 'Unassigned'. */
export function departmentAverages(rows: { employee_id: string; score: number }[], employees: Employee[]): { department: string; average: number; count: number }[];
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string>;   // Pending, Approved, Rejected, Cancelled
export const CLAIM_CATEGORY_LABEL: Record<ClaimCategory, string>;   // Medical, Travel, Meals, Equipment, Other
export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string>;     // Payslip, Contract, Letter, Tax form, Benefits
export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string>; // Signed, Pending signature, Available, Expiring
```

`src/lib/people/overtime.ts` (three screens in three tasks read overtime; they share this)
```ts
export type OvertimeModel = {
  month: { hours: number; amount_cents: number; approved_hours: number; pending_hours: number; pending_count: number };
  by_month: Bucket[];                                   // hours, last 6 months
  by_rate: { rate: number; label: string; hours: number; amount_cents: number }[];   // label '1.5x'
  by_department: { department: string; hours: number }[];   // pending hours
  people_with_overtime: number;                         // distinct employees this month
};
/** `month` is today's calendar month by work_date. Pass `[]` for employees when the records are one person's: by_department is then empty. */
export function overtimeModel(records: OvertimeRecord[], employees: Employee[], today: string): OvertimeModel;
```
Which records feed which field (three tasks depend on this, so it is fixed here): rejected and cancelled records feed nothing. `month.hours` and `month.amount_cents` = approved + pending in the month; `month.approved_hours` = approved in the month; `month.pending_hours` and `month.pending_count` = pending, **any date** (a queue, not a month figure); `by_month` = approved + pending hours by work_date month; `by_rate` = approved + pending, all dates; `by_department` = pending hours, all dates, department looked up through `employees` (an employee not found is left out); `people_with_overtime` = distinct employees with an approved or pending record in the month.

`src/screens/people/parts.tsx` (added; existing exports unchanged)
```tsx
export function StatusPill({ tone, children }: { tone: 'good' | 'pending' | 'bad' | 'neutral'; children: ReactNode });
export function requestTone(status: RequestStatus): 'good' | 'pending' | 'bad' | 'neutral';  // approved good, pending pending, rejected bad, cancelled neutral
export function EmployeeCell({ name, sub }: { name: string; sub?: string | null });   // initials avatar + name (+ a second line)
/** A control for something not built yet: disabled, with the note. Renders a real disabled <button>. */
export function LaterButton({ children, icon, variant, size }: { children: ReactNode; icon?: LucideIcon; variant?: 'default' | 'outline' | 'ghost'; size?: 'sm' | 'default' });
export const LATER_NOTE = 'Available in a later update';
/** Replaces a personal screen's cards when the account is linked to no employee record. */
export function NotLinkedCard();
/** The whole body of an HR-only screen for someone who is not an owner or admin. */
export function HrOnlyScreen({ title }: { title: string });
```
Colours: good emerald, pending amber, bad red, neutral muted, as the sample pills use. `NotLinkedCard` carries the Overview's existing wording ("Your HR record isn't linked yet" and its sentence); `assistant.tsx` switches to it with no change in what is shown. `HrOnlyScreen` shows the page header and one card: "This page is for owners and admins of the workspace."

**Behaviour to implement:**

- [ ] **Step 1: Dates.** Write the failing tests first in `tests/people-dates.test.ts`, then the functions. Required cases: `todayInMalaysia(new Date('2026-10-10T16:30:00Z'))` is `'2026-10-11'` and `…T15:59:59Z` is `'2026-10-10'`; `malaysiaDate` agrees with it; `formatDate('2026-10-09')` is `'09 Oct 2026'`; `monthYearLabel('2026-10-09')` is `'October 2026'`; `weekdayName('2026-10-09')` is `'Friday'`; `clockTime('2026-10-09T00:59:00Z')` is `'08:59'`; `hoursBetween('…T01:00:00Z', '…T09:06:00Z')` is `8.1`, and `0` when the end is earlier; `hoursBetweenTimes('14:00:00', '15:30')` is `1.5`; `relativeTime` for 30 seconds, 5 minutes, 2 hours, 1 day, 3 days, 15 days and 60 days before `now` gives `'just now'`, `'5 minutes ago'`, `'2 hours ago'`, `'yesterday'`, `'3 days ago'`, `'2 weeks ago'` and a `formatDate` string. Every existing test in that file still passes unchanged.
- [ ] **Step 2: Series and own.** Tests first (`tests/people-series.test.ts`, `tests/people-own.test.ts`). Required cases: `bucketByMonth` over 3 months returns exactly 3 buckets oldest first with zeros where no row falls, ignores rows outside the window and rows whose date is null, and crosses a year boundary (today `2026-01-15`, 3 months → Nov, Dec, Jan); `bucketByWeek` starts weeks on Monday and labels with the Monday; `sumBy` orders by value then key and drops null keys; `percent(1, 0)` and `average([])` are `null`; `isTeamView` is true for HR, true for a demo member, false for a plain member; `ownRows` returns only the viewer's rows, the demo employee's rows for a demo visitor, and `[]` when `employeeId` is null **even for an HR viewer**; `leaveDaysByTypeInYear` counts approved leave only, by start date's year; `departmentAverages` on no rows is `[]`.
- [ ] **Step 3: Overtime.** Tests first (`tests/people-overtime.test.ts`) on the sample data at `NOW = new Date('2026-10-09T04:00:00Z')` and on no rows (all zeros, empty lists, no `NaN`). Pending hours on the sample data are 4 (one record), `by_department` has one entry for that employee's department, `by_rate` has only the rates present.
- [ ] **Step 4: The four reads.** Add the types and methods. `supabase.ts`: three `rows()` calls with the columns above (`employee:hr_employees(name)` joined for documents and letters) and `getSettings` reading one row with `maybeSingle()`, returning `DEFAULT_PEOPLE_SETTINGS` when there is none, with any missing key filled from the defaults; add all four to `EMPTY_PEOPLE_DATA`. `seed.ts`: mirror the demo seed in `supabase/migrations/20261014090700_people_demo_seed.sql` (26 documents, 5 letters, 6 vouchers, the one settings row; survey section D lists them). Extend `tests/people-seed.test.ts` (those counts; employee 1 has 7 documents, 1 pending signature, 1 expiring), `tests/people-provider.test.ts` (each new method reads its table within the workspace; `getSettings` returns the defaults for no row) and `tests/people-provider.rls.test.ts` (each new method runs against the demo workspace without error and returns the demo's counts).
- [ ] **Step 5: Shared pieces.** Add the components to `parts.tsx`; switch `assistant.tsx` to `NotLinkedCard`. `tests/people-parts.test.tsx` renders with `react-dom/server`'s `renderToStaticMarkup`: `LaterButton` output contains `disabled` and the note; `requestTone` maps the four statuses; `HrOnlyScreen` contains its sentence. If the repo's Vitest setup cannot render TSX, test `requestTone` and `LATER_NOTE` only and say so.
- [ ] **Step 6: Verify and commit.** `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test` all clean (this task runs alone, so the full suite is allowed here).

```bash
git add src/lib/people src/screens/people/parts.tsx src/screens/people/assistant.tsx tests
git commit -m "feat(people): shared surface for the remaining Lekiu screens — four new reads, date and series helpers, shared screen pieces"
```

---

## Screen groups: Tasks 2 to 8 (run in parallel after Task 1)

Each task owns the files it lists and nothing else. For each screen: read its survey section, apply the Screen Rules, keep and remove what the task says, and put every computed figure in the task's module as a pure function of rows and `today`, tested on the sample data (`createSeedPeopleData(new Date('2026-10-09T04:00:00Z'))`) and on no rows. Each module's tests must include the Review Focus cases named for the task.

Every task ends the same way: run its own test file and `pnpm eslint` on its own files, write its report, and stop without committing. The coordinator typechecks and commits.

### Task 2: My requests — Leave, Time-Off, Financial Claims, OT Claims

**Files:** rewrite `src/screens/people/leave.tsx`, `time-off.tsx`, `claims.tsx`, `ot-claims.tsx`; create `src/screens/people/my-requests.tsx` (the shared layout: header with one `LaterButton`, KPI row, two summary cards, the "My requests" table); create `src/lib/people/requests.ts`; test `tests/people-requests.test.ts`. Survey: A.7–A.10, C2.

- **Leave.** Keep: Annual balance (remaining, caption "of N days"), Used this year (approved days), Pending (count), Medical leave taken (caption "of N days"); "Leave used by type" donut (`leaveDaysByTypeInYear`); "Entitlement used" list from `leaveBalanceRows`; the table (Type, From, To, Days, Status, Applied). Remove: all sparklines; the footnote's "Carry-forward" (keep an "Unpaid leave: N days" line only when N > 0).
- **Time-Off.** Keep: This month (count by `off_date`), Approved, Pending, Hours this month (`hoursBetweenTimes`); the table (Date, From, To, Duration, Reason, Status). Remove: both "by reason" cards (reasons are free text); sparklines.
- **Financial Claims.** Keep: Claimed this month (not cancelled), Approved, Pending (amount, caption "N claims"); "Claims by category" donut and "Spend by category" list (`sumBy` over `category`, `CLAIM_CATEGORY_LABEL`); the table (Category, Amount, Date, Receipt, Status). Remove: "Reimbursed"; sparklines and deltas.
- **OT Claims.** Keep: OT hours this month, OT pay this month, Pending hours, Approved hours (from `overtimeModel` over the viewer's own records); "OT by month" bars (`by_month`); "By rate" list (`by_rate`); the table (Date, Hours, Rate, Amount, Status). Remove: "cap 104 h/month" from the subtitle; sparklines and deltas.
- **Tests must cover:** an HR viewer linked to employee 2 gets employee 2's rows only, on each of the four models; a viewer with `employeeId` null yields the not-linked state for all four; the demo employee's leave model on the sample data (3 requests, 1 pending); no rows gives zeros and `null`s with no `NaN`.

### Task 3: Approvals — Leave, Financial Claims, Overtime, Time-Off

**Files:** rewrite `src/screens/people/approve-leave.tsx`, `approve-claims.tsx`, `approve-overtime.tsx`, `approve-time-off.tsx`; create `src/screens/people/approvals-screen.tsx` (the shared layout); create `src/lib/people/approvals.ts`; test `tests/people-approvals.test.ts`. Survey: A.11–A.14, C1.

- **All four.** HR-only (Rule 7). Keep: Pending (count, with the queue's own caption: days, ringgit or hours), Approved this month, Rejected this month (month by the request's own date: `start_date`, `claim_date`, `work_date`, `off_date`); "… over time" chart, 8 weeks by `created_at` via `malaysiaDate`, series Submitted and "Approved since" (of those submitted that week, how many are approved now; the subtitle says so); the "Pending by …" breakdown (leave by type, claims by category in ringgit, overtime by department in hours via `overtimeModel`, time-off: remove the breakdown, reasons are free text); the table, newest first, with `EmployeeCell`, a `StatusPill` and, for pending rows, disabled Approve and Reject (`LaterButton`). Remove: "Avg turnaround"; the period `Select`; sparklines and deltas; the card buttons "Calendar", "Batch pay", "Timesheets" (they lead nowhere). Keep "Export" as a `LaterButton`.
- **Tests must cover:** the sample data's queues (3 pending leave, 2 pending claims totalling RM 420.00, 1 pending overtime of 4 hours, 0 pending time-off); a plain member's viewer makes each builder return without calling any read (assert with a `PeopleData` whose methods throw); no rows gives empty queues and zeros.

### Task 4: Attendance — My Attendance, Timesheet, Shift Calendar, Overtime

**Files:** rewrite `src/screens/people/my-attendance.tsx`, `timesheet.tsx`, `shift-calendar.tsx`, `overtime.tsx`; create `src/lib/people/attendance.ts`; test `tests/people-attendance.test.ts`. Survey: A.3, A.17–A.19, C3.

- **My Attendance** (personal). Keep: Days present this month (caption "of N recorded days"), Average clock-in (`clockTime` of the mean), Late this month, Annual leave left; "Hours worked" over the last 10 recorded days (`hoursBetween(clock_in, clock_out)`, a day with no clock-out is left out); the 8-week "Attendance pattern" heat grid; "Leave taken by type" donut; "Recent clock-ins" table with all four statuses. Remove: the "of 176h / % of target" footer (no target is recorded); sparklines and deltas. "Clock In" is a `LaterButton`.
- **Timesheet** (team, Rule 8). Current week only (Monday to Sunday from `weekStart(today)`). Keep: the employee × weekday hours table, total hours, billable hours and billable share (`percent`), a per-employee bar chart (`timesheetByEmployee`). Remove: week navigation; "pending approval" and "on the clock now" tiles (nothing records them); sparklines.
- **Shift Calendar** (team, Rule 8). Current week only. Keep: the roster table (employee × day: Morning, Night, Off, or blank when no shift is set), counts of morning and night shifts this week. Remove: coverage, open slots and any "required" figure; week navigation; "Publish" or assign controls become `LaterButton`s.
- **Overtime** (team, Rule 8). Keep: hours and cost this month, pending hours, people with overtime (`overtimeModel`); hours by month; the records table with `EmployeeCell`. Remove: "Avg OT per employee" against a cap and the "Rate policy" tile's legal claims; show the rate multipliers actually present (`by_rate`) instead.
- **Tests must cover:** My Attendance for an HR viewer linked to employee 3 uses employee 3's days only; a member's timesheet model flags `team: false` so the screen can say "Your records" and hide totals titled as the team's; the average clock-in of no days is `null`; a week with no shifts gives an empty roster, not rows of blanks for every employee.

### Task 5: Payroll — Payroll, Payment Vouchers

**Files:** rewrite `src/screens/people/payroll.tsx`, `payment-vouchers.tsx`; create `src/lib/people/payroll.ts`; test `tests/people-payroll.test.ts`. Survey: A.20–A.21, C5.

- **Both.** HR-only (Rule 7).
- **Payroll.** Keep: the latest run's gross, net, employer-visible deductions (EPF, SOCSO, EIS, PCB as recorded on the payslips) and headcount paid, labelled with `monthYearLabel` and the run's status (Draft or Paid); gross by month for the runs that exist (`payrollSummary`, oldest first); a deductions donut for the latest run; the payslip table for the latest run (employee, gross, each deduction, net, status). Remove: "Run payroll" and "Export" become `LaterButton`s; any bank-file or statutory-submission status; sparklines and deltas.
- **Payment Vouchers.** Keep: total issued and paid this month, drafts (count), outstanding (issued, not paid); amount by month (`bucketByMonth` on `issued_date`); by type donut (`sumBy` on `voucher_type`); the table (Voucher no, Payee, Type, Amount, Date, Status). "New voucher" and "Export" are `LaterButton`s.
- **Tests must cover:** the sample data's latest run (gross RM 105,200.00, status draft, 20 payslips) and the six vouchers (total RM 27,465.00; 4 paid, 1 issued, 1 draft); a plain member's viewer reads nothing; a workspace with no runs gives a model that says so (`latest: null`) rather than zeros dressed as a run.

### Task 6: Performance — My Goals, Scorecard, Review Scores, Training

**Files:** rewrite `src/screens/people/my-goals.tsx`, `scorecard.tsx`, `review-scores.tsx`, `training.tsx`; create `src/lib/people/performance.ts`; test `tests/people-performance.test.ts`. Survey: A.4, A.22–A.24, C5.

- **My Goals** (personal). Keep: Goals, On track, At risk, Average progress; the gauge; "Progress by goal" bars (the title, shortened to 28 characters with an ellipsis); one card per goal (title, status pill, progress bar, "Due …" with `formatDate` when a due date is set). Remove: descriptions; "this quarter" wording; sparklines and deltas. "Add Goal" is a `LaterButton`.
- **Scorecard** (team, Rule 8). Scores are 0 to 5, shown to one decimal as "4.2 / 5". Keep: average score, highest, number scored; average by department (`departmentAverages`); the competency radar from the `competencies` the rows carry (averaged per competency name); the per-employee table (employee, period, score, competencies). Remove: anything on a 0–100 scale, targets, sparklines.
- **Review Scores** (team, Rule 8). Keep: counts by rating (Exceeds, Meets, Below), average score, average by department; the table (employee, period, rating pill, score, reviewer, reviewed on). Remove: separate "Manager" and "Self" scores, peer scores, a review "status", sparklines.
- **Training.** Courses are shared; enrolments are personal. Keep: courses by status (Upcoming, In progress, Completed); the course table (title, category, provider, dates, status) with, for a team view, enrolled and completed counts, and for a member, "You are enrolled" / "Completed" from their own enrolments. Remove: hours; completion "rate" for a member; sparklines. "Add course" and "Enrol" are `LaterButton`s.
- **Tests must cover:** My Goals for the demo employee on the sample data (4 goals; 3 on track, 1 at risk); a member's scorecard model has `team: false` and no department averages; the sample data's ratings (6 exceeds, 10 meets, 4 below); a member's training model never carries a headcount.

### Task 7: Records and documents — Records, My Documents, Letters, Settings

**Files:** rewrite `src/screens/people/records.tsx`, `my-documents.tsx`, `letters.tsx`, `settings.tsx`; create `src/lib/people/documents.ts`; test `tests/people-documents.test.ts`. Survey: A.5, A.6, A.16, A.25, section B.

- **Records** (personal). Keep: Tenure (years, caption "since YYYY"), Annual leave left, Department (the full name), Employment type; the Personal, Employment, Statutory, Emergency Contact and Bank cards from the directory row and `getEmployeePrivate(viewer.employeeId)`. The bank account shows its last 4 characters only. A field with nothing recorded shows "Not recorded". Remove: "EIS / SIP", "Tax resident", emergency-contact "Relationship", "Permanent".
- **My Documents** (personal). Keep: Documents, Pending signature, Expiring within 90 days, Payslips; "By type" donut; the table (Document, Type, Date or "Expires …", Status). Remove: the per-row "PDF" button and file size (no file is stored): replace the Action column's button with a `LaterButton`; "Upload" is a `LaterButton`; sparklines.
- **Letters** (team, Rule 8: a member sees letters addressed to them, under "Your letters"). Keep: Issued, Drafts, Issued this month; by-type donut (`sumBy` on `letter_type`); the table (employee, letter, type, status, issued on). Remove: the "Templates" list; "EA Form" as a letter type; download buttons become `LaterButton`s; "New letter" is a `LaterButton`.
- **Settings.** HR-only (Rule 7). Shows what `getSettings()` returns, read-only: working days, default annual leave days, the three overtime multipliers, and the notification switches (rendered disabled). Every other field on the sample screen (company name, registration number, HR email, pay day, statutory rates, approval policy, hours per day and the rest) is removed: nothing stores it. One `LaterButton` "Save changes". A line under the header: "These are the workspace's HR defaults."
- **Tests must cover:** the demo employee's documents on the sample data (7; 1 pending signature; 1 expiring); `maskAccount` is exported from `src/lib/people/documents.ts`; a document whose `expires_on` is 91 days away is not "expiring soon" and one 90 days away is; records for a viewer with no private row show "Not recorded", never `undefined` or `null` as text; an HR viewer linked to employee 5 gets employee 5's documents on My Documents; a plain member's settings builder reads nothing; `maskAccount('1234567890')` is `'••••7890'` and a 3-character account is fully masked.

### Task 8: Company — Dashboard, Announcements, Public Holidays

**Files:** rewrite `src/screens/people/dashboard.tsx`, `announcements.tsx`, `public-holidays.tsx`; create `src/lib/people/company.ts`; test `tests/people-company.test.ts`. Survey: A.1, A.2, A.15.

- **Dashboard** (team, Rule 8). Keep: Headcount (with its sparkline from `headcountTrend`, the one sparkline kept anywhere, under the caption "Today's staff by join date"); Attendance rate today (`attendanceOn`); Payroll, latest run (HR only, with its month); "Attendance trend" over 8 weeks (`bucketByWeek` of the weekly rate; one series, "Present or late"); "Leave this month" donut (`leaveDaysByType`); "Headcount by department"; "Joiners" bars over 6 months by `join_date`; "Payroll cost" by month (HR only). Remove: Turnover, Retention, "Leavers", "On-time %", "Recent activity", the period `Select`. "Export" is a `LaterButton`. For a member, every figure built from personal or HR-only rows shows `HR_ONLY`; headcount and departments stay.
- **Announcements.** Keep: Announcements (count), This month, Categories; "By category" donut; the list, newest first (title, category badge, body, author or "Unknown", `relativeTime`). Remove: "Unread", the unread dot, "N unread" and "Mark all read" (nothing records reading); sparklines and deltas. "New Announcement" is a `LaterButton`.
- **Public Holidays.** Keep: holidays this year (count), the next holiday (name, `formatDate`, "in N days"), holidays this month; the table (Holiday, Date, Day via `weekdayName`, Scope, State), past holidays muted. Remove: anything about replacement leave or long weekends the sample computed by hand. "Add holiday" is a `LaterButton`.
- **Tests must cover:** a member's dashboard model carries headcount and departments and marks everything else `team: false`; the weekly attendance rate is `null` for a week with no recorded days, not 0; the sample data's announcements (5, one per category); the next holiday after `2026-10-09` on the sample data is Christmas Day; an empty workspace's dashboard has headcount 0 and no `NaN`.

---

### Task 9: Bring it together (coordinator)

- [ ] **Step 1: Land the groups.** As each of Tasks 2–8 reports: run its test file; commit its files by path as one commit named for the group; build the review package over that commit; review the group (spec and quality); send findings back to the task's own implementer. Do not run `pnpm tsc` yet: other groups are still mid-write. Once all seven have reported, run `pnpm tsc --noEmit` and `pnpm lint` and send each error to the task that owns the file.
- [ ] **Step 2: Mark the screens live.** Add all 25 `people/<slug>` keys to `LIVE_SCREENS` in `src/config/live-screens.ts`. Rewrite `tests/people-live-screens.test.ts`: all 27 Lekiu screens are live; `people/calendar` is still a sample. A group that has not landed keeps its keys out, and the final report says so.
- [ ] **Step 3: No sample data left.** `grep -rn "Saudara\|Rimba Ventures\|openkuasa.com" src/screens/people` returns nothing (the chat card's demo answer in `ask-lekiu-hero.tsx` may keep "Saudara" in its heading only). Every screen file imports `loadPeople`.
- [ ] **Step 4: Whole-branch checks.** `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build` (the route list still has all 27 `/people/*` pages). `pnpm vitest run --dir tests people.rls people-provider.rls people-capabilities.rls` passes against the live database.
- [ ] **Step 5: Whole-branch review**, on the most capable model, pointed at the Review Focus and at every deferred minor in the ledger.
- [ ] **Step 6: Browser, as a demo guest** on a local server: one screen from each group loads with no work-in-progress banner, real figures for the fictional company, and disabled controls carrying the note. Leave, My Attendance and Records show Aisyah Rahim's own rows.
- [ ] **Step 7: Stop for the owner.** Not done without a sign-in: the same pass as a real owner of a workspace with a few employees, and as a plain member (who must see "not linked" on personal screens until linked, the notice on HR-only pages, and "Your records" on team screens).

## Not in this plan

- Any write: applying, approving, clocking in, running payroll, uploading, saving settings. Those are the later slices (leave; claims and overtime; attendance; payroll; performance and documents).
- Week navigation and date-range filters (the pages take no parameters yet).
- Lekiu inside Tuah.
- `/people/calendar`, which is Kasturi's shared screen.

## Execution Notes (2026-10-11)

The plan above is as written. The branch is the reference. What changed or was decided along the way:

- **Task 1.** `LaterButton` has a `compact` form for table rows (the note is then for hover and screen readers; the card says it once). The date helpers return "—" or "" for a bad timestamp instead of throwing. Undated documents sort last on the live database.
- **Screens kept beyond the lists.** Public Holidays keeps "By type" and "Coming up"; Review Scores and Training keep four chart cards the sample had. All are built from real rows and show "Shown to HR admins" to a member.
- **Members on team screens.** Tiles are omitted (Timesheet, Shift Calendar, Overtime, Letters), retitled "Your …" (Scorecard, Review Scores) or shown as "—" (Dashboard). Charts titled as the team's show "Shown to HR admins"; tables say "Your records".
- **Definitions settled in code.** "Pending" everywhere is every pending request, whatever its date. "This month" is the calendar month of the row's own date. "Claimed this month" counts every claim not cancelled, including rejected ones. Overtime cost and pay include pending and say so. Payroll and the Dashboard both skip a payroll run that has no payslips yet. Letters "Issued" is this year. "Expiring" on My Documents is by date, within 90 days.
- **Final review.** Payroll and the Dashboard disagreed on the latest run when the newest had no payslips; fixed. Personal screens now read nothing for an account with no employee record.
- **Must be settled before letters can be written:** the database lets an employee read letters addressed to them at any status, so a member would see a draft (a warning, say) before it is issued. The fix is a policy change (own rows only when issued), not a screen filter. The same question applies to a member's payslips in a draft payroll run.
- **Left for later:** captions render as small grey chips; Settings shows four fixed notification switches whatever is stored; approvals, vouchers, letters, scorecards and reviews tables are not capped; an owner whose data fails to load on an HR-only page is told the page is for owners and admins; radar and bar charts have no fixed 0 to 5 scale; an unlinked member on a team screen sees "no records" rather than "not linked"; provider-side filters and a marker at the 5,000-row stop.
- **Not done, needs the owner:** the browser pass as a signed-in owner of a real workspace and as a plain member.
