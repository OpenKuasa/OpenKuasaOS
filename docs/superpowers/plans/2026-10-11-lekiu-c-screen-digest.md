# Plan C digest: converting the 25 Lekiu sample screens to the `PeopleData` seam

Worktree: feat-098-lekiu-screens. Survey only; no project file was modified.
Sections: Preamble (the seam and the live pattern), A (25 screens), B (the four unread tables), C (shared layouts), D (what the seed holds), E (surprises).

## 0. Preamble: the seam and the pattern a live screen follows

- `PeopleData` (src/lib/people/types.ts) has 20 read methods: `listDepartments`, `listEmployees`, `getEmployeePrivate(employeeId)`, `listLeaveRequests`, `listLeaveBalances(year)`, `listTimeOffRequests`, `listClaims`, `listOvertime`, `listAttendance(from,to)`, `listTimesheet(from,to)`, `listShifts(from,to)`, `listPublicHolidays`, `listPayrollRuns`, `listPayslips`, `listGoals`, `listScorecards`, `listReviews`, `listTrainings`, `listTrainingEnrolments`, `listAnnouncements`. None takes an employee filter (except `getEmployeePrivate`); none exposes `decided_at`/`decided_by`; money is integer cents; dates are `YYYY-MM-DD` strings; moments are ISO strings.
- Providers: `createSupabasePeopleData(client, orgId)` (RLS decides rows; pages of 1000, MAX_PAGES 5, so a table silently truncates at 5,000 rows), `createSeedPeopleData(now)` (no-env dev/preview/tests), `EMPTY_PEOPLE_DATA` (signed in, no workspace). `getPeopleData` picks one. A new read method must be added in all of: `types.ts`, `supabase.ts` (+ `EMPTY_PEOPLE_DATA`), `seed.ts`.
- RLS read kinds (`private.people_secure_table`): `shared` = any org member; `personal` = org admin/owner, or the row's own employee, or (demo org and any member); `hr` = org admin/owner, or (demo org and any member). Only `hr_departments`, `hr_employees`, `hr_employee_private` have write policies; everything else is select-only.
- Consequence for every `personal` table: in a real workspace an owner/admin gets ALL rows, so a "My ..." screen must filter by `viewer.employeeId` itself; in the demo workspace EVERY member gets all rows and `viewer.employeeId` is `DEMO_EMPLOYEE_ID` (= md5('rimba-emp-1') = Aisyah Rahim, employee 1). A member whose account is not linked has `employeeId === null` and sees only the shared tables.
- Live pattern (`assistant.tsx`, `employees.tsx`): `export default async function XScreen()` calls `loadPeople('tag', async (data, now, ctx) => model)` from `./parts` (returns `{ model, viewer, chatDemo, hasWorkspace }`; `model` is null when the read threw, and errors are only logged). Every card renders `!model ? LOAD_FAILED : ...`. Empty states use `<Muted>`. `HR_ONLY` (= "Shown to HR admins") is shown in place of team-titled figures when `!teamView` where `teamView = viewer.isHr || viewer.isDemo`. `NOT_AVAILABLE` ("Not available yet") is the existing placeholder for things with no source. The model is built by pure functions in `src/lib/people/*` taking rows plus `today = todayInMalaysia(now)`. `assistant.tsx` also shows `notLinked` / `noEmployees` / `noWorkspace` banner cards and `DEPARTMENT_COLORS` for slices.
- None of the 25 sample screens is a client component (no 'use client' anywhere under src/screens/people), none is async, none imports `@/lib/people/*`. All are plain function components with module-level mock constants. The shadcn `Select`, `Switch`, `Input` they embed are client components themselves.
- Nav gating (src/config/nav.ts, `needs: 'approve'` = HR only): approve-leave, approve-claims, approve-overtime, approve-time-off, payroll, payment-vouchers, settings. Every other screen is visible to every member (even where the data is `personal` and so narrows to the member's own rows).
- Pure helpers available: overview.ts `leaveLabel`, `claimLabel`, `headcountByDepartment`, `onLeaveOn`, `pendingApprovals`, `approvalCounts`, `approvalsHeading`, `leaveDaysByType(leave, monthStart)`, `headcountTrend`, `upcomingOccasions`, `attendanceOn`, `buildPeopleOverviewModel`; summaries.ts `payrollSummary`, `attendanceCounts`, `lateByEmployee`, `timesheetByEmployee`, `performanceSummary`, `leaveBalanceRows`; employees.ts `buildEmployeesModel`, `filterEmployees`, `EMPLOYMENT_LABEL`, `EMPLOYMENT_TYPES`; dates.ts `todayInMalaysia`, `addDays`, `daysBetween`, `monthStart`, `addMonths`, `weekStart`, `isWeekday`, `formatDay` ("09 Oct", no year), `monthLabel` ("Oct"). `rm(cents)` lives in `@/lib/reach/format` ("RM 1,234.50"). There is NO relative-time ("2 hours ago") formatter, NO Kuala Lumpur clock-time formatter, NO weekday-name helper, NO year-aware date formatter, NO weekly/monthly bucketing helper, NO hours-between-times helper.
- Charts available (`@/components/charts`): AreaTrend, BarGroup (props seen: horizontal, stacked, showLegend, height), DonutStat (centerValue, centerLabel), RadialGauge, RadarSpread, Sparkline, HeatGrid, FunnelFlow; types `Series`, `Slice`. Bento: BentoGrid, BentoCard (tone, title, subtitle, icon, action, flush, bodyClassName), BentoStat (label, value, delta, deltaTone, onPrimary, chart).
- Two things apply to ALL 25 screens and are not repeated below: (1) each opens with `ScreenContainer` (+ `PageHeader` except the Overview) and a `BentoGrid`; (2) most subtitles address the user as "Saudara" and several name "Rimba Ventures Sdn Bhd"; that is mock-only wording.
- "write control: must be removed or disabled" applies to every Button/Input/Select/Switch that would create, approve, upload or save, because no table those screens read is writable yet.

## A. The 25 screens

Order below follows the nav (General, Applications, Approvals, Attendance, Payroll, Performance, Configuration); A.1-A.10 are General/Applications, A.11-A.14 approvals, A.15-A.16 public holidays and letters, A.17-A.19 attendance, A.20-A.21 payroll, A.22-A.24 performance, A.25 settings.

### A.1 dashboard  (`src/screens/people/dashboard.tsx`; nav "Dashboard", General; not gated)
1. Purpose/audience: company-wide HR KPIs and trends for the whole team. Meaningful for HR/demo (`teamView`); a non-HR member only gets their own personal rows from the DB, so any team-titled figure built from personal tables must be HR_ONLY for them.
2. Widgets in page order (all mock constants at file top):
   - PageHeader "HR Dashboard", subtitle "People operations · Rimba Ventures Sdn Bhd · FY2026, Saudara." (hard-coded company name and "FY2026").
   - Header control: `Select` (default `mtd`; options "This month" / "This quarter" / "Financial year"), w-40. Wired to nothing.
   - Header control: `Button` outline sm "Export" (Download icon).
   - KPI "Headcount" = "20", delta "+1", onPrimary, Sparkline [16,16,17,18,18,19,19,20].
   - KPI "Attendance rate" = "94%", delta "+1pt" (up), Sparkline [90,91,89,92,93,92,93,94] (8 monthly points, Mar..Oct).
   - KPI "Turnover · YTD" = "8%", delta "−1pt" (up), Sparkline [11,10,10,9,9,8,8,8].
   - KPI "Payroll · MTD" = "RM 182k", delta "+2%" (flat), Sparkline [158,160,164,168,170,174,178,182] (RM k).
   - Card "Attendance trend" / "Present & on-time · FY2026" (TrendingUp), col-span 8: AreaTrend, 8 months Mar..Oct, series `present` "Present %" (90,91,89,92,93,92,93,94) and `ontime` "On-time %" (86,87,85,88,90,89,91,92), showLegend, height 240.
   - Card "Leave utilisation" / "Days this month" (PieChart), col-span 4: DonutStat slices Annual 8, Medical 5, Emergency 2, Unpaid 1; centre "16" / "days".
   - Card "Headcount by department" / "Active employees" (ChartColumn), col-span 8: BarGroup, series `headcount` "Headcount": Sales 6, Operations 5, Marketing 3, Finance 3, Management 3.
   - Card "Retention" / "12-month rolling" (Gauge), col-span 4: RadialGauge value 92, label "retained", valueLabel "92%".
   - Card "New joiners vs leavers" / "Last 6 months" (UsersRound), col-span 6: BarGroup showLegend, series `joiners` "Joiners", `leavers` "Leavers"; May 1/0, Jun 2/0, Jul 0/1, Aug 1/0, Sep 1/1, Oct 1/0.
   - Card "Payroll cost" / "Gross monthly (RM k)" (Banknote), col-span 6: AreaTrend series `payroll` "Payroll (RM k)", Mar 158 .. Oct 182.
   - Card "Recent activity" / "Across the HR module" (Activity), col-span 12: 2-column list of 6 strings, each with a relative time ("2h","5h","1d","1d","2d","3d"): "Payroll run completed — RM 182,000 (incl. EPF, SOCSO, PCB)", "Siti Lestari — annual leave approved (07–10 Oct)", "New joiner: Amirul Danial onboarded to Sales", "Faiz Hakim submitted a medical certificate", "Ahmad Zaki filed overtime — 4 hrs pending approval", "EPF/KWSP & SOCSO September contributions submitted".
3. Data mapping:
   - Header Select: no data; it is a period filter. Remove, or make a real server param. Nothing backs "Financial year" (no fiscal-year setting; `hr_settings` has none).
   - Headcount KPI: `listEmployees()` active count (`totals.headcount` in `buildPeopleOverviewModel`). Sparkline: `headcountTrend(employees, today, 8)` (join-date reconstruction, ignores leavers). Delta "+1" derivable from the last two trend points.
   - Attendance rate KPI + Attendance trend (both series): `listAttendance(from,to)` over 8 months (rows `work_date`,`status`); per month `attendanceCounts(days)` gives present/late/absent/on_leave/`rate_pct`. "Present %" = `rate_pct`; "On-time %" must be new code = present/(present+late+absent) (no helper). SEED CAVEAT: seed and demo hold only the last 56 days (2-3 calendar months), so earlier months would be empty (null).
   - Turnover YTD KPI: NO SOURCE (no leaving date; `status='inactive'` has no date).
   - Payroll MTD KPI + Payroll cost chart: `listPayrollRuns()` + `listPayslips()` -> `payrollSummary(runs, payslips)` -> `gross_cents` per `period_month` (8 runs in seed, returned newest first so reverse for a chart). HR-only: `hr_payroll_runs` is `hr`; payslips are `personal` (non-HR sees only their own). Label "MTD" is inaccurate: the current month's run is a `draft` of the full month.
   - Leave utilisation: `listLeaveRequests()` -> `leaveDaysByType(leave, monthStart(today))` (returns {label:'Annual leave', days}); labels differ from the mock ('Annual'). Centre = sum of days.
   - Headcount by department: `headcountByDepartment(employees)`.
   - Retention (12-month rolling): NO SOURCE (needs leavers).
   - New joiners vs leavers: joiners derivable from `Employee.join_date` bucketed by month; leavers NO SOURCE. DEMO NOTE: the shortest tenure in the sample company is 210 days (Daniel Wong), so joiners in the last 6 months = 0: the chart would be flat zero.
   - Recent activity: NO SOURCE as an audit log (no activity table; `decided_at`/`decided_by` exist in the DB but not in the row types). A synthesised feed is possible from `pendingApprovals()` (`requested_at`), `Announcement.published_at`, `PayrollRun.paid_at`, `Employee.created_at`, but the title "Across the HR module" would overpromise.
4. Write controls: "Export" button (remove or disable). The Select does not write but is non-functional (disable or wire to a real param).
5. Existing helpers: `headcountTrend`, `headcountByDepartment`, `leaveDaysByType` (overview.ts); `attendanceCounts`, `payrollSummary` (summaries.ts); `addMonths`, `monthStart`, `monthLabel` (dates.ts).
6. Imports: `@/components/charts` AreaTrend, BarGroup, DonutStat, RadialGauge, Sparkline, types Series, Slice; `@/components/bento/bento` BentoGrid, BentoCard, BentoStat; ui Button; ui Select/SelectContent/SelectItem/SelectTrigger/SelectValue; ScreenContainer, PageHeader. Server component (no 'use client'), non-async `DashboardScreen`. Icons: Activity, Banknote, ChartColumn, Download, Gauge, PieChart, TrendingUp, UsersRound.

### A.2 announcements  (`announcements.tsx`; nav "Announcements", General; not gated; excluded from PEOPLE_PATHS)
1. Purpose/audience: company-wide posts; everyone reads the same rows (`hr_announcements` is `shared`).
2. Widgets:
   - PageHeader "Announcements", subtitle "Company-wide updates for your team, Saudara."; action `Button` "New Announcement" (Plus).
   - KPI "Active" = POSTS.length (6), delta "posted", Sparkline [3,4,4,5,6,6], onPrimary.
   - KPI "This month" = count of `thisMonth` flags (5), delta "+3" (up), Sparkline [2,3,4,5,5,5].
   - KPI "Unread" = count of `unread` flags (3), delta "for you" (down), Sparkline [1,2,2,3,3,3].
   - KPI "Categories" = distinct categories (5), delta "channels", Sparkline [3,4,4,5,5,5].
   - Card "By category" / "Across all announcements" (PieChart), col-span 4: DonutStat slices General/Holiday/Benefits/Strategy/Policy (chart-1..chart-5; zero-count slices filtered out), centre = total, label "posts".
   - Card "Latest announcements" / `${unreadCount} unread · newest first` (Megaphone), col-span 8, card action Button outline "Mark all read" (MailCheck). List item: round avatar with `author[0]`, LiveDot if unread, title (h3), Badge (secondary) with category, body paragraph, then Bell icon + author + "·" + relative time ("2 hours ago","1 day ago","3 days ago","6 days ago","1 week ago","2 weeks ago"). Six mock posts: Company Townhall, Hari Raya Holiday Notice, EPF Contribution Rate Update, New Dental Benefit, Q4 OKRs Published, Office Renovation — Level 3.
3. Data mapping:
   - Active: `listAnnouncements()` length (no expiry/active flag in the table, so "active" = all). This month: count of `published_at` in the current month (derive). Categories: distinct `category`. Sparklines: per-month counts from `published_at` are derivable, but the mock's cumulative meaning is not.
   - "+3" delta: derivable (this month minus last month); mock figure arbitrary.
   - Unread KPI, per-row unread LiveDot, "N unread" subtitle: NO SOURCE (no read-receipt table or column).
   - By category: counts of `Announcement.category` (db values lower-case: general, holiday, benefits, strategy, policy; the same five as the mock; labels need capitalising).
   - List: `title`, `body`, `category`, `published_at` (ISO; needs a relative-time formatter, none exists under `src/lib/people/`), `author_name` (nullable text; mock authors are roles 'HR','Finance','CEO','Admin' while seed author is the person 'Siti Lestari'; avatar must tolerate null).
4. Write controls: "New Announcement" (remove/disable); "Mark all read" (remove/disable; no read state exists).
5. Helpers: none relevant. No relative-time helper exists.
6. Imports: charts DonutStat, Sparkline, Slice; Bento (Grid/Card/Stat); ui LiveDot, Badge, Button; ScreenContainer, PageHeader. Server component, non-async.

### A.3 my-attendance  (`my-attendance.tsx`; nav "My Attendance", General; not gated)
1. Purpose/audience: the signed-in employee's own attendance. Must filter every row by `viewer.employeeId` (demo viewer = Aisyah Rahim, `DEMO_EMPLOYEE_ID`): in the demo workspace and for HR the DB returns ALL employees' attendance, so RLS alone does not narrow it.
2. Widgets:
   - PageHeader "My Attendance", subtitle "Your clock-ins, hours and leave balance, Saudara."; action Button "Clock In" (LogIn).
   - KPI "Days present" = "18", delta "of 19", onPrimary, Sparkline [16,17,18,18,19,18,18].
   - KPI "Avg clock-in" = "09:02", delta "+2 min" (down), Sparkline [6,3,4,12,2,3,2].
   - KPI "Late count" = "1", delta "this month", Sparkline [2,1,2,1,0,1,1].
   - KPI "Leave balance" = "8.5", delta "days left", Sparkline [14,13,12,11,10,9,8.5].
   - Card "Hours worked" / "Last 10 working days" (TrendingUp), col-span 8: AreaTrend series `hours` "Hours worked"; labels "24 Sep","25 Sep","26 Sep","29 Sep","30 Sep","01 Oct","02 Oct","03 Oct","05 Oct","06 Oct"; values 8.0, 8.2, 7.9, 8.3, 8.1, 0, 8.1, 7.6, 8.1, 8.1.
   - Card "Attendance pattern" / "Hours per day · 8 weeks" (CalendarCheck), col-span 4: HeatGrid xLabels Mon..Fri, yLabels W1..W8, 8x5 hours (0, 7 or 8).
   - Card "Leave taken" / "By type · this year" (Umbrella), col-span 4: DonutStat Annual 6.5, Medical (MC) 2, Emergency 1, Replacement 1; centre = sum (10.5) / "days taken".
   - Card "Recent clock-ins" / "Clock-in and clock-out history" (Clock), flush, col-span 8: Table columns `Date`, `Clock In`, `Clock Out`, `Hours`, `Status`. 7 rows: date "07 Oct 2026" style (today row has a LiveDot), clock times "08:59"/"—", hours "8.1"/"—"/"0.0", status pill Present (emerald) / Late (amber, plus AlarmClock icon beside clock-in) / Absent (red). Footer bar: left "October 2026 · 142.5h of 176h", right Timer icon "81% of target".
3. Data mapping:
   - Days present "18 of 19": `listAttendance(monthStart, today)` filtered to the employee; present+late count. "of 19" = expected workdays so far (weekdays via `isWeekday`, minus `listPublicHolidays()`, minus on_leave) or count of non-leave rows. Sparkline: weekly/monthly counts derivable; the mock's 7 periods are unspecified.
   - Avg clock-in: from `AttendanceDay.clock_in` (timestamptz) -> needs a new Kuala Lumpur-time formatter (`dates.ts` has none). Delta "+2 min" has no target time in the DB (`hr_settings` has none) -> compare to previous month or drop.
   - Late count: `attendanceCounts(days).late`. Sparkline derivable by week/month.
   - Leave balance: `listLeaveBalances(year)` for the employee -> `leaveBalanceRows(...).remaining_days` (sum, or annual only; mock "8.5 days left" is unspecified). Sparkline of past balance: NO SOURCE (no history; only approximately reconstructable from approved request dates).
   - Hours worked: `listTimesheet(from,to)` `hours`, or `clock_out - clock_in` from attendance (mock values like 8.1 look like clock differences). Weekends skipped via `isWeekday`. In seed, today's row has no `clock_out`.
   - Attendance pattern heat grid: same source over 56 days with `weekStart(date)`; exactly the window the seed covers.
   - Leave taken by type: approved `listLeaveRequests()` for this employee, sum `days` by `leave_type` where `start_date` is in the year. No per-employee/year helper (`leaveDaysByType` is single-month but can be fed a pre-filtered array). Alternative: `listLeaveBalances(year)` `used_days` per type (only annual/medical/emergency exist in seed). MOCK CONTRADICTION: "Replacement" is not a `leave_type` (allowed: annual, medical, emergency, unpaid, maternity, paternity).
   - Recent clock-ins table: `work_date`, `clock_in`, `clock_out`, hours = diff, `status` ('present','late','absent','on_leave'). MOCK CONTRADICTIONS: mock has 3 statuses, DB has 4 (no "On leave" pill); mock lists 03 Oct 2026 which is a Saturday, while the DB only has weekday rows.
   - Footer "142.5h of 176h / 81% of target": hours MTD from timesheet; 176 = 22 workdays x 8 (convention; `hr_settings.work_week` is unread). Derivable only with a stated convention.
4. Write controls: "Clock In" (remove/disable).
5. Helpers: `attendanceCounts`, `leaveBalanceRows` (summaries.ts); `weekStart`, `isWeekday`, `addDays`, `formatDay` (dates.ts).
6. Imports: charts AreaTrend, DonutStat, HeatGrid, Sparkline, Series, Slice; Bento; ui LiveDot, Button, Table/TableBody/TableCell/TableHead/TableHeader/TableRow; `cn`. Server component, non-async. Local type `AttendanceStatus` shadows the one in `lib/people/types` (name clash only).

### A.4 my-goals  (`my-goals.tsx`; nav "My Goals", General; not gated)
1. Purpose/audience: the signed-in employee's own objectives (filter by `viewer.employeeId`; DB returns everyone's goals for HR/demo).
2. Widgets:
   - PageHeader "My Goals", subtitle "Your objectives this quarter, Saudara."; action Button "Add Goal" (Plus).
   - KPI "Goals" = 4, delta "this quarter", onPrimary, Sparkline [2,3,3,4,4,4].
   - KPI "On track" = 2, delta "healthy" (up), Sparkline [1,1,2,2,3,2].
   - KPI "At risk" = 1, delta "needs focus" (down), Sparkline [0,1,1,2,1,1].
   - KPI "Completion" = average progress (69%), delta "+6%" (up), Sparkline [48,52,58,61,65,69].
   - Card "Overall progress" / "Average across your goals" (Gauge), col-span 4: RadialGauge value=completion, valueLabel "{n}%", label "complete".
   - Card "Progress by goal" / "Completion per objective" (TrendingUp), col-span 8: BarGroup horizontal, series `progress` "Progress %", one bar per goal using a short label (Deals, CSAT, Referral, Cert).
   - Four goal cards (col-span 6 each): title; icon (CircleCheck if Done, AlertTriangle if At risk, else Target); card action StatusPill (On track emerald / At risk amber / Done sky); description paragraph; "Progress" + `{progress}%` + `Progress` bar; Flag icon + "Due {date}". Mock goals: "Close 20 enterprise deals" 65 On track due 31 Dec 2026; "Improve CSAT to 90%" 80 On track 31 Dec 2026; "Launch referral program" 30 At risk 30 Nov 2026; "Complete sales certification" 100 Done 15 Sep 2026.
