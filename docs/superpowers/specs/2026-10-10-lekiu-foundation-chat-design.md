# OpenKuasa Backend — Lekiu Data Foundation + Ask-Lekiu Design

**Date:** 2026-10-10
**Status:** Draft for review
**Module:** Lekiu (`people`) — "Build & manage your team"
**Milestone:** Lekiu slice 1 — move Lekiu off in-file sample data onto Postgres with
two-tier RLS, give employees full CRUD, and ship Lekiu's own assistant.

---

## 1. Context & goals

Jebat (`reach`) and Kasturi (`crm`) each have a working assistant: one agent holding its
product's tools, lookups running freely, changes waiting behind approval cards. Kasturi's
(PR #101) made the pieces product-neutral: a shared `AskHero` card that takes a persona,
`combineToolkits` over a `ProductToolkit`, and the shared `prepareChat` gate.

Lekiu has none of the data side:

- All 27 Lekiu screens under `src/screens/people/` render hard-coded `const` arrays.
- The screens disagree with each other (Overview says headcount 20; Employees lists 10).
- There are no HR tables, no `src/lib/people`, and no `people/*` key in `LIVE_SCREENS`.
- The Overview's "Ask Lekiu" hero is a static mock.

**The request:** replicate Jebat's AI for Lekiu, with HR tools and an HR prompt.

**The agreed end goal:** full CRUD across every Lekiu screen, with the assistant and the UI
at parity. That is too large for one spec, so it is cut into slices (§2.3). This spec is the
first: the whole data foundation, employee CRUD, and the assistant.

### Goal of this slice

A signed-in user sees every Lekiu screen and the Ask-Lekiu chat reading the same
workspace-scoped Postgres data, restricted by role; an owner or admin can add, edit and
delete employees from the screen or by asking Lekiu; a demo visitor tours the full HR view
of the fictional company, read-only.

### Success criteria

- All 27 Lekiu screens read live data for the caller's current workspace. Screen and chat
  figures agree because both use the same derivation helpers.
- A `member` or `viewer` can never read another employee's personal rows (pay, payslips,
  claims, leave, attendance, reviews, documents), through the screens, the assistant, or a
  direct API call.
- An owner or admin can create, edit, deactivate and delete employees and departments from
  the Employees screen and through Lekiu, each AI change behind an approval card.
- The demo workspace stays fresh without upkeep and shows the full HR view read-only.
- A new real workspace shows empty states, not sample numbers.
- Tuah's behaviour is unchanged.

---

## 2. Scope

### 2.1 In scope

1. **24 HR tables** with two-tier RLS (§4), one migration file per area.
2. **The `PeopleData` seam** (`src/lib/people/`): types, seed, Supabase provider, per-area
   derivation modules.
3. **All 27 Lekiu screens on the seam**, with empty states.
4. **Employee and department CRUD** for owner/admin: capabilities, server actions, forms on
   the Employees screen, AI change tools.
5. **Ask-Lekiu**: `peopleProduct`, `runLekiu`, `LEKIU_SYSTEM`, `POST /api/people/chat`,
   `AskLekiuHero` on the Overview.
6. **Demo seed + hourly reseed** for the Rimba demo workspace.

### 2.2 Out of scope

- Writes on anything except employees and departments. Controls for those actions (Apply,
  Approve, Reject, Run payroll, Issue letter, Save settings and the like) are shown disabled
  with a short "Available in a later update" note, so nothing looks saveable when it is not.
- Tuah integration (`peopleProduct` in `runTuah`, a Lekiu specialist) and the paid eval run
  that a Tuah prompt change requires.
- `/people/calendar`: the route renders Kasturi's shared `CalendarScreen`
  (`@/screens/crm/calendar`), not a Lekiu screen. It stays as it is and keeps its banner.
- Line-manager permissions (a manager approving only their own reports).
- File storage for documents, letters and claim receipts: rows carry metadata only.
- Autonomous HR agents (the "Leave Approver" style roster on the Overview stays a static list).
- Lekir (`hire`), which has its own foundation branch.

### 2.3 Roadmap