3. Data mapping: `listGoals()` filtered to the employee: `title`, `progress` (0-100), `due_date` (nullable), `status` ('on_track','at_risk','done').
   - Goals / On track / At risk counts: `performanceSummary(goals, [], []).goals` (total, on_track, at_risk, done).
   - Completion %: mean of `progress` (no helper; the mock computes inline). Gauge same value.
   - Progress by goal: `title` as the label (mock `label` is a hand-made short name with no column; long titles need truncation).
   - Card description: NO SOURCE (`hr_goals` has no description column).
   - "this quarter": `hr_goals` has no period column (only `due_date`; `created_at` is not in the `Goal` type), so subtitle/delta wording must change.
   - All four KPI sparklines and the "+6%" delta: NO SOURCE (no progress history).
   - Due date: `formatDay` returns "31 Dec" with no year; mock shows the year.
4. Write controls: "Add Goal" (remove/disable).
5. Helpers: `performanceSummary` (summaries.ts) for counts only.
6. Imports: charts BarGroup, RadialGauge, Sparkline, Series; Bento; ui Button, Progress; `cn`. Server component, non-async. Local `StatusPill`. Seed: goals only for employees 1-10 (4 each = 40); the demo employee (1) gets progress 69, 92, 37, 62 -> on_track, on_track, at_risk, on_track (no 'done').

### A.5 my-documents  (`my-documents.tsx`; nav "My Documents", General; not gated)
1. Purpose/audience: the signed-in employee's own document library. Needs `hr_documents` (`personal`), which the seam does NOT read yet. In the demo workspace and for HR the DB returns everyone's rows, so filter by `viewer.employeeId`.
2. Widgets:
   - PageHeader "My Documents", subtitle "Your payslips, EA form, contract and letters, Saudara."; action Button outline sm "Upload" (Upload icon).
   - KPI "Documents" = 10, delta "on file", onPrimary, Sparkline [4,5,6,7,9,10].
   - KPI "Pending signature" = 2, delta "action needed" (down), Sparkline [0,1,0,1,2,2].
   - KPI "Expiring soon" = 1, delta "within 90 days" (down), Sparkline [0,0,1,1,1,1].
   - KPI "Payslips" = 3, delta "last 3 months", Sparkline [1,1,2,2,3,3].
   - Card "By type" / "Your document library" (PieChart), col-span 4: DonutStat Payslips, Letters, Contracts, Tax forms, Benefits (zero slices dropped), centre = total / "documents".
   - Card "All documents" / "Most recent first" (FileText), flush, col-span 8: Table columns `Document`, `Type`, `Date`, `Status`, `Action`. Document cell: icon (FileSignature if pending signature else FileText) + name + LiveDot when pending. Type text (Payslip, Contract, Letter, Tax, Benefits). Date text ("03 Oct 2026", or "Expires 31 Dec 2026" for the expiring one). Status pill Signed (emerald) / Pending signature (amber) / Available (sky) / Expiring (red). Action: ghost Button "PDF" (Download icon). Mock also has a `size` field ("128 KB") that is never rendered. 10 mock rows (Updated NDA Agreement, Salary Increment Letter 2026, PCB / MTD Statement 2026, Payslip — Sep/Aug/Jul 2026, Medical Card (AIA), EA Form 2025, Confirmation Letter, Employment Contract).
   - Footer bar: left `{n} documents · {m} payslips`, right CalendarClock icon `{k} awaiting your signature`.
3. Data mapping (all from `hr_documents`: `title`, `doc_type` in payslip/contract/letter/tax/benefits, `status` in signed/pending_signature/available/expiring, `issued_on`, `expires_on`; no `PeopleData` method yet, a new `listDocuments()` is needed):
   - Documents/By type/footer counts: row counts per `doc_type`. Pending signature: `status='pending_signature'`. Expiring soon: `expires_on` within 90 days (or `status='expiring'`; seed sets both for the medical card, expires in 25 days). Payslips: count `doc_type='payslip'`.
   - Alternative source for payslip rows: `listPayslips()` (own) has real `period_month`, `net_cents`, `status`; the seed documents duplicate that with 3 payslip documents.
   - Sparklines: cumulative counts by `issued_on` are derivable for "Documents" and "Payslips"; "Pending signature" and "Expiring soon" history is NO SOURCE.
   - Column `size` and the "PDF" download: NO SOURCE (migration comment: "Documents and letters are records only: no file is stored yet").
   - Date column: `issued_on` (nullable) or `Expires {expires_on}` for expiring items. Needs a year-aware formatter (`formatDay` drops the year).
   - Status pill: DB has the same four states as the mock (labels differ: `pending_signature` -> "Pending signature").
4. Write controls: "Upload" (remove/disable); per-row "PDF" download (no file exists: remove or disable); no sign action is present.
5. Helpers: none.
6. Imports: charts DonutStat, Sparkline, Slice; Bento; ui LiveDot, Button, Table parts; `cn`. Server component, non-async. Local `StatusPill`.

### A.6 records  (`records.tsx`; nav "Records", General; not gated; page title "My Records")
1. Purpose/audience: the signed-in employee's own HR record. Reads `hr_employees` (shared) + `hr_employee_private` (`personal`: HR, the employee, or any member of the demo org). Uses `viewer.employeeId`; if null (member not linked) show a "not linked" note as `assistant.tsx` does (`notLinked`).
2. Widgets:
   - PageHeader "My Records", subtitle "Your employment, statutory and personal details, Saudara.", badge `Badge secondary` "Active".
   - KPI "Tenure" = "7 yrs", delta "since 2019", onPrimary.
   - KPI "Leave balance" = "8.5", delta "days left".
   - KPI "Department" = "Mgmt", delta "Founder".
   - KPI "Employment" = "Full-time", delta "Permanent" (up).
   - Five key/value cards (label left, value right):
     - "Personal" / "Your personal details" (User), col-span 6: Full name, NRIC, Date of birth, Email, Phone.
     - "Employment" / "Your role at Rimba Ventures" (Briefcase), col-span 6: Employee no, Department, Designation, Join date, Type, Status.
     - "Statutory" / "EPF · SOCSO · EIS · PCB" (ShieldCheck), col-span 6: EPF / KWSP no, SOCSO / PERKESO no, EIS / SIP ("Active (auto)"), Income tax no (PCB/MTD), Tax resident ("Yes").
     - "Emergency Contact" / "Who we call first" (Contact), col-span 3: Name, Relationship ("Spouse"), Phone.
     - "Bank Details" / "For payroll credit" (Landmark), col-span 3: Bank, Account ("****4321").
3. Data mapping:
   - Full name, Employee no, Department, Designation, Join date, Type, Status, Email: `Employee` (`name`,`employee_no`,`department_name`,`designation`,`join_date`,`employment_type` via `EMPLOYMENT_LABEL` in employees.ts,`status`,`work_email`) from `listEmployees()` filtered to `viewer.employeeId`.
   - NRIC, Date of birth, Phone, EPF no, SOCSO no, Income tax no, Emergency name/phone, Bank, Account: `getEmployeePrivate(employeeId)` fields `nric`,`date_of_birth`,`phone`,`epf_no`,`socso_no`,`tax_no`,`emergency_contact_name`,`emergency_contact_phone`,`bank_name`,`bank_account` (mask to last 4 for "****4321": derive).
   - Tenure "7 yrs / since 2019": from `join_date` (the per-employee days-since calculation lives inside `buildEmployeesModel`, not exported; `daysBetween` is). Leave balance: `listLeaveBalances(year)` + `leaveBalanceRows` for this employee. Department KPI "Mgmt" is an abbreviation of the department name; delta "Founder" = `designation`. Employment KPI "Full-time" = `EMPLOYMENT_LABEL[employment_type]`.
   - NO SOURCE: "EIS / SIP" status, "Tax resident", emergency-contact "Relationship", and the delta "Permanent" (DB has `employment_type` full_time/part_time/contract/intern but no permanent/fixed-term flag).
   - Mock contradiction: the mock's SOCSO number repeats the NRIC; DB has a separate `socso_no`.