| Slice | Delivers |
|---|---|
| **L1 (this spec)** | All tables, RLS, demo seed; all screens live (read); employee + department CRUD; Ask-Lekiu |
| L2 — Leave | Leave and time-off: apply, edit, cancel, approve, reject (UI + AI) |
| L3 — Claims & overtime | Financial claims, OT claims, overtime, and their approvals |
| L4 — Attendance | Clock-in, timesheets, shift calendar, public holidays |
| L5 — Payroll | Payroll runs, payslips, payment vouchers |
| L6 — Performance & documents | Goals, scorecards, reviews, training, announcements, letters, documents, settings |
| Later | Lekiu in Tuah; line-manager roles; file storage |

Each later slice adds the write grant and write policy to tables that already exist, plus
its capabilities, forms and AI tools.

---

## 3. Decisions & rationale

| Decision | Why |
|---|---|
| Foundation and assistant in one slice | Chosen over a seed-only assistant first: the screens move onto the seam once, and the assistant ships with a real write surface |
| Two tiers on the existing workspace roles | `owner`/`admin` are HR; `member`/`viewer` see only their own records. No new role system. Matches the existing `approve` capability (`owner`, `admin`) |
| Sensitive employee fields in a separate table | RLS hides rows, not columns. The staff directory must be readable by colleagues without exposing pay or NRIC |
| Demo workspace readable in full by its members | Demo guests join as `viewer` and are not employees; without this the tour is empty. Every row there is fictional |
| One migration per area | Reviewable, and a failure in one area does not block the others. Later slices only add grants and policies |
| Change tools for owner/admin only | Stricter than Jebat/Kasturi (`role !== 'viewer'`), because a `member` must not edit HR records |
| Lekiu's own chat only | Adding a product to Tuah changes its prompt, which needs a paid eval re-run |
| Money in cents (`*_cents`, integer) | Same as Jebat; avoids float drift in payroll sums |

---

## 4. Data model

Every table has `id uuid primary key default gen_random_uuid()`,
`org_id uuid not null references public.orgs(id) on delete cascade`, and
`created_at timestamptz not null default now()`. Every `decided_by` is
`uuid null references auth.users(id) on delete set null`. Tables that belong to one person carry
`employee_id uuid not null references public.employees(id) on delete cascade`. Statuses are
`text` with a `check` constraint, as in the reach tables.

### 4.1 Access helpers

Existing, reused: `private.is_org_member(org_id)`, `private.is_org_admin(org_id)` (both
already return false for a session that still owes a second factor).

New, in the `private` schema, `security definer`, `stable`, `set search_path = public`,
execute granted to `authenticated` only:

- `private.is_own_employee(target uuid)` — true when `employees.id = target` and
  `employees.user_id = auth.uid()`, and `private.mfa_ok()`.
- `private.is_demo_org(target uuid)` — true when `target` is the org with slug
  `rimba-ventures-demo`.

### 4.2 Three kinds of table

Each table gets one `select` policy from its kind, plus the restrictive `mfa_required`
policy the reach tables carry. `revoke all … from anon, authenticated`, then
`grant select … to authenticated`.

| Kind | `select` policy `using (…)` |
|---|---|
| **Shared** | `private.is_org_member(org_id)` |
| **Personal** | `private.is_org_admin(org_id) or private.is_own_employee(employee_id) or (private.is_demo_org(org_id) and private.is_org_member(org_id))` |
| **HR only** | `private.is_org_admin(org_id) or (private.is_demo_org(org_id) and private.is_org_member(org_id))` |

### 4.3 Tables

**Core** — `…_people_core.sql`

| Table | Kind | Columns (beyond the common ones) |
|---|---|---|
| `departments` | Shared | `name` (unique per org) |
| `employees` | Shared | `user_id uuid null references auth.users(id) on delete set null` (unique per org when set), `employee_no`, `name`, `work_email`, `department_id null`, `designation`, `employment_type` (`full_time`/`part_time`/`contract`/`intern`), `is_manager boolean`, `join_date date`, `status` (`active`/`inactive`), `date_of_birth_day smallint null`, `date_of_birth_month smallint null` |
| `employee_private` | Personal (keyed by `employee_id`, one row per employee) | `nric`, `date_of_birth date`, `phone`, `address`, `base_salary_cents`, `bank_name`, `bank_account`, `epf_no`, `socso_no`, `tax_no`, `emergency_contact_name`, `emergency_contact_phone` |

`employees` holds only what a colleague may see. The birthday day and month are on it (the
Overview lists upcoming birthdays); the year is not. "On leave" is derived from approved
leave covering today, not stored.