4. Write controls: none (read-only already).
5. Helpers: `EMPLOYMENT_LABEL` (employees.ts), `leaveBalanceRows` (summaries.ts), `daysBetween`, `formatDay` (dates.ts).
6. Imports: Bento (Grid/Card/Stat); ui Badge; lucide `LucideIcon` type; ScreenContainer, PageHeader (uses its `badge` prop). Server component, non-async. No charts. Simplest of the 25.

### A.7 leave  (`leave.tsx`; nav "Applications > Leave", not gated)
1. Purpose/audience: the signed-in employee's own leave: balances and requests (`hr_leave_requests`, `hr_leave_balances` are `personal`; filter by `viewer.employeeId` because HR/demo see everyone's).
2. Widgets:
   - PageHeader (className mb-3) "Leave", subtitle "Apply for leave and track your balance, Saudara."; action Button "Apply Leave" (Plus).
   - KPI "Annual balance" = 12, delta "of 16 days", onPrimary, Sparkline [16,15,14,14,13,13,12,12].
   - KPI "Used (YTD)" = 13, delta "days", Sparkline [2,4,5,7,9,11,12,13].
   - KPI "Pending" = 1, delta "request", Sparkline [0,1,0,2,1,0,1,1].
   - KPI "MC taken" = 6, delta "of 14 days", Sparkline [1,1,2,3,4,5,5,6].
   - Card "Leave used by type" / "This year · days taken" (PieChart), col-span 5: DonutStat Annual 4, Medical (MC) 6, Unpaid 2, Emergency 1; centre "13" / "days taken".
   - Card "Entitlement used" / "Statutory leave, per EA 1955" (Scale), col-span 7: list Annual 4 / 16 days, Medical (MC) 6 / 14 days, Emergency 1 / 3 days, each with `Progress` (taken/total %); footnote "Unpaid leave: 2 days · Carry-forward: 3 days".
   - Card "My Requests" / "Leave applications and their status" (ClipboardList), flush, col-span 12: Table columns `Type`, `From`, `To`, `Days`, `Status`, `Applied` (const COLUMNS). Rows: type text, from/to "20 Oct", days, LiveDot (active when Pending) + status pill Approved/Pending/Rejected, applied "06 Oct". 7 mock rows (ids LV-0104.. are keys only, not shown).
3. Data mapping:
   - Annual balance: `listLeaveBalances(year)` row `leave_type='annual'`: `entitled_days - used_days` (via `leaveBalanceRows().remaining_days`); delta "of 16 days" = `entitled_days`. Sparkline NO SOURCE (balance history not stored; approximately reconstructable from approved request dates).
   - Used (YTD): sum of approved `days` in the year from `listLeaveRequests()` (includes unpaid, which has no balance row) or sum of balances' `used_days` (annual/medical/emergency only in seed). They differ when unpaid exists.
   - Pending: count `status='pending'`. MC taken: medical `used_days` of `entitled_days`.
   - Leave used by type: per-type sum of approved `days` this year (same caveat as A.3; "Replacement" not in this mock, good). Unpaid is in the mock donut but has no `hr_leave_balances` row in the seed.
   - Entitlement used: `leaveBalanceRows()` for annual/medical/emergency.
   - Footnote "Carry-forward: 3 days": NO SOURCE (no column). "Unpaid leave: 2 days": derivable from requests.
   - Table: `leave_type` (-> `leaveLabel`), `start_date`, `end_date`, `days`, `status` (DB also allows 'cancelled': mock pill lacks it), `created_at` (Applied; convert to a Malaysia date via `todayInMalaysia(new Date(created_at))`).
   - All four KPI sparklines: derivable only as cumulative curves from request dates; "Pending" history NO SOURCE.
4. Write controls: "Apply Leave" (remove/disable).
5. Helpers: `leaveLabel`, `leaveDaysByType` (month only), `onLeaveOn` (overview.ts); `leaveBalanceRows` (summaries.ts); `formatDay`.
6. Imports: charts DonutStat, Sparkline, Slice; Bento; ui LiveDot, Button, Progress, Table parts; `cn`. Server component, non-async. Local `StatusPill`.

### A.8 time-off  (`time-off.tsx`; nav "Applications > Time-Off", not gated)
1. Purpose/audience: the signed-in employee's own short time-off requests (`hr_time_off_requests`, `personal`; filter by `viewer.employeeId`).
2. Widgets:
   - PageHeader (mb-3) "Time-Off", subtitle "Short-duration time-off requests for your day, Saudara."; action Button "Request Time-Off" (Plus).
   - KPI "This month" = 3, delta "requests", onPrimary, Sparkline [1,2,1,3,2,2,3,3].
   - KPI "Approved" = 2, delta "this month" (up), Sparkline [1,1,1,2,1,2,2,2].
   - KPI "Pending" = 1, delta "request", Sparkline [0,1,0,1,1,0,1,1].
   - KPI "Hours" = 6.5, delta "this month", Sparkline [2,4,3,5,6,5,6,6.5].
   - Card "Time-off by reason" / "This month · hours" (PieChart), col-span 5: DonutStat Clinic 2.0, Bank 2.0, Personal 1.5, Errands 1.0; centre "6.5h" / "this month".
   - Card "By reason" / "Where your hours went" (ListChecks), col-span 7: rows label (Clinic, Bank, Personal, "Errands (JPJ)"), "N request(s)", hours ("2.0h").
   - Card "My Requests" / "Time-off requests and their status" (ClipboardList), flush, col-span 12: Table columns `Date`, `From`, `To`, `Duration`, `Reason`, `Status`. 6 mock rows.
3. Data mapping: `listTimeOffRequests()` filtered to employee: `off_date`, `start_time`/`end_time` (`HH:MM:SS`; `.slice(0,5)` as `pendingApprovals` does), `reason` (free text, nullable), `status`, `created_at`.
   - This month / Approved / Pending counts: derivable (by `off_date` month or `created_at`). Hours: sum of `end_time - start_time` (no helper; parse HH:MM). Sparklines: NO SOURCE for the mock's 8 periods; per-month counts are derivable.
   - Time-off by reason and By reason list: NO SOURCE for categories ("Clinic","Bank","Personal","Errands"): `reason` is free text (seed: 'Bank appointment','School event','Clinic follow-up','JPJ appointment','Car service'). Only grouping by raw text is possible, or drop both cards.
   - Mock does not reconcile with itself: 3 requests "this month" but only two October rows in the table; hours 6.5 includes September rows.
   - Seed: 6 time-off rows in total; the demo employee (1) has 2, both approved, none pending.
4. Write controls: "Request Time-Off" (remove/disable).
5. Helpers: `formatDay`; time-range formatting pattern inside `pendingApprovals` (not exported separately).
6. Imports: charts DonutStat, Sparkline, Slice; Bento; ui LiveDot, Button, Table parts; `cn`. Server component, non-async. Local `StatusPill`.

### A.9 claims  (`claims.tsx`; nav "Applications > Financial Claims", not gated; page title "Financial Claims")
1. Purpose/audience: the signed-in employee's own expense claims (`hr_claims`, `personal`; filter by `viewer.employeeId`).
2. Widgets:
   - PageHeader (mb-3) "Financial Claims", subtitle "Submit and track your expense claims, Saudara."; action Button "New Claim" (Plus).
   - KPI "Claimed (MTD)" = "RM 1,240", delta "+RM 320" (up), onPrimary, Sparkline [640,720,810,900,1000,1080,1180,1240].
   - KPI "Approved" = "RM 980", delta "+9%" (up), Sparkline [520..980].
   - KPI "Pending" = "RM 260", delta "1 claim", Sparkline [0,120,80,200,160,120,200,260].
   - KPI "Reimbursed" = "RM 820", delta "paid out", Sparkline [400..820].
   - Card "Claims by category" / "This month · RM" (PieChart), col-span 5: DonutStat Travel 420, Meals 240, Equipment 260, Accommodation 260, Parking 60; centre "RM 1,240" / "claimed".
   - Card "Spend by category" / "Share of claims this month" (Wallet), col-span 7: list label + "RM n" + `Progress` (value/total %).
   - Card "My Requests" / "Expense claims and their status" (Receipt), flush, col-span 12: Table columns `Category`, `Amount`, `Date`, `Receipt` ("Attached" or "—"), `Status` (LiveDot + pill). 6 mock rows ("RM 260", "05 Oct"...).
3. Data mapping: `listClaims()` filtered to employee: `category` (-> `claimLabel` gives 'Travel claim' etc.; the screen shows bare 'Travel'), `amount_cents` (`rm()` from `@/lib/reach/format`), `claim_date`, `has_receipt`, `status`, `description`.
   - Claimed MTD: sum `amount_cents` where `claim_date` in month, excluding cancelled (definition needed). Approved/Pending: filter by `status`. "Pending 1 claim": count.
   - Reimbursed "paid out": NO SOURCE (claims have no paid state; `hr_payment_vouchers` 'Claim reimbursement' rows are HR-only and match by payee name, not claim id).
   - Sparklines and "+RM 320", "+9%" deltas: NO SOURCE as history (derivable only as month-over-month sums by `claim_date`).
   - Category donut and list: sums by `category`. MOCK CONTRADICTION: "Accommodation" and "Parking" are not valid `category` values (allowed: medical, travel, meals, equipment, other); "Medical" and "Other" exist in the DB but not in the mock.
   - Seed: 12 claims; the demo employee (1) has 4 (travel 320, meals 86, medical 150 approved; equipment 684 rejected), none pending; pending claims belong to employees 2 and 4.
4. Write controls: "New Claim" (remove/disable).
5. Helpers: `claimLabel` (overview.ts); `rm` (lib/reach/format).
6. Imports: charts DonutStat, Sparkline, Slice; Bento; ui LiveDot, Button, Progress, Table parts; `cn`. Server component, non-async. Local `StatusPill`.

### A.10 ot-claims  (`ot-claims.tsx`; nav "Applications > OT Claims", not gated)
1. Purpose/audience: the signed-in employee's own overtime claims. One of three views of `hr_overtime_records` (`personal`); filter by `viewer.employeeId`.
2. Widgets:
   - PageHeader (mb-3) "OT Claims", subtitle "Claim your overtime hours, Saudara."; action Button "Claim OT" (Plus).
   - KPI "OT hours (MTD)" = 12, delta "hours", onPrimary, Sparkline [6,8,10,7,9,14,12].
   - KPI "OT pay (MTD)" = "RM 520", delta "+14%" (up), Sparkline [260,340,420,300,380,560,520].
   - KPI "Pending" = 4, delta "hours", Sparkline [2,0,3,1,2,4,4].
   - KPI "Approved" = 8, delta "hours MTD" (up), Sparkline [4,6,7,6,7,10,8].
   - Card "OT by month" / "Hours logged · cap 104 h/month" (BarChart3), col-span 8: BarGroup series `hours` "OT hours", Apr 6, May 8, Jun 10, Jul 7, Aug 9, Sep 14, Oct 12 (height 230).
   - Card "By rate" / "Per EA 1955 multipliers" (Clock), col-span 4: rows "Normal day (1.5x)" 8h RM 320, "Rest day (2.0x)" 6h RM 310, "Public holiday (3.0x)" 5h RM 420.
   - Card "My Requests" / "Overtime claims and their status" (ClipboardList), flush, col-span 12: Table columns `Date`, `Hours`, `Rate` ("2.0x"), `Amount` ("RM 200"), `Status`. 6 mock rows.
3. Data mapping: `listOvertime()` filtered to employee: `work_date`, `hours`, `rate_multiplier`, `amount_cents`, `status`.
   - OT hours / pay MTD, Pending hours, Approved hours: sums by `status` and `work_date` month. Sparklines: monthly sums derivable, but the mock plots 7 periods.
   - OT by month (Apr..Oct): sums of `hours` by `work_date` month. SEED CAVEAT: oldest seed row is 37 days back, so only 2-3 months have data.
   - "cap 104 h/month": static legal constant, no column (`hr_settings.overtime_rates` holds multipliers only).
   - By rate: group by `rate_multiplier` (1.5, 2.0, 3.0). The labels "Normal day / Rest day / Public holiday" correspond to `hr_settings.overtime_rates` keys weekday/rest_day/public_holiday (unread table) or constants; hours and amount per multiplier are derivable. Seed uses only 1.5 and 2.0.
   - "+14%": derivable month over month.
4. Write controls: "Claim OT" (remove/disable).
5. Helpers: none for overtime exist; `rm`, `formatDay`.
6. Imports: charts BarGroup, Sparkline, Series; Bento; ui LiveDot, Button, Table parts; `cn`. Server component, non-async.

### A.11 approve-leave  (`approve-leave.tsx`; nav "Approvals > Leave", `needs: 'approve'` = HR only)
1. Purpose/audience: HR approval queue for leave across the team. HR (owner/admin) sees every row; nav hides it from non-HR, but a direct URL visit by a non-HR member returns only their own rows, so gate with `viewer.isHr || viewer.isDemo`.
2. Widgets:
   - PageHeader (mb-3) "Leave Approvals", subtitle "Pending leave requests from your team, Saudara."; actions: `Select` (default `30d`; "Last 7 days", "Last 30 days", "Last 90 days"; w-36) and Button outline "Export".
   - KPI "Pending" = count of Pending rows (5), delta "awaiting", onPrimary, Sparkline [8,6,7,5,6,4,6,5].
   - KPI "Approved this month" = "23", delta "+4" (up), Sparkline [14..23].
   - KPI "Rejected" = "2", delta "+1" (down), Sparkline [1,0,2,1,1,0,1,2].
   - KPI "Avg turnaround" = "1.4d", delta "−0.3d" (up), Sparkline [1.9..1.4].
   - Card "Leave requests over time" / "Submitted vs approved · last 8 weeks" (TrendingUp), col-span 8: AreaTrend showLegend height 220, series `submitted` "Submitted", `approved` "Approved"; Wk1..Wk8.
   - Card "Pending by type" / "Current queue" (Layers), col-span 4: horizontal bars (custom `TypeBreakdown`): Annual 11, Medical (MC) 6, Emergency 3, Unpaid 2.
   - Card "Leave requests" / "Most recent first" (ListChecks), card action Button outline "Calendar" (CalendarClock), flush, col-span 12: Table columns `Employee` (avatar initial + name), `Type`, `From–To` ("13–14 Oct"), `Days` (right), `Status` (LiveDot + pill), `Action` (Approve / Reject for Pending rows, "—" otherwise). 8 mock rows.