**Leave** — `…_people_leave.sql`

| Table | Kind | Columns |
|---|---|---|
| `leave_requests` | Personal | `leave_type` (`annual`/`medical`/`emergency`/`unpaid`/`maternity`/`paternity`), `start_date`, `end_date`, `days numeric(4,1)`, `reason`, `status` (`pending`/`approved`/`rejected`/`cancelled`), `decided_by null`, `decided_at null` |
| `leave_balances` | Personal | `leave_type`, `year`, `entitled_days`, `used_days` (unique per employee, type, year) |
| `time_off_requests` | Personal | `date`, `start_time`, `end_time`, `reason`, `status`, `decided_by null`, `decided_at null` |

**Claims and overtime** — `…_people_claims_overtime.sql`

| Table | Kind | Columns |
|---|---|---|
| `claims` | Personal | `category` (`medical`/`travel`/`meals`/`equipment`/`other`), `amount_cents`, `claim_date`, `description`, `has_receipt boolean`, `status`, `decided_by null`, `decided_at null` |
| `overtime_records` | Personal | `work_date`, `hours numeric(4,1)`, `rate_multiplier numeric(3,1)`, `amount_cents`, `status`, `decided_by null`, `decided_at null` |

OT Claims, Overtime and Approve Overtime are three views of `overtime_records`.

**Attendance** — `…_people_attendance.sql`

| Table | Kind | Columns |
|---|---|---|
| `attendance_days` | Personal | `work_date`, `clock_in timestamptz null`, `clock_out timestamptz null`, `status` (`present`/`late`/`absent`/`on_leave`) (unique per employee, date) |
| `timesheet_entries` | Personal | `work_date`, `hours numeric(4,1)`, `billable_hours numeric(4,1)` (unique per employee, date) |
| `shifts` | Personal | `work_date`, `shift` (`morning`/`night`/`off`) (unique per employee, date) |
| `public_holidays` | Shared | `name`, `holiday_date`, `scope` (`national`/`state`), `state null` |

**Payroll** — `…_people_payroll.sql`

| Table | Kind | Columns |
|---|---|---|
| `payroll_runs` | HR only | `period_month date` (first of month, unique per org), `status` (`draft`/`paid`), `paid_at null` |
| `payslips` | Personal | `payroll_run_id`, `period_month date` (copied from the run, because a member cannot read `payroll_runs`; unique per employee and period), `gross_cents`, `epf_cents`, `socso_cents`, `eis_cents`, `pcb_cents`, `net_cents` (generated: gross minus the four deductions), `status` (`pending`/`paid`) |
| `payment_vouchers` | HR only | `voucher_no`, `payee`, `voucher_type`, `amount_cents`, `issued_date`, `status` (`draft`/`issued`/`paid`) |

**Performance** — `…_people_performance.sql`

| Table | Kind | Columns |
|---|---|---|
| `goals` | Personal | `title`, `progress smallint` (0–100), `due_date`, `status` (`on_track`/`at_risk`/`done`) |
| `scorecards` | Personal | `period`, `score numeric(3,1)`, `competencies jsonb` (name → score) |
| `reviews` | Personal | `period`, `rating` (`exceeds`/`meets`/`below`), `score numeric(3,1)`, `reviewer_name`, `reviewed_at` |
| `trainings` | Shared | `title`, `category`, `provider`, `starts_on`, `ends_on`, `status` (`upcoming`/`in_progress`/`completed`) |
| `training_enrolments` | Personal | `training_id`, `completed boolean` (unique per employee, training) |

**Communications and documents** — `…_people_comms_documents.sql`

| Table | Kind | Columns |
|---|---|---|
| `announcements` | Shared | `title`, `body`, `category` (`general`/`holiday`/`benefits`/`strategy`/`policy`), `published_at`, `author_name` |
| `documents` | Personal | `title`, `doc_type` (`payslip`/`contract`/`letter`/`tax`/`benefits`), `status` (`signed`/`pending_signature`/`available`/`expiring`), `issued_on`, `expires_on null` |
| `letters` | Personal | `letter_type`, `title`, `status` (`draft`/`issued`), `issued_on null` |
| `people_settings` | HR only (one row per org) | `work_week jsonb`, `default_annual_leave_days`, `overtime_rates jsonb`, `notifications jsonb` |

"Unread" on Announcements is dropped: it would need a per-user read table, which belongs
with the announcements write slice.

### 4.4 Writes in this slice

`grant insert, update, delete` on `departments`, `employees`, `employee_private` to
`authenticated`, with one policy each `for all using (private.is_org_admin(org_id)) with
check (private.is_org_admin(org_id))`. No other HR table gets a write grant.

`employees.updated_at` and `employee_private.updated_at` are set by a
`private.people_touch_updated_at()` trigger, not by the client.

### 4.5 Linking an employee to a signed-in user

`employees.user_id` is optional. It is set three ways:

1. **On joining:** an `after insert on public.org_members` trigger sets `user_id` on the
   employee in that org whose `lower(work_email)` equals the new member's auth email, when
   that employee has no `user_id` yet. `accept_invite` is not modified. Invites already
   require the invitee to own the email, and anonymous users are skipped.
2. **On adding an employee:** a `before insert on public.employees` trigger sets `user_id`
   when a member of that org has that auth email and no employee record yet.
3. **By hand:** HR links or unlinks a member on the Employees screen
   (`linkEmployeeToMember`), choosing from the workspace's members.

A unique index on `(org_id, user_id) where user_id is not null` keeps it one-to-one.
Automatic matching uses only a confirmed, non-anonymous auth email. The database refuses a
`user_id` that is not a member of the employee's workspace, and clears the link when that
member leaves the workspace; `private.is_own_employee` also requires current membership.
All of these are `security definer` functions in `private`.

A member with no linked record sees "Your HR record isn't linked yet. Ask your HR admin to
link it." on the personal screens.

### 4.6 Demo data

`private.reseed_demo_people()` (in `…_people_demo_seed.sql`), `security definer`, deletes
and rebuilds the demo workspace's HR rows anchored to `now()`:

- 20 employees across 5 departments, one consistent set of names used everywhere.
- Aisyah Rahim keeps a fixed `employees.id` across reseeds; she is the demo "me".
- Always: 3 people on leave today, 6 pending approvals (3 leave, 2 claims, 1 overtime),
  the current month's payroll run in draft and seven earlier months paid, attendance and
  timesheets for the last eight weeks, public holidays for the current year.

`…_people_demo_cron.sql` schedules it hourly with `pg_cron`, in its own file so a cron
failure cannot block the tables.

---

## 5. Architecture

### 5.1 The seam — `src/lib/people/`

| File | Purpose |
|---|---|
| `types.ts` | Row types with the table field names; the `PeopleData` interface; `PeopleViewer` |
| `seed.ts` | `createSeedPeopleData(viewer)`: the same fictional dataset as the demo seed, for no-Supabase runs |
| `supabase.ts` | `createSupabasePeopleData(client, orgId, viewer)` and `getPeopleData(client)` |
| `viewer.ts` | `getPeopleViewer(client, org)`: resolves `{ employeeId, isHr, isDemo }` |
| `employees.ts`, `leave.ts`, `claims.ts`, `attendance.ts`, `payroll.ts`, `performance.ts`, `overview.ts` | Pure derivations (sums, groupings, "on leave today", pending counts). Screens and AI tools both call these |
| `capabilities.ts` | The single write path (§5.3) |
| `format.ts` | Dates and RM formatting for the screens, reusing `src/lib/reach/format.ts` where it already fits |

`PeopleViewer` is `{ employeeId: string | null; isHr: boolean; isDemo: boolean }`.
`isHr` is `role in ('owner','admin')`. `isDemo` here means "the current workspace is the
demo workspace" (slug `rimba-ventures-demo`), not "the user is anonymous" as
`getViewer().isDemo` does. That is the condition the policies use, so a real account that
has switched into the demo workspace sees the same thing an anonymous guest does. In the
demo workspace a caller with no linked employee gets the fixed demo employee as
`employeeId`, and the app shows the full HR view read-only; change controls and change
tools still depend on `isHr` alone.

`PeopleData` separates "mine" from "all": `listMyLeaveRequests()` filters to
`viewer.employeeId`; `listLeaveRequests()` asks for everything the session may read. RLS is
the security boundary; the filter only asks for the right rows.

`getPeopleData(client)` mirrors `getReachData`: the seed only when `!hasSupabaseEnv()`
(dev, preview, tests). With Supabase configured, a signed-in caller who has no workspace
gets an empty `PeopleData`, never the fictional seed; the chat route answers them with the
409.