3. Data mapping (`listLeaveRequests()`, team-wide):
   - Pending: `pendingApprovals(...)` filtered `kind==='leave'` or `approvalCounts(...).leave`.
   - Approved this month / Rejected: counts by `status` (month by `start_date` or `created_at`; `decided_at` exists in the DB but is NOT in `LeaveRequest` nor in `LEAVE_COLUMNS`). Deltas derivable month over month.
   - Avg turnaround: NO SOURCE through the seam. `decided_at` and `created_at` exist in `hr_leave_requests` but `decided_at` is not read; also the demo seed sets `decided_at` to a fixed `now() - 3 days` regardless of `created_at`, so turnaround would be negative or meaningless for several rows. Sparkline likewise.
   - Over time (8 weeks): submitted per ISO week from `created_at` (`weekStart`); "approved" can only be "currently approved among those submitted that week" (no decision date). Seed `created_at` runs back 110 days, so some weeks are empty.
   - Pending by type: group pending rows by `leave_type` (`leaveLabel`).
   - Table: `employee_name`, `leave_type`, `start_date`/`end_date` (`dayRange` is private in overview.ts; `formatDay` is public), `days`, `status` (+ 'cancelled' not in mock). Newest first = `created_at desc` which the provider already returns.
   - MOCK CONTRADICTION: employee names "Hafiz Omar" and "Wan Azlan" do not exist in the sample company ("Hafiz Osman" does; "Wan Azlan" does not).
   - Seed: 3 pending leave requests (employees 1, 11, 9); approved 13; rejected 1.
4. Write controls: per-row "Approve" and "Reject" buttons (must be removed or disabled); "Export"; "Calendar" button (no target; remove); the period `Select` (non-functional).
5. Helpers: `pendingApprovals`, `approvalCounts`, `leaveLabel`, `approvalsHeading` (overview.ts).
6. Imports: charts AreaTrend, Sparkline, Series; Bento; ui LiveDot, Button, Select parts, Table parts; `cn`. Server component, non-async. Local components `StatusPill`, `EmployeeCell`, `ApprovalActions`, `TypeBreakdown`.

### A.12 approve-claims  (`approve-claims.tsx`; nav "Approvals > Financial Claims", HR only)
Same skeleton as A.11 (see section C). Differences:
1. Audience: HR queue of expense claims.
2. Widgets:
   - PageHeader "Claim Approvals", subtitle "Pending expense claims awaiting your sign-off, Saudara."; same Select (`30d`) and "Export".
   - KPI "Pending" = Pending rows (5), delta "RM 890", Sparkline [6,5,7,4,6,5,6,5]. KPI "Approved (MTD)" = "RM 6,420", delta "+12%", Sparkline [3.2..6.4]. KPI "Rejected" = "2", delta "RM 240", Sparkline [1,0,1,2,1,1,0,2]. KPI "Avg turnaround" = "0.9d", delta "−0.2d", Sparkline [1.4..0.9].
   - Card "Claim value over time" / "Submitted vs approved · last 8 weeks" (TrendingUp): AreaTrend showLegend; series `submitted` "Submitted (RM k)", `approved` "Approved (RM k)" (values 1.5-2.9).
   - Card "Pending by category" / "Current queue (RM)" (Layers): bars Travel RM 520, Equipment RM 260, Meals RM 90, Parking RM 20.
   - Card "Expense claims" / "Most recent first" (Receipt), card action Button outline "Batch pay" (Wallet): Table columns `Employee`, `Category`, `Amount (RM)` (right), `Date`, `Status`, `Action`.
3. Data mapping: `listClaims()` (all rows for HR): `employee_name`, `category`, `amount_cents`, `claim_date`, `status`, `has_receipt`, `description`. Pending delta "RM 890" = sum pending `amount_cents`. Over-time chart: sum `amount_cents` per week of `created_at`/`claim_date`, "approved" = currently approved (no decision date). Turnaround: NO SOURCE (as A.11). Pending by category: group pending by `category`. Mock categories 'Parking' invalid (see A.9); Rejected delta "RM 240" = sum of rejected cents. Seed: 2 pending claims (employees 2 and 4, RM 240 + RM 180 = RM 420), 8 approved, 2 rejected.
4. Write controls: per-row Approve/Reject, "Export", "Batch pay" (a payment action: remove), period Select.
5. Helpers: `pendingApprovals`/`approvalCounts` (kind 'claim'), `claimLabel`, `rm`.
6. Imports: as A.11 plus lucide Receipt, Wallet; same local components (`CategoryBreakdown` instead of `TypeBreakdown`). Server component.

### A.13 approve-overtime  (`approve-overtime.tsx`; nav "Approvals > Overtime", HR only)
Same skeleton as A.11. Differences:
1. Audience: HR queue of overtime records.
2. Widgets:
   - PageHeader "Overtime Approvals", subtitle "Pending overtime claims from your team, Saudara."; Select (`30d`) + "Export".
   - KPI "Pending" = Pending rows (4), delta "14 hrs", Sparkline [5,4,6,3,5,4,5,4]. KPI "Approved (MTD)" = "86 hrs", delta "+9%", Sparkline [58..86]. KPI "Rejected" = "1", delta "2 hrs", Sparkline [0,1,0,1,2,1,0,1]. KPI "Avg turnaround" = "0.6d", delta "−0.1d", Sparkline [0.9..0.6].
   - Card "Overtime hours over time" / "Submitted vs approved · last 8 weeks": AreaTrend showLegend; series `submitted` "Submitted (hrs)", `approved` "Approved (hrs)" (values 14-26).
   - Card "Pending by department" / "Current queue (hrs)" (Layers): bars Ops 14 hrs, Sales 8 hrs, Finance 5 hrs, Marketing 3 hrs.
   - Card "Overtime claims" / "Most recent first" (Timer), card action Button outline "Timesheets" (Clock): Table columns `Employee`, `Date`, `Hours` (right), `Amount (RM)` (right), `Status`, `Action`.
3. Data mapping: `listOvertime()` all rows: `employee_name`, `work_date`, `hours`, `amount_cents`, `rate_multiplier`, `status`. Pending by department: needs the employee's department, which `OvertimeRecord` lacks; join through `listEmployees()` (`employee_id` -> `department_name`) (mock "Ops" is an abbreviation). Pending delta "14 hrs" = sum of pending `hours`. Turnaround NO SOURCE. Seed: exactly 1 pending overtime record (Ahmad Zaki, 4 h) so "Pending by department" has one bar; approved 9, rejected 1.
4. Write controls: per-row Approve/Reject, "Export", "Timesheets" (link-like button with no target: remove), Select.
5. Helpers: `pendingApprovals`/`approvalCounts` (kind 'overtime'), `headcountByDepartment` does not apply; `timesheetByEmployee` (summaries.ts) not needed.
6. Imports: as A.11 plus lucide Clock, Timer. Local `DeptBreakdown`. Server component.

### A.14 approve-time-off  (`approve-time-off.tsx`; nav "Approvals > Time-Off", HR only)
Same skeleton as A.11. Differences:
1. Audience: HR queue of short time-off requests.
2. Widgets:
   - PageHeader "Time-Off Approvals", subtitle "Pending short time-off requests from your team, Saudara."; Select (`30d`) + "Export".
   - KPI "Pending" = Pending rows (4), delta "5.5 hrs", Sparkline [6,5,4,5,3,4,5,4]. KPI "Approved this month" = "14", delta "+3", Sparkline [8..14]. KPI "Rejected" = "1", delta "+1", Sparkline [0,1,0,1,0,1,0,1]. KPI "Avg turnaround" = "0.5d", delta "−0.1d", Sparkline [0.8..0.5].
   - Card "Time-off requests over time" / "Submitted vs approved · last 8 weeks": AreaTrend showLegend; series `submitted` "Submitted", `approved` "Approved".
   - Card "Pending by reason" / "Current queue" (Layers): bars Personal 2, Clinic 1, Bank 1.
   - Card "Time-off requests" / "Most recent first" (Hourglass), card action Button outline "Calendar" (CalendarClock): Table columns `Employee`, `Date`, `Duration`, `Reason`, `Status`, `Action`.
3. Data mapping: `listTimeOffRequests()` all rows: `employee_name`, `off_date`, `start_time`/`end_time` (Duration = difference, formatted like "1.5h"; no helper), `reason` (free text), `status`. "Pending by reason": NO SOURCE for categories (free text; group by raw text only). Pending delta "5.5 hrs" = sum durations. Turnaround NO SOURCE. Seed: ZERO pending time-off requests (4 approved, 1 rejected, plus 1 approved in the future), so this screen shows an empty queue in the demo.
4. Write controls: per-row Approve/Reject, "Export", "Calendar", Select.
5. Helpers: `pendingApprovals`/`approvalCounts` (kind 'time_off').
6. Imports: as A.11 plus lucide Hourglass. Local `ReasonBreakdown`. Server component.

### A.15 public-holidays  (`public-holidays.tsx`; nav "Approvals > Public Holidays", not gated; excluded from PEOPLE_PATHS)
1. Purpose/audience: the workspace holiday calendar, same rows for every member (`hr_public_holidays` is `shared`).
2. Widgets:
   - PageHeader (mb-3) "Public Holidays", subtitle "Malaysian public holidays · calendar year 2026, Saudara."; actions: `Select` (default `2026`; options 2025, 2026, 2027; w-28) and Button "Add Holiday" (Plus).
   - KPI "Total holidays" = 20, delta "2026", onPrimary. KPI "Upcoming" = 4, delta "rest of 2026". KPI "This month" = "1" (hard-coded string), delta "October" (hard-coded). KPI "National" = 15, delta `${STATE} state` (5 state).
   - Card "By type" / "National vs state" (PieChart), col-span 4: DonutStat National (chart-1) vs State (chart-3), centre total / "holidays".
   - Card "Coming up" / "Holidays still ahead this year" (Sparkles), col-span 8: list of LiveDot (active) + date ("10 Oct") + name + Badge (type) for each upcoming holiday (4 in mock).
   - Card "2026 holiday calendar" / "Pulsing dot marks holidays still ahead" (CalendarDays), flush, col-span 12: Table columns (blank, w-10: LiveDot active when upcoming), `Date`, `Holiday`, `Type` (Badge), `States`, `Day`. 20 mock rows, e.g. "01 Jan | New Year's Day | National | Nationwide | Thu".
3. Data mapping: `listPublicHolidays()` rows `name`, `holiday_date`, `scope` ('national'|'state'), `state` (single nullable text).
   - Total / National / State / By type: counts of `scope` for the selected year (derive year from `holiday_date`).
   - Upcoming + "Coming up" + LiveDot: `holiday_date >= todayInMalaysia(now)`. This month: `holiday_date` in current month (mock hard-codes "1"/"October": derive and use `monthLabel`).
   - Day (Mon..Sun): derive from the date (no weekday helper in dates.ts; `weekStart`/`isWeekday` use `getUTCDay` internally). Date column: `formatDay`.
   - States column: only a single `state` per row, "Nationwide" for national rows. MOCK CONTRADICTION: the mock lists several states per holiday ("KL, Selangor, Penang, ..."), the table cannot hold that (a multi-state holiday would be several rows; unique key is `(org_id, holiday_date, name)`).
   - Year Select: filter by year in a search param; it is not a write. Seed only has the current year, so 2025/2027 would be empty.
   - Seed content: 6 rows (see D): New Year's Day (state, Kuala Lumpur), Federal Territory Day (state, Kuala Lumpur), Labour Day, National Day, Malaysia Day, Christmas Day. The mock's 20 rows (Hari Raya, Thaipusam, Deepavali ...) are NOT in the seed because movable holidays are omitted. The seed marks New Year's Day as a KL "state" holiday while the mock calls it National.
4. Write controls: "Add Holiday" (remove/disable).
5. Helpers: `formatDay`, `todayInMalaysia`, `monthLabel`.
6. Imports: charts DonutStat, Slice; Bento; ui LiveDot, Button, Badge, Select parts, Table parts. Server component, non-async. No sparklines.

### A.16 letters  (`letters.tsx`; nav "Approvals > Letters", not gated; page title "HR Letters")
1. Purpose/audience: HR letters to employees. Needs `hr_letters` (`personal`), which the seam does NOT read yet. HR sees all; a non-HR member would see only letters addressed to themselves, so team-style KPIs need `teamView`.
2. Widgets:
   - PageHeader (mb-3) "HR Letters", subtitle "Generate and manage employee letters, Saudara."; action Button "Generate Letter" (Plus).
   - KPI "Issued" = "96", delta "YTD", onPrimary. KPI "Drafts" = "5", delta "in progress". KPI "Templates" = "8", delta "active". KPI "Issued this month" = "8", delta "+3" (up). (No sparklines.)
   - Card "Letters by type" / "Issued YTD" (PieChart), col-span 5: DonutStat EA form 42, Offer 24, Confirmation 18, Reference 9, Warning 3; centre "96" / "issued".
   - Card "Letter templates" / "Most used" (LayoutTemplate), col-span 7: list LiveDot(active flag) + template name + "used N×": EA Form (CP8A) 42, Offer Letter 24, Confirmation Letter 18, Reference Letter 9, Salary Adjustment 6 (inactive), Warning Letter 3.
   - Card "Recent letters" / "Pulsing dot marks drafts in progress" (FileText), flush, col-span 12: Table columns `Letter`, `Employee` (avatar initial + name), `Type` (Badge secondary), `Date`, `Status` (LiveDot when Draft + pill Issued emerald / Draft amber), `Action` (two ghost icon buttons aria-label "View letter" and "Download letter"). 8 mock rows (one has employee "Confidential").
3. Data mapping (`hr_letters`: `letter_type` free text, `title`, `status` 'draft'|'issued', `issued_on` nullable, `employee_id`, `created_at`; a new `listLetters()` is needed, with employee name joined as `NAME` does elsewhere):
   - Issued YTD / Issued this month: count `status='issued'` with `issued_on` in year / month. Drafts: count `status='draft'`. "+3" delta derivable (month over month).
   - Letters by type: group issued rows by `letter_type`. `letter_type` is free text; seed values: Confirmation, Offer, Warning, Promotion, Contract renewal. The mock's "EA form" type is not a letter in the schema: EA forms are `hr_documents` (`doc_type='tax'`).
   - Templates card and "Templates 8 active": NO SOURCE (no template table).
   - Table: Letter = `title`; Employee = `employee_name`; Type = `letter_type`; Date = `issued_on`, or `created_at` for drafts (`issued_on` is null); Status = `status`.
   - "Confidential" employee display: the mock hides the name for warning letters; DB has no confidentiality flag (RLS already limits who sees a letter).
   - Seed: 5 letters (3 issued: employee 1 Confirmation 2 days ago, employee 13 Offer 330 days ago, employee 9 Promotion 120 days ago; 2 drafts: employee 10 Warning, employee 16 Contract renewal).
4. Write controls: "Generate Letter" (remove/disable). The per-row View and Download icon buttons have no backing (no file stored: "records only") -> remove or disable.
5. Helpers: none.
6. Imports: charts DonutStat, Slice; Bento; ui LiveDot, Button, Badge, Table parts; `cn`. Server component, non-async.