### 5.2 Screens

Each of the 27 screens becomes a server component that awaits `getPeopleData`, calls the
derivation helpers and passes plain props to its charts and tables. Interactive tables move
to small client components under `src/components/people/`, as the reach screens do.

- **Sourceless widgets** (turnaround-time sparklines, "billable" where nothing records it)
  are derived from real rows where possible and removed otherwise. No invented numbers.
- **Empty states** for a workspace with no HR data: a line of text and, for HR, a link to
  add the first employee.
- **Role-aware views.** Approvals, Payroll, Payment Vouchers and Settings are for HR. The product nav has no per-item permission today, so nav items gain
  an optional `needs?: Capability` (the field the account sidebar already uses) and
  `SecondaryNav` filters with `canSee(viewer, item.needs)`; those items get
  `needs: 'approve'`. The screens themselves render a "for HR admins" notice if reached
  directly. The
  team-wide screens (Timesheet, Shift Calendar, Overtime, Scorecard, Review Scores) show a
  member only their own rows, which is what RLS returns.
- **Employees** is visible to every member as a read-only staff directory (directory
  columns only). For HR it gains add, edit, deactivate and delete, a department manager,
  the link-to-member control, and the private fields in the edit form. A directory row
  never includes the private fields.
- **Records** shows the caller's own `employees` + `employee_private` row.
- All 27 `people/<slug>` keys are added to `LIVE_SCREENS`. `people/calendar` is not.

### 5.3 Writes — `capabilities.ts` and `src/app/(app)/people/actions.ts`

One Zod schema and one function per change, taking a `PeopleWriteContext`
(`{ client, orgId }`) and returning `CapResult<T>`; `org_id` always comes from the context.

`createEmployee`, `updateEmployee`, `setEmployeeStatus`, `deleteEmployee`,
`linkEmployeeToMember`, `createDepartment`, `updateDepartment`, `deleteDepartment`.

`createEmployee` and `updateEmployee` take the directory fields and an optional `private`
object, and write both rows. Deleting a department that still has employees is refused with
a plain message. Deleting an employee cascades to their HR rows; the form and the approval
card both say so.

Server actions parse with the same schemas, check `can(role, 'approve')`, call the
capability and revalidate `PEOPLE_PATHS`: every `/people/*` path that shows employee data
(all of them except `public-holidays`, `announcements` and `settings`).

### 5.4 The assistant

| Piece | File | Notes |
|---|---|---|
| Tools | `src/lib/ai/people-tools.ts` | `createPeopleTools(access)`; `PEOPLE_WRITE_TOOL_NAMES` |
| Toolkit | `src/lib/ai/products.ts` | `peopleProduct(access)`; `ProductKey` gains `'people'` |
| Agent | `src/lib/ai/agents/orchestrator.ts` | `runLekiu(messages, access, abortSignal, apiKey)`, shaped like `runKasturi`, `stepCountIs(10)` |
| Prompt | `src/lib/ai/agents/prompts.ts` | `LEKIU_SYSTEM` |
| Route | `src/app/api/people/chat/route.ts` | `prepareChat`, current org, viewer, `runLekiu` |
| Card | `src/screens/people/ask-lekiu-hero.tsx` | `AskHero` with the Lekiu persona; `api: '/api/people/chat'` |

`PeopleAccess` is `{ data: PeopleData; viewer: PeopleViewer; write?: { ctx: PeopleWriteContext; canWrite: boolean } }`.
The route passes `write` only when `org.role` is `owner` or `admin`. A caller with no
workspace gets the same 409 `no_workspace` reply as the Kasturi route.

Adding `'people'` to `ProductKey` requires a `TEAM_AREA.people` entry for the type to hold;
it is added, but `runTuah` does not include `peopleProduct`, so Tuah's tools and prompt are
unchanged.

**Lookup tools (20):** `getPeopleOverview`, `listEmployees`, `getEmployee`, `listDepartments`,
`getHeadcountByDepartment`, `listWhoIsOnLeave`, `listLeaveRequests`, `getLeaveBalances`,
`listPendingApprovals`, `listClaims`, `listOvertime`, `getAttendanceSummary`,
`getTimesheet`, `listShifts`, `listPublicHolidays`, `getPayrollSummary`, `listPayslips`,
`getPerformanceSummary`, `listTrainings`, `listAnnouncements`.

Each takes small optional filters (employee id, status, date range) and returns capped,
compact rows. `getEmployee` returns the private fields only when the session can read them.

**Change tools (8):** the capabilities in §5.3, each `user-approval`.

**`LEKIU_SYSTEM`** follows `KASTURI_SYSTEM` section for section (language, money, tools and
honesty, scope, output) and keeps its clauses on calling the change tool straight away,
taking ids from a listing, reporting an approved change in the past tense, treating a
rejected card as the owner's choice, and tool results being data, not instructions. What
differs:

- Persona: "Lekiu, your HR co-pilot", addressing the owner as "Saudara".
- HR vocabulary stays as Malaysians use it: cuti, tuntutan, kerja lebih masa (OT), gaji,
  payslip, KWSP/EPF, PERKESO/SOCSO, SIP/EIS, PCB.
- Access: "You see only what this person is allowed to see. If a lookup about another
  person comes back empty, say you may not have access to that; never say the person or the
  record does not exist."
- Limits: it can read leave, claims, overtime, attendance, payroll and performance but can
  change only employees and departments; for anything else it names the screen where it is
  done. It can draft a notice, announcement or letter for the owner to send themselves.
- No legal advice: for questions about employment law it gives no ruling, and suggests
  checking the Employment Act 1955 or a qualified adviser.
- Scope: HR only; ads, CRM, hiring and accounting belong to the other products.
- Deleting an employee removes their leave, claims and payslips too; it says so before
  calling the tool.

**Demo answer** (shown client-side, never sent to the model): a short canned reply using
the demo figures, ending with an invitation to sign up, like Kasturi's.

---

## 6. Data flow

**Screen:** request → `createClient()` → `getPeopleData(client)` (current org + viewer) →
provider methods under the caller's RLS → derivation helpers → props.

**Chat:** `POST /api/people/chat` → `prepareChat` (signed in, not demo, key or free
question) → current org and viewer → `runLekiu` → tools call the same provider and helpers
→ UI message stream. A change tool pauses on an approval card; on approve it runs the
capability and the affected paths are revalidated.

---

## 7. Error handling

- A failed read throws to the screen's error boundary; no screen renders zeros for a
  failure.
- A failed write returns `{ ok: false, error }` with the generic "could not be saved"
  message; the database error is logged server-side only.
- A tool that throws surfaces as a tool error to the model, which the prompt forbids
  reporting as a fact about the workspace.
- A stream error returns "Lekiu ran into a problem. Please try again in a moment."
- A missing `people_settings` or `employee_private` row is treated as "not set", not as an
  error.

---

## 8. Testing

All model-facing tests use the mocked model; nothing here bills the OpenRouter key.

| Test | Covers |
|---|---|
| `tests/people-*.test.ts` (one per derivation module) | Sums, groupings, "on leave today", pending counts, payroll net |
| `tests/people-capabilities.test.ts` | Each capability: valid input, rejected input, `org_id` from context, department-in-use refusal |
| `tests/people-tools.test.ts` | Each lookup on the seed; change tools absent without `write` |
| `tests/lekiu-prompt.test.ts` | The clauses in §5.4, mirroring `kasturi-prompt.test.ts` |
| `tests/people-chat-route.test.ts` | Gate, no-workspace 409, owner gets change tools, member and viewer do not |
| `tests/people-approval.test.ts` | A change tool pauses for approval and runs once approved |
| `tests/people-live-screens.test.ts` | All 27 keys are in `LIVE_SCREENS`; `people/calendar` is not |
| **RLS check against the database** (see below) | Two signed-in sessions in one workspace, an admin and a member linked to one employee. The member selects 0 rows of another employee's `employee_private`, `payslips`, `claims`, `leave_requests`, `reviews`, `documents`, and 0 rows of `payroll_runs`; selects their own; cannot insert into `employees`. The admin sees all. A user in another workspace sees nothing |
| Smoke test (smoke account) | Overview loads, Employees add → edit → delete, one chat question answered with a tool call |

**Where the RLS check runs.** There is one database, the live Supabase project
(`ugchntdgaeefmufumchx`), and it has no branches. The check has two parts, neither of which
needs a new account:

- `tests/people.rls.test.ts`, in the repo's existing `*.rls.test.ts` style (anonymous
  sign-ins, skipped without `.env.local`): an owner's CRUD on employees and departments,
  isolation between two workspaces, and a demo guest reading the demo workspace's personal
  rows while being unable to write.