### A.17 timesheet  (`timesheet.tsx`; nav "Attendance > Timesheet", not gated)
1. Purpose/audience: team hours by day for one week plus 8-week trends. `hr_timesheet_entries` is `personal`: HR/demo see everyone, others only themselves (so team wording needs `teamView`).
2. Widgets:
   - PageHeader "Timesheet", subtitle "Team hours by day, Saudara."; actions: text "Week of 05–11 Oct 2026" + two ghost icon buttons (aria-labels "Previous week", "Next week").
   - KPI "Total hours" = "188.0", delta "+3.2%", onPrimary, Sparkline [176,181,184,179,188,185,190,188].
   - KPI "Billable" = "152h", delta "81%" (up), Sparkline [138..152].
   - KPI "Overtime" = "12h", delta "-1h" (up), Sparkline [8,10,9,14,11,13,12,12].
   - KPI "Avg / day" = "7.5h", delta "+0.1h" (up), Sparkline [7.0..7.5].
   - Card "Hours over time" / "Total vs billable · last 8 weeks" (TrendingUp), col-span 8: AreaTrend showLegend, series `total` "Total hours", `billable` "Billable", Wk1..Wk8.
   - Card "Hours by day" / "Team totals · last 6 weeks" (CalendarRange), col-span 4: HeatGrid xLabels Mon..Sun, yLabels W1..W6, team-total hours per weekday (weekends 0-10).
   - Card "Utilisation" / "Billable ÷ total this week" (Gauge), col-span 4: BentoStat "Billable share" = "81%", delta "+2%"; text "152h billable of 188.0h logged across 5 members."
   - Card "Pending approvals" / "Awaiting manager sign-off" (Hourglass), col-span 4: BentoStat "Timesheets" = "2", delta "due Fri"; text "Faiz Hakim and Lim Wei Jie have unsubmitted days this week."
   - Card "On the clock" / "Clocked in now" (Clock), col-span 4: BentoStat "Members" = "4 / 5", delta "live" (up); text "Faiz Hakim on a half day; the rest clocked in."
   - Card "Weekly timesheet" / "This week · hours logged per day" (CalendarRange), flush, col-span 12: Table columns `Employee` (avatar initial + name), `Mon`,`Tue`,`Wed`,`Thu`,`Fri` (right, hours with 1 decimal), `Billable` (right, weekly integer), `Total` (right, bold). 5 mock rows. Footer: left "{n} members", right "{b}h billable · {t} total".
3. Data mapping: `listTimesheet(fromDate,toDate)` rows `employee_id`, `work_date`, `hours`, `billable_hours`; names via `listEmployees()`.
   - Header week: `weekStart(todayInMalaysia(now))` .. +6 days with `formatDay`; the prev/next buttons need a search param (not a write) or must be disabled.
   - Total hours / Billable / Avg per day / Utilisation / footer: sums over the week (`timesheetByEmployee(entries, employees)` gives hours + billable_hours totals per employee, sorted by hours; per-day cells need a new pivot by `work_date`). Deltas: compare to the previous week (second `listTimesheet` call or one 8-week call).
   - Sparklines and "Hours over time": one `listTimesheet` over 56 days bucketed by `weekStart`; the seed covers exactly 8 weeks.
   - Hours by day heatmap: same data, bucket by week x weekday (weekend columns are always 0 in the data since entries exist only for present/late weekdays).
   - Overtime "12h, -1h": not in the timesheet; source `listOvertime()` (hours by `work_date` in week). Definition differs from the mock only in name.
   - Pending approvals (timesheets awaiting sign-off, "due Fri", names): NO SOURCE (no timesheet submission or approval state; "unsubmitted" could only be inferred from present attendance days with no entry, and in the seed there are none).
   - On the clock "4 / 5 live": derivable from `listAttendance(today,today)` where `clock_in` is set and `clock_out` is null (seed leaves `clock_out` null for today for everyone present). "Faiz on a half day" text: NO SOURCE.
   - Mock shows 5 members; the data has 20 (all employees), so the table rows and "across N members" text change.
4. Write controls: none that write. Prev/next week buttons are navigation without a target (wire to a search param or disable).
5. Helpers: `timesheetByEmployee` (summaries.ts); `weekStart`, `addDays`, `formatDay` (dates.ts).
6. Imports: charts AreaTrend, HeatGrid, Sparkline, Series; Bento; ui Button, Table parts. Server component, non-async. No `cn`/LiveDot.

### A.18 shift-calendar  (`shift-calendar.tsx`; nav "Attendance > Shift Calendar", not gated)
1. Purpose/audience: weekly shift roster. `hr_shifts` is `personal` (HR/demo see all; others only their own rows).
2. Widgets:
   - PageHeader "Shift Calendar", subtitle "Weekly shift schedule, Saudara."; actions: text "Week of 05–11 Oct 2026" + ghost icon buttons "Previous week", "Next week".
   - KPI "Shifts this week" = 25 (non-off cells), delta "+2", onPrimary, Sparkline [23,24,22,25,24,26,25,25].
   - KPI "Coverage" = "88%", delta "+1%" (up), Sparkline [82..88].
   - KPI "Open shifts" = 3, delta "-1" (up), Sparkline [6,5,7,4,5,3,4,3].
   - KPI "Night shifts" = "8", delta "0", Sparkline [7,8,7,9,8,8,9,8].
   - Card "Shift grid" / "Mon–Sun · 5 members" (CalendarDays), flush, col-span 12: Table columns `Employee`, `Mon`..`Sun`; cell = coloured tag: "Morning (9–5)", "Night (10–6)", "Off". 5 mock rows.
   - Card "Coverage by day" / "Staff on shift · morning vs night" (ChartColumn), col-span 8: BarGroup showLegend, series `morning` "Morning", `night` "Night" per Mon..Sun.
   - Card "Open & upcoming slots" / `${OPEN_COUNT} still to fill` (ShieldAlert), col-span 4: list LiveDot(filled) + slot ("Sun · Night") + role ("Ops on-call") + pill Filled/Open. 5 mock rows.
   - Card "Shift types" / "This roster" (Moon), col-span 6: three tags (Morning (9–5), Night (10–6), Off) and the text "Rest days follow Akta Kerja 1955 — one rest day per week per employee."
   - Card "On shift now" / "Currently clocked in" (Users), col-span 6: BentoStat "Members" = "3", delta "live"; text "Aisyah Rahim, Faiz Hakim and Nurul Huda on the morning shift."
3. Data mapping: `listShifts(weekStart, weekStart+6)` rows `employee_id`, `work_date`, `shift` ('morning'|'night'|'off'); names via `listEmployees()`.
   - Shift grid, Shifts this week (non-off), Night shifts (count 'night'), Coverage by day (counts per `work_date` and `shift`): all derivable. "9–5"/"10–6" times: NO SOURCE (DB stores only the three kinds; constants would have to be hard-coded or added to `hr_settings`).
   - Coverage % and Open shifts / Open & upcoming slots (role, unassigned): NO SOURCE (no required-headcount or open-slot table; `hr_shifts.employee_id` is NOT NULL so a slot cannot be unassigned).
   - Deltas and all sparklines: NO SOURCE as written; week-over-week counts are derivable from other weeks, but seed only has THIS week's roster (previous/next week navigation shows empty weeks).
   - On shift now: partially derivable (today's shift is morning/night AND `listAttendance(today,today)` has `clock_in` and no `clock_out`).
   - Static note on Akta Kerja 1955: constant text.
   - MOCK vs SEED CONTRADICTION: seed roster is the 5 Operations employees (Ahmad Zaki, Lim Wei Jie, Chong Wei Han, Zainab Yusof, Daniel Wong); mock rows are Aisyah (Sales), Faiz (Marketing), Ahmad Zaki, Nurul (Finance), Lim Wei Jie. Seed pattern is `(n+i) % 4`: 0 off, 1 night, else morning (so Operations: 1 in 4 cells is off, 1 in 4 night).
4. Write controls: none (prev/next week buttons are navigation only).
5. Helpers: `weekStart`, `addDays`, `formatDay`, `isWeekday` (dates.ts). No shift summary helper exists.
6. Imports: charts BarGroup, Sparkline, Series; Bento; ui LiveDot, Button, Table parts; `cn`. Server component, non-async.

### A.19 overtime  (`overtime.tsx`; nav "Attendance > Overtime", not gated)
1. Purpose/audience: team overtime hours and cost. One of three views of `hr_overtime_records` (`personal`): HR/demo see all; others only their own (guard team wording with `teamView`).
2. Widgets:
   - PageHeader "Overtime", subtitle "Overtime hours and cost, Saudara." (no actions).
   - KPI "OT hours (MTD)" = "84", delta "+13%", onPrimary, Sparkline [16,18,15,21,19,22,20,21].
   - KPI "OT cost" = "RM 3,360", delta "+RM 240" (tone down), Sparkline [620..840].
   - KPI "Employees w/ OT" = "6", delta "+1", Sparkline [4,5,4,6,5,6,6,6].
   - KPI "Pending approval" = "2h", delta "1 claim", Sparkline [3,2,4,1,2,2,1,2].
   - Card "OT hours by department" / "This month · weekday vs rest day" (ChartColumn), col-span 7: BarGroup stacked showLegend, series `weekday` "Weekday (1.5x)", `restday` "Rest day (2.0x)" for Ops, Sales, Marketing, Finance, HR.
   - Card "OT trend" / "Total hours · last 6 months" (TrendingUp), col-span 5: BarGroup series `hours` "OT hours", May 62 .. Oct 84.
   - Card "Rate policy" / "Akta Kerja 1955" (Clock), col-span 4: BentoStat "Normal day" = "1.5x"; text "Rest day 2.0x · public holiday 3.0x of the hourly rate of pay."
   - Card "Avg OT per employee" / "This month" (Users), col-span 4: BentoStat "Hours" = "14h", delta "within cap"; text "Below the 104-hour monthly statutory limit per employee."
   - Card "Awaiting sign-off" / "Pending claims" (Hourglass), col-span 4: BentoStat "Claims" = "1", delta "RM 80"; text "Siti Aminah — 2h weekday OT (1.5x) on 05 Oct."
   - Card "Overtime records" / "Recent claims across the team" (Wallet), flush, col-span 12: Table columns `Employee` (avatar + name), `Date`, `Hours` (right), `Rate`, `Amount` (right), `Status` (LiveDot when Pending + pill Approved/Pending). 6 mock rows.
3. Data mapping: `listOvertime()`: `employee_name`, `work_date`, `hours`, `rate_multiplier`, `amount_cents`, `status`.
   - OT hours MTD, OT cost, Employees w/ OT (distinct `employee_id` in the month), Pending approval hours and claim count, Avg OT per employee, Awaiting sign-off (first pending row), records table: all derivable. Sparklines/deltas: per-week or per-month sums; seed history is short (oldest row 37 days back).
   - OT by department: needs department -> join `listEmployees()` (`department_name`) by `employee_id`; split weekday vs rest day by `rate_multiplier` 1.5 vs 2.0 (public holiday 3.0 is absent from the mock chart). Mock label "HR" and "Ops" vs seed departments "Management" and "Operations".
   - OT trend: monthly sums of `hours`.
   - Rate policy tile: `hr_settings.overtime_rates` ({"weekday":1.5,"rest_day":2.0,"public_holiday":3.0}) is the natural source but `hr_settings` is `hr` (non-HR cannot read it) and unread by the seam; otherwise constants. 104-hour cap: constant, no column.
   - Records table has only Approved/Pending pills; DB also has 'rejected' and 'cancelled' (seed has 1 rejected).
   - Seed: 12 records, 1 pending (Ahmad Zaki, 4 h at 1.5x = RM 150), 1 rejected, 10 approved.
4. Write controls: none.
5. Helpers: `pendingApprovals`/`approvalCounts` (pending overtime), `headcountByDepartment` is not for this. `rm`, `formatDay`.
6. Imports: charts BarGroup, Sparkline, Series; Bento; ui LiveDot, Table parts; `cn`. Server component, non-async. No Button.

### A.20 payroll  (`payroll.tsx`; nav "Payroll > Payroll", `needs: 'approve'` = HR only)
1. Purpose/audience: HR payroll run review. `hr_payroll_runs` is `hr` (non-HR sees zero runs); `hr_payslips` is `personal` (non-HR sees only their own). Demo: everyone sees all.
2. Widgets:
   - PageHeader "Payroll", subtitle "Run and review monthly payroll · October 2026, Saudara."; action Button "Run Payroll".
   - KPI "Gross payroll" = "RM 96,400", delta "+4%", onPrimary, Sparkline [86,88,89,91,92,93.5,95,96.4].
   - KPI "Net pay" = "RM 82,060", delta "+3%" (up), Sparkline [73.5..82.1].
   - KPI "EPF / KWSP" = "RM 10,604", delta "+2%" (up), Sparkline [9.5..10.6].
   - KPI "Headcount paid" = "22 / 24", delta "+2" (up), Sparkline [20,21,21,22,22,23,23,22].
   - Card "Payroll cost over time" / "Gross vs net · last 8 months" (TrendingUp), col-span 8: AreaTrend showLegend, series `gross` "Gross (RM k)", `net` "Net (RM k)", Mar..Oct.
   - Card "Deductions breakdown" / "This run" (PieChart), col-span 4: DonutStat EPF / KWSP 10,604; PCB / MTD 2,320; SOCSO 1,180; EIS 236; centre "RM 14.3k" / "deductions".
   - Card "Payroll run" / "October 2026 · statutory deductions applied" (ReceiptText), card action Button outline "Export EA", flush, col-span 12: Table columns `Employee`, `Gross`, `EPF`, `SOCSO`, `EIS`, `PCB`, `Deductions`, `Net` (all right-aligned, whole ringgit like "RM 4,000"), `Status` (LiveDot active when Paid + pill Paid/Pending). 6 mock rows. Footer: Users icon "Showing 6 of 24 employees in this run".
3. Data mapping: `listPayrollRuns()` + `listPayslips()`; `payrollSummary(runs, payslips)` returns, newest first, per run: `period_month`, `status`, `headcount` (= payslip count), `gross_cents`, `deductions_cents`, `net_cents`.
   - Gross / Net KPIs, deltas and the 8-month cost chart + sparklines: `payrollSummary` (8 runs in the sample; reverse for chronological order). Convert cents to RM k.
   - EPF KPI, Deductions breakdown (EPF, PCB, SOCSO, EIS) and the table's per-column figures: sums of `epf_cents`, `pcb_cents`, `socso_cents`, `eis_cents` per run: NOT in `payrollSummary` (it only totals gross/deductions/net) so a small new sum is needed.
   - Headcount paid "22 / 24": `payslips.filter(status==='paid').length` over run payslip count; for the current month (draft) this is 0 / N. MOCK CONTRADICTION: mock says 24 employees; the company has 20. Seed: current run is `draft` with all payslips `pending`; the 7 older runs are `paid`.
   - Header month: latest run `period_month` (formatted as "October 2026"; no month-name-with-year helper, `monthLabel` is 3-letter).
   - Table rows: payslips of the selected run: `employee_name`, `gross_cents`, `epf_cents`, `socso_cents`, `eis_cents`, `pcb_cents`, `net_cents` (generated column), `status` ('pending'|'paid'). Deductions = gross - net. Sample company current-run gross = RM 105,200 for 20 payslips (sum of seed salaries), not RM 96,400.
   - "Export EA": NO SOURCE (no EA form generation).
   - Local `rm` helper in this file shadows the library `rm` (different format: whole ringgit vs two decimals); the library one is `@/lib/reach/format` `rm(cents)`.
4. Write controls: "Run Payroll" button; "Export EA" (both: remove/disable).
5. Helpers: `payrollSummary` (summaries.ts); `rm` (lib/reach/format); `addMonths`, `monthLabel`.
6. Imports: charts AreaTrend, DonutStat, Sparkline, Series, Slice; Bento; ui LiveDot, Button, Table parts; `cn`. Server component, non-async.

### A.21 payment-vouchers  (`payment-vouchers.tsx`; nav "Payroll > Payment Vouchers", `needs: 'approve'` = HR only)
1. Purpose/audience: HR payment voucher register. `hr_payment_vouchers` is `hr` and the seam does NOT read it yet. Demo: any member reads.
2. Widgets:
   - PageHeader "Payment Vouchers", subtitle "Salary & reimbursement vouchers, Saudara."; action Button "New Voucher" (Plus).
   - KPI "Vouchers" = "42", delta "+7", onPrimary, Sparkline [31,34,29,38,32,41,39,42]. KPI "Paid" = "36", delta "+9%" (up), Sparkline [27..36]. KPI "Pending" = "6", delta "+2" (down), Sparkline [4,4,3,5,3,5,4,6]. KPI "Value this month" = "RM 28.4k", delta "+6%" (up), Sparkline [21..28.4].
   - Card "Voucher value issued" / "Last 8 weeks" (TrendingUp), col-span 8: AreaTrend series `value` "Issued (RM k)", Wk1..Wk8 (3.1, 3.4, 2.9, 3.8, 3.2, 4.1, 3.9, 4.0).
   - Card "Vouchers by type" / "This month" (PieChart), col-span 4: DonutStat Salary 19,800; Claims 4,200; Overtime 2,600; Vendor 1,800; centre "RM 28.4k" / "issued".
   - Card "Recent vouchers" / "Latest salary & reimbursement vouchers" (Receipt), card action Button outline "View all", flush, col-span 12: Table columns `Voucher #`, `Payee`, `Purpose`, `Amount` (right, "RM 3,372"), `Date`, `Status` (LiveDot when Paid + pill Paid/Pending). 6 mock rows (PV-1042 .. PV-1037). Footer: "36 paid", "6 pending", right "RM 28,400 issued".
3. Data mapping (`hr_payment_vouchers`: `voucher_no`, `payee` text, `voucher_type` free text, `amount_cents` > 0, `issued_date`, `status` 'draft'|'issued'|'paid'; needs a new `listPaymentVouchers()`):
   - Vouchers / Paid / Pending counts: by `status`; mock "Pending" maps to draft+issued (DB has three states, mock two). "Value this month": sum `amount_cents` where `issued_date` in month. Deltas and sparklines: week/month sums derivable; seed only spans 24 days (-24 to 0).
   - Value issued (8 weeks): sum by `weekStart(issued_date)`; seed fills ~4 weeks.
   - By type: group by `voucher_type`. Seed types: "Claim reimbursement", "Statutory payment", "Advance", "Overtime payout". The mock's "Salary" and "Vendor" types do not exist in the seed.
   - Table: Voucher # = `voucher_no`, Payee = `payee`, Purpose = `voucher_type`, Amount = `amount_cents`, Date = `issued_date`, Status = `status`. MOCK CONTRADICTION: "Salary — Oct" dated "28 Oct" is a future date relative to the mock's own "today".
4. Write controls: "New Voucher" (remove/disable); "View all" (no target: remove).
5. Helpers: `rm` (lib/reach/format); `weekStart`, `formatDay`.
6. Imports: charts AreaTrend, DonutStat, Sparkline, Series, Slice; Bento; ui LiveDot, Button, Table parts; `cn`. Server component, non-async.

### A.22 scorecard  (`scorecard.tsx`; nav "Performance > Scorecard", not gated; page title "Scorecards")
1. Purpose/audience: team performance scorecards. `hr_scorecards` is `personal` (HR/demo see all; others see only their own). Team wording needs `teamView`.
2. Widgets:
   - PageHeader "Scorecards", subtitle "Team performance at a glance · H2 2026, Saudara." (no actions).
   - KPI "Avg score" = "80", delta "+3", onPrimary, Sparkline [72,74,73,76,77,78,79,80].
   - KPI "Reviews done" = "24 / 26", delta "92%" (up), Sparkline [14,17,19,21,22,23,24,24].
   - KPI "Top performer" = "Nurul H.", delta "91" (up). KPI "Needs coaching" = "2", delta "−1" (up).
   - Card "Competencies" / "Team average vs top quartile" (Radar), col-span 6: RadarSpread (height 260) series `team` "Team average", `top` "Top quartile" over Goals, Attendance, Peer, Quality, Initiative, Leadership (0-100).
   - Card "Scores by department" / "Average overall score" (ChartColumn), col-span 6: BarGroup horizontal, series `score` "Avg score": Sales 88, Finance 82, Ops 75, Support 91, Mktg 64, Eng 78.
   - Card "Employee scorecards" / "Goals · attendance · peer review" (Users), flush, col-span 12: Table columns `Employee` (avatar + name), `Department`, `Goals` (right, "85%"), `Attendance` ("96%"), `Peer review` ("90%"), `Overall` (coloured `ScorePill`: >=80 emerald, >=60 amber, else red). 6 mock rows. Footer: Trophy "Nurul Huda leads at 91", right AlertTriangle "2 below target", Gauge "avg 80", ClipboardCheck "24 reviewed".
3. Data mapping: `listScorecards()` rows `employee_name`, `period` (seed "H1 <year>"), `score` (numeric 0-5), `competencies` (jsonb: seed keys Delivery, Teamwork, Ownership, Communication).
   - SCALE CONTRADICTION: mock scores are 0-100 and percentages; `hr_scorecards.score` is 0-5 (`check (score between 0 and 5)`). Colour thresholds 80/60 would need rescaling (e.g. x20 or 4.0/3.0).
   - COMPETENCY CONTRADICTION: mock axes (Goals, Attendance, Peer, Quality, Initiative, Leadership) differ from stored keys (Delivery, Teamwork, Ownership, Communication). A radar can use the stored keys; "Top quartile" is derivable (new code: mean of the top 25% by `score`).
   - Avg score: `performanceSummary(goals, scorecards, reviews).average_score` (one decimal, 0-5). Top performer: `performanceSummary(...).top[0]` (employee, period, score; `top` is top 5). Delta "+3", Avg-score sparkline, "Reviews done" sparkline, "Needs coaching ... −1": NO SOURCE (no earlier periods; one period per employee in the seed; "needs coaching" has no defined threshold: `Review.rating === 'below'` is the closest).
   - Reviews done "24 / 26": reviews with `reviewed_at` not null over `listEmployees()` active count; there is no review status column.
   - Scores by department: average `score` per `department_name` (join employees by `employee_id`). Mock departments "Customer Support" and "Engineering" do not exist in the sample company (Sales, Operations, Marketing, Finance, Management).
   - Table columns Goals % (could be the mean `progress` of `listGoals()` for that employee; goals only exist for employees 1-10 in the seed), Attendance % (could be `attendanceCounts(...).rate_pct` per employee over a window), Peer review %: NO SOURCE (no peer data). Overall = `score`.
   - Footer: leader = top score; "below target" count needs a target (none stored).
4. Write controls: none.
5. Helpers: `performanceSummary` (top 5, average_score, ratings), `attendanceCounts` (summaries.ts); `headcountByDepartment` (not directly).
6. Imports: charts BarGroup, RadarSpread, Sparkline, Series; Bento; ui Table parts; `cn`. Server component, non-async. Local `ScorePill`, `scoreColor`, local type `Scorecard` (shadows `lib/people/types` `Scorecard`).

### A.23 review-scores  (`review-scores.tsx`; nav "Performance > Review Scores", not gated)
1. Purpose/audience: performance review results. `hr_reviews` is `personal` (HR/demo see all; others only their own).
2. Widgets:
   - PageHeader "Review Scores", subtitle "Performance review results · H2 2026, Saudara." (no actions).
   - KPI "Reviews" = "26", delta "+4", onPrimary, Sparkline [10,14,18,21,23,25,26,26]. KPI "Completed" = "23", delta "88%" (up), Sparkline [8..23]. KPI "Avg rating" = "4.0", delta "+0.2" (up), Sparkline [3.6..4.0]. KPI "Exceeds" = "8", delta "+2" (up), Sparkline [3,4,5,6,7,7,8,8].
   - Card "Rating distribution" / "Completed reviews" (PieChart), col-span 4: DonutStat Exceeds 8, Meets 11, Below 4, centre "23" / "rated".
   - Card "Average rating by department" / "Final score out of 5" (ChartColumn), col-span 8: BarGroup horizontal, series `rating` "Avg rating": Sales 4.3, Finance 4.0, Ops 3.7, Support 4.5, Mktg 3.2, Eng 3.8.
   - Card "Review scores" / "Manager · self · final rating" (Users), flush, col-span 12: Table columns `Employee`, `Cycle` ("H2 2026"), `Manager` (right, "4.4"), `Self` (right), `Final` (right, bold), `Rating` (pill Exceeds emerald / Meets amber / Below red), `Status` (LiveDot when "In review" + "Completed"/"In review"). 6 mock rows. Footer: Award "8 exceeds", CircleCheck "23 completed", right Star "avg 4.0 / 5", ClipboardList "3 in review".
3. Data mapping: `listReviews()` rows `employee_name`, `period`, `rating` ('exceeds'|'meets'|'below'), `score` (0-5), `reviewer_name`, `reviewed_at` (nullable date).
   - Reviews / Completed / Exceeds / Rating distribution / footer counts: `performanceSummary(...).ratings`; completed = `reviewed_at !== null` (no status column; the seed always sets it, so "In review" would never appear).
   - Avg rating: mean of review `score` (the helper averages scorecards, not reviews: new one-liner). By department: join `listEmployees()`.
   - NO SOURCE: separate "Manager" and "Self" scores (the table has one `score` and a `reviewer_name`), "Status" In review vs Completed, all four KPI sparklines and the deltas (+4, +0.2, +2, 88% trend).
   - Cycle = `period` ("H1 <year>" in seed; mock says H2 2026).
   - Seed (computed from the score formula): 20 reviews, 6 exceeds, 10 meets, 4 below; all `reviewer_name` "Kavitha Nair", `reviewed_at` = today - 45; highest score 4.8 (employee 8, Raj Kumar), mean about 3.9.
4. Write controls: none.
5. Helpers: `performanceSummary` (ratings) for the counts.
6. Imports: charts BarGroup, DonutStat, Sparkline, Series, Slice; Bento; ui LiveDot, Table parts; `cn`. Server component, non-async. Local type `Review` shadows the lib type.

### A.24 training  (`training.tsx`; nav "Performance > Training", not gated)
1. Purpose/audience: training catalogue plus enrolment progress. `hr_trainings` is `shared`; `hr_training_enrolments` is `personal`, so for a non-HR member the enrolment counts would be only their own (team wording needs `teamView`; catalogue itself is fine for everyone).
2. Widgets:
   - PageHeader "Training", subtitle "Courses and sessions for your team, Saudara."; action Button "New Training" (Plus).
   - KPI "Courses" = "8", delta "+2", onPrimary, Sparkline [3,4,5,5,6,7,8,8]. KPI "Enrolled" = "92", delta "+10" (up), Sparkline [40..92]. KPI "Completed" = "39", delta "+15%" (up), Sparkline [12..39]. KPI "Training hours" = "60", delta "+12" (up), Sparkline [28..60].
   - Card "Completion by course" / "Enrolled vs completed" (ChartColumn), col-span 8: BarGroup horizontal showLegend (height 260), series `enrolled` "Enrolled", `completed` "Completed"; one bar group per course using short labels (Sales, Fire Safety, Excel, Leadership, CS Basics, e-Invois, Cyber, Bahasa).
   - Card "Enrolments by category" / "Across all courses" (PieChart), col-span 4: DonutStat Compliance 33, Technical 24, Service 22, Sales 8, Leadership 5; centre "92" / "enrolled".
   - Card "All training" / "Courses, enrolment and progress" (BookOpen), flush, col-span 12: Table columns `Course` (icon + title), `Category`, `Date`, `Enrolled` (right), `Completed` (right, "3 / 8"), `Hours` (right), `Status` (LiveDot when In progress + pill Completed emerald / In progress amber / Upcoming muted). 8 mock rows. Footer: "92 enrolled", "39 completed", right "3 in progress".
3. Data mapping: `listTrainings()` rows `title`, `category` (nullable), `provider`, `starts_on`, `ends_on`, `status` ('upcoming'|'in_progress'|'completed'); `listTrainingEnrolments()` rows `employee_id`, `training_id`, `completed`.
   - Courses: trainings length. Enrolled / Completed: enrolment counts (per training: group by `training_id`). Completion by course, Enrolments by category (group enrolments by the training's `category`; null -> "Uncategorised"), table columns Enrolled and Completed "x / y": all derivable. Footer "3 in progress": count of trainings with `status='in_progress'`.
   - Date: `starts_on` (mock shows one date; DB has a range `starts_on`..`ends_on`).
   - NO SOURCE: "Hours" column and the "Training hours" KPI (no duration column; `ends_on - starts_on` in days is not hours), short axis labels (mock `short` field: use `title`), all four KPI sparklines and deltas.
   - Mock status labels "In progress" vs DB `in_progress`.
   - Seed: 5 trainings (Workplace safety refresher completed, PDPA for customer data completed, Consultative selling in_progress, Excel for finance teams upcoming, First-time manager programme upcoming; categories Compliance, Compliance, Sales, Skills, Leadership); 36 enrolments, of which 15 completed (computed from the enrolment rule), the demo employee (1) has 3 enrolments (2 completed).
4. Write controls: "New Training" (remove/disable).
5. Helpers: none for training exist. (`performanceSummary` does not cover it.)
6. Imports: charts BarGroup, DonutStat, Sparkline, Series, Slice; Bento; ui LiveDot, Button, Table parts; `cn`. Server component, non-async. Local type `Training` shadows the lib type.

### A.25 settings  (`settings.tsx`; nav "Configuration > Settings", `needs: 'approve'` = HR only; excluded from PEOPLE_PATHS)
1. Purpose/audience: HR workspace policy settings (form). `hr_settings` is `hr` and the seam does NOT read it yet. One row per org (`unique (org_id)`); a non-demo org has NO row until one is created, so reads must tolerate "no row" and show the table defaults.
2. Widgets (the only screen with real form controls; no KPIs or charts; all inputs are uncontrolled with `defaultValue`/`defaultChecked`):
   - PageHeader "Settings", subtitle "HR policies & workspace preferences, Saudara."
   - Card "Company & HR policy" / "Your organisation details" (Building2), col-span 6: Input "Company name" (id company-name, "Rimba Ventures Sdn Bhd"); Input "SSM registration no." (ssm-no, "202201012345 (1456789-A)"); Input "HR contact email" (hr-email, type email, "hr@rimbaventures.com").
   - Card "Leave entitlements" / "Annual allocations and approvals" (Plane), col-span 6: Input "Annual (days)" (annual-leave, 16), "Medical / MC (days)" (medical-leave, 14), "Emergency (days)" (emergency-leave, 3); Switch "Allow carry-forward" (checked), Switch "Manager approval required" (checked).
   - Card "Payroll & statutory rates" / "EPF / SOCSO / EIS / PCB" (Banknote), col-span 6: Select "Pay day" (25th / 28th / Last day; default 28), Input "EIS rate (%)" (0.2), "EPF / KWSP employee (%)" (11), "EPF / KWSP employer (%)" (13); Switch "Auto-calculate EPF, SOCSO, EIS & PCB" (description "SOCSO and PCB follow the latest LHDN and PERKESO schedules.", checked), Switch "Email payslips to staff" (checked).
   - Card "Working days & hours" / "How the team week is structured" (CalendarClock), col-span 6: Select "Working days" (Mon–Fri / Mon–Sat; default Mon–Fri), Select "Week starts" (Monday / Sunday), Input "Hours per day" (8), Input "Start time" (09:00).
   - Card "Notifications" / "Keep the team in the loop" (Bell), col-span 12: four `ToggleItem` switches: "Leave & claim requests" ("Alert approvers the moment a request comes in.", on), "Payslip ready" ("Tell staff when the monthly payslip is published.", on), "Document expiry" ("Flag expiring permits, passports and EA forms early.", on), "Birthdays & anniversaries" ("A friendly nudge for team milestones.", off).
   - Footer: Button "Save changes" (right aligned).
3. Data mapping (`hr_settings` columns: `work_week` jsonb default ["mon","tue","wed","thu","fri"]; `default_annual_leave_days` numeric(4,1) default 14, check >= 0; `overtime_rates` jsonb default {"weekday":1.5,"rest_day":2.0,"public_holiday":3.0}; `notifications` jsonb default {}):
   - Working days: derivable from `work_week` (Mon–Fri when it has 5 weekdays; Mon–Sat if 6). Annual (days): `default_annual_leave_days`. Notifications: `notifications` keys; the demo seed uses leave_requests, payslip_ready, document_expiry, birthdays (true, true, true, false), matching the four mock toggles one to one.
   - NO SOURCE (no column anywhere): Company name (could come from the `orgs` table, outside the Lekiu tables), SSM registration no., HR contact email, Medical and Emergency entitlement days (only per-employee `hr_leave_balances.entitled_days`; the seed has 14 and 3 but there is no default), Allow carry-forward, Manager approval required, Pay day, EIS/EPF rates, Auto-calculate, Email payslips, Week starts, Hours per day, Start time. `overtime_rates` has no UI on this screen at all.
   - MOCK vs SEED CONTRADICTION: mock Annual = 16 (and per-employee balances in the seed use 16), but the seeded `hr_settings` row takes the column default 14.
4. Write controls: EVERY control here is a write control (inputs, switches, selects, "Save changes"): must be rendered read-only/disabled (e.g. `disabled` attributes) or replaced by plain text rows; none of `hr_settings` is writable yet.
5. Helpers: none.
6. Imports: Bento (BentoGrid, BentoCard only; no BentoStat); ui Button, Input, Label, Select parts, Switch; ScreenContainer, PageHeader. Server component, non-async (the shadcn Select/Switch are client components inside). No charts. Local `ToggleItem`.

## B. The four tables the seam does not read yet

Screens that need them:

| Table | Read kind | Screens that need it | Needed how |
|---|---|---|---|
| `hr_documents` | `personal` | my-documents (A.5) | every widget (list, KPIs, donut) |
| `hr_letters` | `personal` | letters (A.16) | table, KPIs "Issued"/"Drafts"/"Issued this month", donut |
| `hr_payment_vouchers` | `hr` | payment-vouchers (A.21) | every widget |
| `hr_settings` | `hr` | settings (A.25) | the whole form (read-only) |
| `hr_settings` (optional) | `hr` | overtime (A.19) "Rate policy" tile (`overtime_rates`); ot-claims (A.10) "By rate" labels; my-attendance (A.3) 176 h target / `work_week` | optional: non-HR members cannot read `hr_settings`, so these screens should use constants for non-HR |
| `hr_documents` (optional) | `personal` | none other. (The payslip rows on my-documents could instead come from `listPayslips`.) |  |

Nothing else (dashboard, announcements, records, leave, time-off, claims, approve-*, public-holidays, timesheet, shift-calendar, payroll, scorecard, review-scores, training, my-attendance, my-goals) needs any of the four.

Columns, copied from migration `20261014090600_people_comms_documents.sql` (payment vouchers from `20261014090400_people_payroll.sql`). Every table also gets `enable row level security`, a restrictive `mfa_required` policy for authenticated, `revoke all ... from anon, authenticated`, then `grant select ... to authenticated` (select only; no write policy exists on any of the four).

### hr_documents (secured `personal`)
| column | type | null | default / check |
|---|---|---|---|
| id | uuid | not null | PK, `gen_random_uuid()` |
| org_id | uuid | not null | FK `orgs(id)` on delete cascade |
| employee_id | uuid | not null | composite FK `(employee_id, org_id)` -> `hr_employees(id, org_id)` on delete cascade |
| title | text | not null | `char_length(trim(title)) between 1 and 200` |
| doc_type | text | not null | `in ('payslip','contract','letter','tax','benefits')` |
| status | text | not null | default `'available'`; `in ('signed','pending_signature','available','expiring')` |
| issued_on | date | null | |
| expires_on | date | null | |
| created_at | timestamptz | not null | default `now()` |
Indexes: `(employee_id, issued_on desc)`, `(org_id)`. No file/size/url column ("records only: no file is stored yet").

### hr_letters (secured `personal`)
| column | type | null | default / check |
|---|---|---|---|
| id | uuid | not null | PK, `gen_random_uuid()` |
| org_id | uuid | not null | FK `orgs(id)` on delete cascade |
| employee_id | uuid | not null | composite FK to `hr_employees(id, org_id)` on delete cascade |
| letter_type | text | not null | NO check (free text) |
| title | text | not null | `char_length(trim(title)) between 1 and 200` |
| status | text | not null | default `'draft'`; `in ('draft','issued')` |
| issued_on | date | null | |
| created_at | timestamptz | not null | default `now()` |
Indexes: `(employee_id)`, `(org_id, created_at desc)`. No body/file/template column.

### hr_payment_vouchers (secured `hr`)
| column | type | null | default / check |
|---|---|---|---|
| id | uuid | not null | PK, `gen_random_uuid()` |
| org_id | uuid | not null | FK `orgs(id)` on delete cascade |
| voucher_no | text | not null | `char_length(trim(voucher_no)) between 1 and 30`; `unique (org_id, voucher_no)` |
| payee | text | not null | free text (not an employee FK) |
| voucher_type | text | not null | NO check (free text) |
| amount_cents | bigint | not null | `amount_cents > 0` |
| issued_date | date | not null | |
| status | text | not null | default `'draft'`; `in ('draft','issued','paid')` |
| created_at | timestamptz | not null | default `now()` |
Index: `(org_id, issued_date desc)`. No employee_id, no link to a claim/payslip/overtime record.

### hr_settings (secured `hr`)
| column | type | null | default / check |
|---|---|---|---|
| id | uuid | not null | PK, `gen_random_uuid()` |
| org_id | uuid | not null | FK `orgs(id)` on delete cascade; `unique (org_id)` (one row per workspace) |
| work_week | jsonb | not null | default `["mon","tue","wed","thu","fri"]` |
| default_annual_leave_days | numeric(4,1) | not null | default `14`; `>= 0` |
| overtime_rates | jsonb | not null | default `{"weekday":1.5,"rest_day":2.0,"public_holiday":3.0}` |
| notifications | jsonb | not null | default `{}` |
| created_at | timestamptz | not null | default `now()` |
| updated_at | timestamptz | not null | default `now()` (no touch trigger is attached to this table in the migration) |
Notes: a non-demo workspace has no `hr_settings` row until something inserts one, so a reader gets zero rows and must fall back to the defaults above. Nothing in this table covers company name, SSM number, HR email, pay day, statutory rates, medical/emergency defaults, carry-forward, approval policy, hours per day, start time or week start.

## C. Screens that share a layout closely enough for one shared component or helper

### C1. The four approvals screens (approve-leave, approve-claims, approve-overtime, approve-time-off): one shared `ApprovalsScreen`
Evidence: 293 / 298 / 299 / 298 lines. `diff approve-leave.tsx` against each other file changes only 136 (claims), 139 (overtime) and 115 (time-off) lines counted on both sides, i.e. roughly 58-70 lines per file, all inside mock constants, labels and the table cells. Identical in all four, character for character:
- imports (only the lucide icons differ), `type Status = 'Pending' | 'Approved' | 'Rejected'`, `STATUS_STYLE`, `StatusPill`, `EmployeeCell` (avatar initial + name), `ApprovalActions` (Approve / Reject for Pending, "—" otherwise).
- `PageHeader className="mb-3"` with the identical actions: `Select defaultValue="30d"` (Last 7 / 30 / 90 days) plus outline `Button` "Export".
- KPI row of exactly four tiles in the same order and tones: "Pending" (onPrimary, `value={pending}`), a green "Approved ..." (label differs: "Approved this month" / "Approved (MTD)"), "Rejected" (tone down), "Avg turnaround" (tone up). Each carries an 8-point Sparkline with the same colours (primary-foreground, chart-2, chart-4, chart-1).
- one `AreaTrend` card `col-span-2 md:col-span-8` "... over time" / "Submitted vs approved · last 8 weeks", `height={220}`, `showLegend`, series keys `submitted` and `approved`, labels `Wk1`..`Wk8`.
- one breakdown card `col-span-2 md:col-span-4` whose body is a copy-pasted progress-bar list (`TypeBreakdown` / `CategoryBreakdown` / `DeptBreakdown` / `ReasonBreakdown`: same markup, `max` normalisation, `h-2 rounded-full bg-muted` track).
- one flush table card `col-span-2 md:col-span-12` with `Employee`, a variable middle (leave: Type, From–To, Days; claims: Category, Amount (RM), Date; overtime: Date, Hours, Amount (RM); time-off: Date, Duration, Reason), then `Status` (LiveDot + pill) and `Action`; a card action `Button` with a different icon and label ("Calendar", "Batch pay", "Timesheets", "Calendar").
Parameters a shared component would take: title, subtitle, KPI labels/values/deltas, chart title and series labels, breakdown title/subtitle/rows, extra table columns (as cell renderers), card action. Shared data: `pendingApprovals`/`approvalCounts` (overview.ts) already split pending rows by `kind`; the missing helpers are weekly submitted/approved bucketing (`weekStart` exists) and a "pending by X" grouper. NO SOURCE for the "Avg turnaround" tile in all four (see A.11), so the shared component should simply drop that tile.

### C2. The four "my requests" screens (leave, time-off, claims, ot-claims): one shared `MyRequestsScreen`
Evidence: 229 / 221 / 219 / 214 lines; diff against leave.tsx changes 138 (time-off), 142 (claims), 163 (ot-claims) lines (both sides) out of about 220. Identical: `PageHeader className="mb-3"` with a single primary `Button` + `Plus` icon; `type Status = 'Approved' | 'Pending' | 'Rejected'`, `STATUS_STYLES`, `StatusPill` copies; four KPI tiles (first `onPrimary`, each with an 8-point Sparkline); a donut/bar card (`col-span-2 md:col-span-5`) plus a breakdown card (`md:col-span-7`) holding a `Progress` or divided list; a final flush "My Requests" table card (`col-span-2 md:col-span-12`, `mt-3 overflow-x-auto`, a `COLUMNS` const mapped to `TableHead className="whitespace-nowrap"`, status cell = `LiveDot active={Pending}` + `StatusPill`). Same filter need: all four read `personal` tables and must filter to `viewer.employeeId`. Data shape is the same four-field `{ date range, quantity, amount/type, status }`.

### C3. Everything on `hr_overtime_records`: overtime, ot-claims, approve-overtime
Three layouts, one dataset: a shared `overtimeModel(records, employees, today)` could return month totals (hours, cost), pending hours/count, hours by month, hours by `rate_multiplier`, hours by department (joins employees), distinct employees with overtime. The `rate` labels (1.5x / 2.0x / 3.0x) and the 104 h cap are repeated as text in overtime ("Rate policy", "Avg OT per employee") and ot-claims ("By rate", "cap 104 h/month").

### C4. Duplicated small pieces across many files (extract once)
- `StatusPill` is defined separately in 13 files (leave, time-off, claims, ot-claims, my-goals, my-documents, the four approve-*, payroll, payment-vouchers, training), each with its own colour map (emerald = good, amber = pending, red = bad, sky/muted = neutral). `letters.tsx`, `overtime.tsx`, `review-scores.tsx`, `scorecard.tsx`, `my-attendance.tsx` and `shift-calendar.tsx` inline the same `inline-flex ... rounded-full px-2.5 py-0.5 text-xs font-medium` span.
- Avatar initial + name cell (`grid size-7|8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary`): approve-* (4), letters, overtime, shift-calendar, scorecard, timesheet, announcements, plus `initials()` in assistant.tsx.
- `LiveDot active={status === 'Pending'}` + pill: leave, time-off, claims, ot-claims, approve-*, overtime, review-scores, training, letters, payroll, payment-vouchers.
- KPI tile with `BentoStat` + `Sparkline` (mock arrays): in 21 of the 25 screens (all except records, public-holidays, letters, settings). Only some sparklines have a source (see "NO SOURCE" items), so a helper that returns a bucketed series (`bucketByWeek`, `bucketByMonth`, 8 points, zero-filled) is the common need: used by dashboard, my-attendance, timesheet, ot-claims, overtime, payroll, payment-vouchers, approve-*, announcements.
- Footer bar under a table (`flex items-center ... border-t px-4 py-3 text-sm text-muted-foreground`): my-attendance, my-documents, payroll, payment-vouchers, scorecard, review-scores, training, timesheet.
- Week navigation header (`Week of 05–11 Oct 2026` + ghost icon buttons "Previous week"/"Next week"): identical in timesheet and shift-calendar -> one `WeekNav` driven by a `?week=` search param and `weekStart`.
- Leave type donut: dashboard "Leave utilisation", leave "Leave used by type", my-attendance "Leave taken" (all three need a per-type day sum; `leaveDaysByType` is month-scoped and team-wide, so a year-scoped or per-employee variant is shared need).

### C5. Near-twins
- scorecard and review-scores: same skeleton (4 KPI tiles, one chart + one horizontal department BarGroup, employee table with coloured pill, footer with icons). Both need "average of X per department" via `listEmployees()` and `performanceSummary()`; one `departmentAverages(rows, employees)` helper serves both.
- payroll and payment-vouchers: same skeleton (4 KPI tiles with sparklines, `AreaTrend` col-span 8 + `DonutStat` col-span 4, flush table card with `LiveDot` Paid/Pending pill, footer). Both are HR-only and money-based.
- my-documents and letters: same skeleton idea (donut of types + record table with status pill + icon buttons) over `hr_documents`/`hr_letters`; both blocked by "no file stored".
- timesheet and shift-calendar: same header, same KPI-row style, a weekly employee x weekday table, a team heatmap/bar chart, and "pending"/"on the clock now" tiles.
- records and settings: both are key/value or form cards with no charts; records is read-only already, settings is all inputs.

## D. What the sample dataset (`src/lib/people/seed.ts`) and the demo seed migration (`20261014090700_people_demo_seed.sql`) contain

Both build the same fictional company "Rimba Ventures" and are meant to be identical, but the TS version is anchored to `now` at call time, the SQL one to today in Kuala Lumpur and is re-run hourly by pg_cron (`20261014090800_people_demo_cron.sql`, `1 * * * *`): it deletes and rebuilds all demo rows each hour, so row ids in tables with `gen_random_uuid()` (leave, claims, overtime, vouchers, announcements, documents, letters, goals, ...) change every hour; only employees, departments, payroll runs and trainings have stable md5-derived ids.

| Table | Rows (sample TS / demo SQL) | Notable |
|---|---|---|
| hr_departments | 5 / 5 | Sales, Operations, Marketing, Finance, Management |
| hr_employees | 20 / 20 | all `active` (no inactive, so no leavers); Sales 6, Operations 5, Marketing 3, Finance 3, Management 3; 17 full_time, 1 part_time (Siti Aminah), 2 contract (Lim Wei Jie, Daniel Wong), 0 intern; 6 managers (Ahmad Zaki, Tan Mei Ling, Farid Ismail, Liyana Salleh, Kavitha Nair, Hakim Abdullah); tenure 210 to 2,800 days (nobody joined in the last 90 or 180 days; Daniel Wong, 210 days, is newest); emails `handle@openkuasa.com`; `user_id` is null for all, DEMO_EMPLOYEE_ID is employee 1 Aisyah Rahim; birthdays at +19 (Aisyah), +9 (Nurul), +29 (Kavitha) days fall inside the next-30-days window |
| hr_employee_private | 20 / 20 | salary RM 2,800 to RM 8,600 (RM 105,200 summed); fake NRIC `900101-14-5nnn`; banks Maybank/CIMB/Public Bank/RHB; emergency contact "Waris <first name>"; no relationship column |
| hr_leave_requests | 18 / 18 | 14 approved, 3 pending (employees 1 annual +10..+11 d, 11 annual +5 d, 9 emergency +3 d), 1 rejected (employee 8 unpaid). Three approved cover today: Siti Lestari annual (-2..+1), Lim Wei Jie medical, Nurul Huda emergency. `created_at` from 0 to 110 days ago. Types used: annual, medical, emergency, unpaid (no maternity/paternity). Demo employee (1): 3 requests (1 pending, 2 approved) |
| hr_leave_balances | 60 / 60 | current year only (20 employees x annual 16, medical 14, emergency 3); `used_days` = sum of approved days with `start_date` in this year; no unpaid/maternity/paternity rows; none for other years |
| hr_time_off_requests | 6 / 6 | 5 approved (one 2 days ahead), 1 rejected, ZERO pending. Demo employee (1): 2 approved. Reasons are free text |
| hr_claims | 12 / 12 | 2 pending (Faiz medical RM 240; Nurul travel RM 180), 8 approved, 2 rejected; categories used medical, travel, meals, equipment, other; `claim_date` -55..-1 d; demo employee (1): 4 claims, none pending |
| hr_overtime_records | 12 / 12 | 1 pending (Ahmad Zaki 4 h, RM 150), 10 approved, 1 rejected; only rates 1.5 and 2.0; amount = hours x rate x RM 25; `work_date` -37..-2 d |
| hr_attendance_days | about 800 / about 800 | weekdays only, the last 56 days (exactly 8 weeks, 40 weekdays x 20 employees); status `on_leave` where an approved leave overlaps, about 1 in 40 `absent`, 4 in 40 `late` (hash-based, so DIFFERENT specific rows in the TS and SQL versions); `clock_out` is null for today; no rows older than 56 days, so any chart reaching back further than about 2 months is empty |
| hr_timesheet_entries | about 700 / about 700 | one per present or late day: 7.5, 8.0 or 8.5 h; `billable_hours` = hours x 0.8 rounded to 0.5; same 56-day window |
| hr_shifts | 35 / 35 | only the 5 Operations employees, only THIS week (Mon to Sun); pattern `(n + i) % 4`: 0 off, 1 night, else morning. Other weeks are empty |
| hr_public_holidays | 6 / 6 | fixed-date only, current year: New Year's Day (state, Kuala Lumpur), Federal Territory Day (state, Kuala Lumpur), Labour Day, National Day, Malaysia Day, Christmas Day (national). No Hari Raya, Deepavali, Thaipusam etc.; no other years |
| hr_payroll_runs | 8 / 8 | this month `draft`; the previous seven `paid` (`paid_at` = period + 27 days). (HR-only table) |
| hr_payslips | up to 20 per run, about 160 / same | one per employee whose `join_date` is before the end of the run's month (Daniel Wong can fall out of the oldest run); current-run gross RM 105,200; EPF 11%, SOCSO 0.5% capped at RM 29.75, EIS 0.2% capped at RM 11.90, illustrative PCB; `status` pending for the draft run, paid for older ones. "Payslips for 8 months" is true |
| hr_goals | 40 / 40 | employees 1-10 only, 4 each ("Hit the quarterly target", "Complete the compliance course", "Cut response time to under 4 hours", "Mentor one new hire"); statuses on_track/at_risk/done derived from progress |
| hr_scorecards | 20 / 20 | one per employee, period `H1 <year>`, score 3.0 to 4.8, competencies Delivery, Teamwork, Ownership, Communication |
| hr_reviews | 20 / 20 | one per scorecard; rating from score (>= 4.3 exceeds, >= 3.4 meets, else below) = 6 exceeds, 10 meets, 4 below; `reviewer_name` "Kavitha Nair"; `reviewed_at` = today - 45 for all (so no "in review") |
| hr_trainings | 5 / 5 | 2 completed, 1 in_progress (Consultative selling), 2 upcoming; categories Compliance, Compliance, Sales, Skills, Leadership; no hours column |
| hr_training_enrolments | 36 / 36 | rule `(n + k) % 3 = 0` plus employee 1 in the first three courses; 15 completed (all enrolments in the two completed courses); demo employee (1): 3 enrolments, 2 completed |
| hr_announcements | 5 / 5 | one per category (holiday 4 d ago, benefits 9, general 13, policy 21, strategy 34), author_name "Siti Lestari" |
| hr_documents | NONE in seed.ts / 26 in SQL | SQL: 20 signed "Employment contract" (one per employee, `issued_on` = join date) + 6 for employee 1: 3 payslips ("Payslip, last month", "two months ago", "three months ago", `available`), "EA form" (tax, available), "Confirmation letter" (letter, `pending_signature`), "Medical card" (benefits, `expiring`, expires in 25 days). So employee 1 has 7 documents, 1 pending signature, 1 expiring |
| hr_letters | NONE in seed.ts / 5 in SQL | issued: employee 1 "Confirmation of employment" (2 d ago), employee 13 "Offer of employment" (330 d ago), employee 9 "Promotion to Content Lead" (120 d ago); drafts: employee 10 "Late attendance reminder" (Warning), employee 16 "Contract renewal" |
| hr_payment_vouchers | NONE in seed.ts / 6 in SQL | PV-1041..PV-1046 (the SQL numbers them 1041-1046): 4 paid (Aisyah Rahim RM 320, Tan Mei Ling RM 1,290, Lembaga Hasil Dalam Negeri RM 4,120, KWSP RM 19,860), 1 issued (Farid Ismail advance RM 1,500), 1 draft (Daniel Wong overtime payout RM 375); types "Claim reimbursement", "Statutory payment", "Advance", "Overtime payout"; dates -24..0 d; total RM 27,465 |
| hr_settings | NONE in seed.ts / 1 in SQL | only `notifications` set: `{"leave_requests":true,"payslip_ready":true,"document_expiry":true,"birthdays":false}`; other columns default (so `default_annual_leave_days` = 14 while balances use 16) |

Answer to "does the seed have rows for the four unread tables?": the SQL demo seed does (documents 26, letters 5, vouchers 6, settings 1); `seed.ts` (the provider used in dev/preview/tests when no Supabase env is set) has NONE of them because `PeopleData` has no method for them. Adding `listDocuments`, `listLetters`, `listPaymentVouchers` and a settings getter means extending `seed.ts` to mirror the SQL, or those screens will be empty in preview.
Not in either seed: any leaver or inactive employee, any history of past headcount, any decision timestamps that make sense (the SQL sets `decided_at` to a fixed `now() - 3 days` / `2 days` / `1 day` regardless of `created_at`, and the types do not carry it anyway), peer reviews, shift requirements/open slots, activity logs, read receipts, letter templates, course hours.

## E. Surprises

1. Only `assistant.tsx` and `employees.tsx` use the seam. None of the 25 sample screens imports anything from `@/lib/people/*`; none is async. No dead imports exist in the 25 files (checked every named import against its usage), so the conversion is a rewrite of constants, not an import cleanup.
2. `people/calendar` (nav "Calendar", General) is wired to the CRM screen: `registry.ts` maps `'people/calendar': CalendarScreen` and `src/app/(app)/people/calendar/page.tsx` imports `@/screens/crm/calendar`. It is not one of the 25 and `paths.ts` lists `calendar` in `NO_EMPLOYEE_DATA`. `PEOPLE_PATHS` (pages revalidated after an employee/department change) is built from the nav minus public-holidays, announcements, settings and calendar, so every converted employee-dependent screen is covered automatically.
3. "My ..." screens read `personal` tables, so RLS does not narrow them for HR or in the demo: my-attendance, my-goals, my-documents, records, and also leave, time-off, claims, ot-claims must filter by `viewer.employeeId` explicitly (null for an unlinked member -> show a "not linked" note like `assistant.tsx`). Conversely the team-style screens that are NOT nav-gated (dashboard, timesheet, shift-calendar, overtime, scorecard, review-scores, training enrolments, letters) show only the member's own rows to a non-HR member, so they need `teamView` / `HR_ONLY` guards or wording changes.
4. Non-HR cannot read two things the sample screens assume: `hr_payroll_runs` and `hr_settings`/`hr_payment_vouchers` are `hr` (`payrollSummary(runs, ...)` returns `[]` for a non-HR member even though they can read their own payslips), so any "my payslip" view must call `listPayslips` directly.
5. Mock data that contradicts the database columns: claims "Accommodation" and "Parking" (valid categories: medical, travel, meals, equipment, other); my-attendance "Replacement" leave (valid: annual, medical, emergency, unpaid, maternity, paternity) and a Saturday row ("03 Oct") although attendance is weekdays only; my-attendance has no "On leave" status although the table has four statuses; scorecard 0-100 scale vs `score` 0-5 and different competency names; review-scores separate "Manager" and "Self" scores (one `score` column only) and a "Status" that does not exist; my-goals `label` and `description` fields (no such columns); training "Hours" (no column); public-holidays multi-state strings (one `state` per row); letters "EA Form (CP8A)" as a letter type (it is an `hr_documents` `tax` document) and a "Templates" list (no table); payroll "24 employees" and RM 96,400 (company has 20, RM 105,200); settings Annual 16 vs the seeded `default_annual_leave_days` 14.
6. Mock names that do not exist in the sample company: "Hafiz Omar" (seed: Hafiz Osman), "Wan Azlan", departments "Customer Support", "Engineering", "HR", "Ops" (seed: Sales, Operations, Marketing, Finance, Management). Shift-calendar and timesheet mock rosters name Sales/Marketing/Finance staff, while the seeded roster is Operations only.
7. Seven things appear on screens with NO SOURCE anywhere in the 24 tables: turnover and retention (no leaving date), joiners/leavers history (leavers), headcount of past months (only join-date reconstruction, see `headcountTrend` docstring), approval "turnaround" (`decided_at` exists in four tables but is not in the row types or column lists; and the seed's `decided_at` is unrelated to `created_at`), announcement "unread", the Recent-activity feed, and shift "coverage"/"open slots". Course hours, peer-review scores, letter templates, reimbursed state of a claim, carry-forward days, EIS/tax-resident status and most Settings fields are also unbacked. Every sparkline in the mock that shows history of a snapshot value (balance, pending count, progress) is unbacked; only series of events with dates (leave, claims, overtime, attendance, timesheet, payslips, vouchers, announcements, joins) can be bucketed honestly.
8. Truncation risk: `rows()` in supabase.ts stops after 5 pages of 1000 with no error. An 8-month attendance read is about 800 rows for the demo but would be 5,000+ at about 30 employees over 8 months, silently dropping the oldest or newest rows (ordered `work_date desc` for attendance/timesheet).
9. The two `date`-style formatters lose or lack things the mocks show: `formatDay` has no year (mocks show "03 Oct 2026", "Due 31 Dec 2026", "Expires 31 Dec 2026"), and nothing formats clock times in Kuala Lumpur (my-attendance, timesheet), relative times (announcements, dashboard activity), month-with-year headers ("October 2026" on payroll), or weekdays (public-holidays "Day").
10. Local identifiers that shadow shared ones: `payroll.tsx` defines its own `rm()` (whole ringgit) while `@/lib/reach/format` has `rm(cents)` (two decimals); `scorecard.tsx`, `review-scores.tsx`, `training.tsx`, `my-goals.tsx`, `my-attendance.tsx` declare local types named `Scorecard`, `Review`, `Training`, `Goal`, `AttendanceStatus` that clash in name with `@/lib/people/types` if both get imported in one file.
11. Date coupling: public-holidays comments assume "today (09 Oct 2026)"; its "This month" KPI is the hard-coded string "1"/"October". The demo workspace re-anchors to the real current date every hour, so converted screens will not match the mock's October 2026 narrative.
12. `hr_settings` has no touch trigger for `updated_at` (unlike employees/employee_private), and a normal workspace has no row at all until one is written, so readers must default.