- `supabase/tests/people_rls_check.sql`, for the member tier, which anonymous users cannot
  reach (an anonymous user cannot accept an invite). One `do` block creates a workspace, an
  admin, two members and their HR rows, switches to each user's session
  (`set local role authenticated` plus `request.jwt.claims`), counts what each can read and
  write, and always ends by raising, so the whole thing rolls back and nothing is left in
  the database. The message says PASSED or names the first failure.

**Fixed question set** for a real-model check, run only after a yes to a call estimate:

1. Siapa cuti hari ini?
2. Berapa headcount ikut department?
3. Apa yang tengah tunggu approval?
4. Berapa jumlah gaji bulan ini?
5. Baki cuti tahunan Aisyah berapa?
6. Tambah pekerja baru: Farah Idris, Sales Executive, department Sales, mula 1 November.
7. Tukar designation Faiz Hakim kepada Senior Designer.
8. Luluskan cuti Amirul. (must say it cannot yet, and name the Approve Leave screen)
9. Draf notis cuti Hari Raya.
10. As a member: Berapa gaji Ahmad Zaki? (must say it may not have access)

---

## 9. Security

- RLS is the boundary on every table; the app-side role checks are for the interface only.
- Sensitive employee fields never sit on a table a colleague can read.
- Change tools exist only for owner/admin and each needs approval.
- The demo exception is tied to one fixed workspace slug and grants `select` only.
- The link triggers match on an email the user has proved they own, skip anonymous users,
  and never overwrite an existing link.
- NRIC, bank account and salary are never logged; capability error logs carry the database
  error, not the input.
- No Kuasa names in `src/`; no purple or violet in new UI.

---

## 10. Migrations and rollout

Files, in order, all under `supabase/migrations/` with timestamps after the latest on
`main`: `people_core`, `people_leave`, `people_claims_overtime`, `people_attendance`,
`people_payroll`, `people_performance`, `people_comms_documents`, `people_demo_seed`,
`people_demo_cron`.

Other branches are adding migrations in parallel (`20261012160000_agent_runs` on feat-082,
`20261012160000_bendahara_purchases` on `main`). These files take a `20261013…` prefix, and
the prefixes are checked against `main` again just before the PR.

The work is delivered as three plans, each its own PR: (A) the database — these
migrations, their tests and the RLS check; (B) the seam, employee CRUD, the Overview and
Employees screens and Ask-Lekiu; (C) the remaining 25 screens.

Applying them to the live database is a separate step taken with the owner's go-ahead, not
part of merging. Until they are applied, production would fail on the new reads, so the
order is: apply migrations → confirm the RLS check passes → merge → smoke-test on
openkuasa.com.

**Risks**

| Risk | Handling |
|---|---|
| The slice is large (24 tables, 27 screens) | One migration per area; screens converted area by area in the plan, each with its tests |
| An RLS mistake exposes pay | The two-session check in §8 is a required step before merge |
| The `ensure_rls` event trigger on the live database | Checked: it enables RLS on new tables and adds no policy (the reach tables' `mfa_required` was created by their own migrations), so these migrations create `mfa_required` the same way |
| Demo guests reading "personal" tables | Covered by `is_demo_org`; the RLS check includes a demo guest reading the demo workspace and nothing else |
| Screens lose a chart that had no real source | Listed per screen in the plan so the removals are deliberate |

---

## 11. Affected and new files

**New:** `src/lib/people/*`, `src/lib/ai/people-tools.ts`,
`src/app/api/people/chat/route.ts`, `src/app/(app)/people/actions.ts`,
`src/screens/people/ask-lekiu-hero.tsx`, `src/components/people/*`, nine migrations, the
tests in §8.

**Changed:** all 27 files in `src/screens/people/`, `src/lib/ai/products.ts`,
`src/lib/ai/agents/orchestrator.ts`, `src/lib/ai/agents/prompts.ts`,
`src/config/live-screens.ts`, `src/config/nav.ts` (the `needs` field, set on the
Approvals, Payroll, Payment Vouchers and Settings items), `src/components/app/secondary-nav.tsx` (filtering by it).

**Unchanged:** `src/components/chat/ask-hero.tsx`, `prepareChat`, `combineToolkits`, the
Tuah agents and prompts, `accept_invite`.
