# Lekiu Plan A — Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create Lekiu's 24 HR tables in Postgres with two-tier RLS, employee/department write access for admins, employee-to-user linking, and a self-refreshing demo dataset, all verified before any app code reads them.

**Architecture:** Nine migrations, one per area. The first defines the access helpers and a `private.people_secure_table(table, kind)` procedure that every later file calls, so each table's read rule comes from one place: `shared` (any member), `personal` (HR, or the employee themselves), `hr` (HR only), with the demo workspace readable in full by its members. Only `departments`, `employees` and `employee_private` get write grants. Verification is three layers: string tests on the SQL (every run), `*.rls.test.ts` against the live project (anonymous sign-ins), and one self-rolling-back SQL script for the member tier.

**Tech Stack:** Postgres 15+ on Supabase (RLS, `pg_cron`), Vitest, `@supabase/supabase-js`. Migrations applied through the `openkuasa-supabase` MCP.

**Spec:** `docs/superpowers/specs/2026-10-10-lekiu-foundation-chat-design.md` (§4 is the data model; read it alongside this plan). This is plan A of three; B (seam, employee CRUD, Ask-Lekiu) and C (remaining screens) are written after this lands.

**Dry run (2026-10-10):** the SQL in Tasks 1–8 and the check in Task 9 were run on a throwaway local Postgres 14 with stubbed `auth`/tenancy objects. All eight migrations applied, the check reported `PASSED`, and it reported `FAILED` when a leaky policy was added to `payslips` on purpose. `pg_cron`, the real `auth.users` columns and the live project's existing triggers were not part of that run; Task 10 is where those are met for the first time.

## Global Constraints

- **Workspace:** worktree `.claude/worktrees/feat-085-lekiu-foundation-chat`, branch `feat-085-lekiu-foundation-chat`. Both exist. Do not create another branch.
- **Supabase project:** `ugchntdgaeefmufumchx`, through the **`openkuasa-supabase`** MCP only. Not the `supabase`, `supabase-postvote` or `claude_ai_Supabase` MCPs, and not the `supabase-migrations` skill (all other projects).
- **Applying to the live database needs the owner's explicit go-ahead** (Task 10). Tasks 1–9 only write files.
- **GitHub identity:** `OpenKuasa`. Run `gh api user --jq .login` and confirm before any push or `gh` call.
- **Migration prefix:** `20261013090000` … `20261013090800`. Before the PR, check no file on `origin/main` shares a prefix.
- **Every table:** `id uuid primary key default gen_random_uuid()`, `org_id uuid not null references public.orgs(id) on delete cascade`, `created_at timestamptz not null default now()`, and one call to `private.people_secure_table`. No table is secured by hand.
- **Write grants exist only in `20261013090000_people_core.sql`**, and only on `departments`, `employees`, `employee_private`.
- **Foreign keys to `departments`/`employees` are composite** (`(employee_id, org_id) references public.employees(id, org_id)`) so a row can never point across workspaces. The `departments` reference uses the default `no action`, never `restrict`: `restrict` would stop a workspace from being deleted.
- **Money** is `bigint` cents in a `*_cents` column.
- **Demo data is fictional:** Rimba Ventures, `@openkuasa.com` addresses. No Kuasa names.
- **Tests:** `pnpm vitest run --dir tests <file>`. `pnpm` only.
- **Commits:** one per task, as written in each task's last step.

## Review Focus

- **A removed member keeps reading their own HR rows.** Someone taken out of the workspace must lose their payslips at once. → Task 1 (`is_own_employee` requires membership; unlink trigger), checked in Task 9.
- **HR links an employee to a user outside the workspace** (a typo'd id, or a hand-built request). The database must refuse. → Task 1 (link guard), checked in Task 9.
- **Deleting a workspace that has HR data.** It must go through, cascading everything. → Task 1 (`no action`, not `restrict`), checked in Task 9.
- **The hourly demo reseed runs many times.** Counts must stay exact (20 employees, 3 on leave today, 6 pending) and the demo employee's id must not change. → Task 8, checked in Task 9.
- **A demo guest who is also in a real workspace, or a real user who also joined the demo.** Demo membership must open the demo workspace only. → Task 1 (`is_demo_org` is always paired with `is_org_member`), checked in Task 9.

---

### Task 1: Core — helpers, departments, employees, employee_private

**Files:**
- Create: `supabase/migrations/20261013090000_people_core.sql`
- Create: `tests/people-schema.test.ts`

**Interfaces:**
- Consumes: `private.is_org_member(uuid)`, `private.is_org_admin(uuid)`, `private.mfa_ok()`, `public.orgs`, `public.org_members`, `auth.users`.
- Produces: `private.is_own_employee(uuid)`, `private.is_demo_org(uuid)`, `private.people_secure_table(text, text)` with kinds `'shared' | 'personal' | 'hr'`, `private.people_touch_updated_at()`; tables `public.departments`, `public.employees`, `public.employee_private`; unique keys `departments(id, org_id)` and `employees(id, org_id)` for later composite foreign keys. Later tasks append to the `TABLES` array in `tests/people-schema.test.ts`.

- [ ] **Step 1: Write the failing test** — `tests/people-schema.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

type Kind = 'shared' | 'personal' | 'hr';

const DIR = join(process.cwd(), 'supabase/migrations');
const CORE = '20261013090000_people_core.sql';

/** Every Lekiu table, the file that creates it, and who may read it. */
const TABLES: { file: string; table: string; kind: Kind }[] = [
  { file: CORE, table: 'departments', kind: 'shared' },
  { file: CORE, table: 'employees', kind: 'shared' },
  { file: CORE, table: 'employee_private', kind: 'personal' },
];

const sql = (file: string) => readFileSync(join(DIR, file), 'utf8');

describe('Lekiu schema', () => {
  test.each(TABLES)('$table is created and secured as $kind', ({ file, table, kind }) => {
    const text = sql(file);
    expect(text).toContain(`create table public.${table} (`);
    expect(text).toContain(`select private.people_secure_table('${table}', '${kind}');`);
  });

  test.each(TABLES)('$table belongs to a workspace', ({ file, table }) => {
    const text = sql(file);
    const start = text.indexOf(`create table public.${table} (`);
    const body = text.slice(start, text.indexOf('\n);', start));
    expect(body).toContain('references public.orgs(id) on delete cascade');
  });

  test('a table with employee_id cannot point at another workspace', () => {
    for (const { file, table } of TABLES) {
      const text = sql(file);
      const start = text.indexOf(`create table public.${table} (`);
      const body = text.slice(start, text.indexOf('\n);', start));
      if (!body.includes('employee_id uuid')) continue;
      expect(body, table).toContain(
        'foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade',
      );
    }
  });

  test('the three read rules are the ones in the spec', () => {
    const text = sql(CORE);
    expect(text).toContain("when 'shared' then 'private.is_org_member(org_id)'");
    expect(text).toContain(
      "when 'personal' then 'private.is_org_admin(org_id) or private.is_own_employee(employee_id) "
        + "or (private.is_demo_org(org_id) and private.is_org_member(org_id))'",
    );
    expect(text).toContain(
      "when 'hr' then 'private.is_org_admin(org_id) "
        + "or (private.is_demo_org(org_id) and private.is_org_member(org_id))'",
    );
    expect(text).toContain('create policy mfa_required on public.%I as restrictive');
    expect(text).toContain("execute format('revoke all on public.%I from anon, authenticated', t)");
  });

  test('only the core file grants writes, and only to admins', () => {
    const files = [...new Set(TABLES.map((t) => t.file))];
    for (const file of files) {
      const grants = sql(file).match(/grant (insert|update|delete)[^;]*;/g) ?? [];
      if (file === CORE) {
        for (const g of grants) expect(g).toMatch(/on public\.(departments|employees|employee_private) to authenticated;/);
      } else {
        expect(grants, file).toEqual([]);
      }
    }
    const core = sql(CORE);
    for (const table of ['departments', 'employees', 'employee_private']) {
      expect(core).toContain(
        `create policy ${table}_write on public.${table} for all to authenticated\n`
          + '  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));',
      );
    }
  });

  test('pay and identity fields are not on the directory table', () => {
    const text = sql(CORE);
    const start = text.indexOf('create table public.employees (');
    const directory = text.slice(start, text.indexOf('\n);', start));
    for (const column of ['nric', 'base_salary_cents', 'bank_account', 'address', 'date_of_birth date']) {
      expect(directory).not.toContain(column);
    }
  });

  test('own-record access needs current membership, and links are guarded', () => {
    const text = sql(CORE);
    expect(text).toContain('join public.org_members m on m.org_id = e.org_id and m.user_id = e.user_id');
    expect(text).toContain("raise exception 'that user is not a member of this workspace'");
    expect(text).toContain('create unique index employees_org_user_idx on public.employees (org_id, user_id) where user_id is not null');
    expect(text).toContain('after delete on public.org_members');
    expect(text).not.toContain('on delete restrict');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --dir tests people-schema`
Expected: FAIL, `ENOENT: no such file or directory … 20261013090000_people_core.sql`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261013090000_people_core.sql`

```sql
-- Lekiu (people) core: access helpers, departments, employees, employee_private.
-- Two tiers on the workspace roles: owner/admin are HR and read everything;
-- everyone else reads shared tables and only their own personal rows. In the
-- demo workspace every member reads everything (all rows there are fictional).

-- ---- access helpers -------------------------------------------------

create or replace function private.is_demo_org(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.orgs where id = target and slug = 'rimba-ventures-demo'
  );
$$;
revoke execute on function private.is_demo_org(uuid) from public, anon;
grant execute on function private.is_demo_org(uuid) to authenticated;

-- Secures one Lekiu table. Every Lekiu table is secured by a call to this and
-- by nothing else, so the three read rules live in one place.
create or replace function private.people_secure_table(t text, kind text)
returns void language plpgsql set search_path = public as $$
declare rule text;
begin
  rule := case kind
    when 'shared' then 'private.is_org_member(org_id)'
    when 'personal' then 'private.is_org_admin(org_id) or private.is_own_employee(employee_id) or (private.is_demo_org(org_id) and private.is_org_member(org_id))'
    when 'hr' then 'private.is_org_admin(org_id) or (private.is_demo_org(org_id) and private.is_org_member(org_id))'
  end;
  if rule is null then raise exception 'unknown kind %', kind; end if;
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select', t, rule);
  execute format(
    'create policy mfa_required on public.%I as restrictive for all to authenticated '
    || 'using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
  execute format('revoke all on public.%I from anon, authenticated', t);
  execute format('grant select on public.%I to authenticated', t);
end; $$;
revoke all on function private.people_secure_table(text, text) from public, anon, authenticated;

create or replace function private.people_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end; $$;
revoke all on function private.people_touch_updated_at() from public, anon, authenticated;

-- ---- departments ----------------------------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);

-- ---- employees: the staff directory, readable by every member --------
-- Nothing a colleague should not see belongs on this table. Pay, identity
-- numbers and home details are on employee_private.

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  employee_no text not null check (char_length(trim(employee_no)) between 1 and 30),
  name text not null check (char_length(trim(name)) between 1 and 120),
  work_email text check (work_email is null or work_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  department_id uuid,
  designation text,
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time','part_time','contract','intern')),
  is_manager boolean not null default false,
  join_date date,
  status text not null default 'active' check (status in ('active','inactive')),
  date_of_birth_day smallint check (date_of_birth_day between 1 and 31),
  date_of_birth_month smallint check (date_of_birth_month between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, employee_no),
  foreign key (department_id, org_id) references public.departments(id, org_id)
);
create index employees_org_name_idx on public.employees (org_id, name);
create index employees_department_idx on public.employees (department_id);
create unique index employees_org_user_idx on public.employees (org_id, user_id) where user_id is not null;
create unique index employees_org_email_idx on public.employees (org_id, lower(work_email)) where work_email is not null;
create trigger employees_touch before update on public.employees
  for each row execute function private.people_touch_updated_at();

-- True when the employee record is linked to the caller AND the caller is
-- still a member of that workspace. Used by every personal table's read rule.
create or replace function private.is_own_employee(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select private.mfa_ok() and exists (
    select 1
    from public.employees e
    join public.org_members m on m.org_id = e.org_id and m.user_id = e.user_id
    where e.id = target and e.user_id = auth.uid()
  );
$$;
revoke execute on function private.is_own_employee(uuid) from public, anon;
grant execute on function private.is_own_employee(uuid) to authenticated;

-- ---- employee_private: HR and the employee themselves ----------------

create table public.employee_private (
  employee_id uuid primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  nric text,
  date_of_birth date,
  phone text,
  address text,
  base_salary_cents bigint check (base_salary_cents is null or base_salary_cents >= 0),
  bank_name text,
  bank_account text,
  epf_no text,
  socso_no text,
  tax_no text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index employee_private_org_idx on public.employee_private (org_id);
create trigger employee_private_touch before update on public.employee_private
  for each row execute function private.people_touch_updated_at();

select private.people_secure_table('departments', 'shared');
select private.people_secure_table('employees', 'shared');
select private.people_secure_table('employee_private', 'personal');

-- ---- writes: owner/admin only (grant ceiling + policy, added together) --

create policy departments_write on public.departments for all to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
grant insert on public.departments to authenticated;
grant update (name) on public.departments to authenticated;
grant delete on public.departments to authenticated;

create policy employees_write on public.employees for all to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
grant insert on public.employees to authenticated;
grant update (user_id, employee_no, name, work_email, department_id, designation, employment_type,
  is_manager, join_date, status, date_of_birth_day, date_of_birth_month) on public.employees to authenticated;
grant delete on public.employees to authenticated;

create policy employee_private_write on public.employee_private for all to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
grant insert on public.employee_private to authenticated;
grant update (nric, date_of_birth, phone, address, base_salary_cents, bank_name, bank_account,
  epf_no, socso_no, tax_no, emergency_contact_name, emergency_contact_phone) on public.employee_private to authenticated;
grant delete on public.employee_private to authenticated;

-- ---- linking an employee record to a signed-in user ------------------
-- Automatic matching uses only a confirmed, non-anonymous auth email, never
-- runs in the demo workspace, and never replaces an existing link.

create or replace function private.employee_link_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare match uuid;
begin
  if tg_op = 'INSERT' and new.user_id is null and new.work_email is not null
     and not private.is_demo_org(new.org_id) then
    select m.user_id into match
    from public.org_members m
    join auth.users u on u.id = m.user_id
    where m.org_id = new.org_id
      and u.is_anonymous is not true
      and u.email_confirmed_at is not null
      and lower(u.email) = lower(new.work_email)
      and not exists (
        select 1 from public.employees x where x.org_id = new.org_id and x.user_id = m.user_id
      )
    limit 1;
    new.user_id := match;
  end if;
  if new.user_id is not null and not exists (
    select 1 from public.org_members where org_id = new.org_id and user_id = new.user_id
  ) then
    raise exception 'that user is not a member of this workspace';
  end if;
  return new;
end; $$;
revoke all on function private.employee_link_guard() from public, anon, authenticated;
create trigger employees_link_guard before insert or update of user_id on public.employees
  for each row execute function private.employee_link_guard();

create or replace function private.link_employee_on_member_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare addr text;
begin
  if private.is_demo_org(new.org_id) then return new; end if;
  select lower(email) into addr from auth.users
  where id = new.user_id and is_anonymous is not true and email_confirmed_at is not null;
  if addr is null then return new; end if;
  update public.employees e set user_id = new.user_id
  where e.id = (
    select x.id from public.employees x
    where x.org_id = new.org_id and x.user_id is null and lower(x.work_email) = addr
    limit 1
  )
  and not exists (
    select 1 from public.employees y where y.org_id = new.org_id and y.user_id = new.user_id
  );
  return new;
end; $$;
revoke all on function private.link_employee_on_member_join() from public, anon, authenticated;
create trigger org_members_link_employee after insert on public.org_members
  for each row execute function private.link_employee_on_member_join();

create or replace function private.unlink_employee_on_member_leave()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.employees set user_id = null
  where org_id = old.org_id and user_id = old.user_id;
  return old;
end; $$;
revoke all on function private.unlink_employee_on_member_leave() from public, anon, authenticated;
create trigger org_members_unlink_employee after delete on public.org_members
  for each row execute function private.unlink_employee_on_member_leave();
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm vitest run --dir tests people-schema`
Expected: PASS, 11 tests (3 tables × 2 parameterised tests, plus 5).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013090000_people_core.sql tests/people-schema.test.ts
git commit -m "feat(people): core tables, two-tier access helpers and employee-to-user linking"
```

---

### Task 2: Leave — leave_requests, leave_balances, time_off_requests

**Files:**
- Create: `supabase/migrations/20261013090100_people_leave.sql`
- Modify: `tests/people-schema.test.ts` (the `TABLES` array)

**Interfaces:**
- Consumes: `private.people_secure_table(text, text)`, `public.employees(id, org_id)`.
- Produces: tables `public.leave_requests`, `public.leave_balances`, `public.time_off_requests`. Status values `'pending' | 'approved' | 'rejected' | 'cancelled'`; leave types `'annual' | 'medical' | 'emergency' | 'unpaid' | 'maternity' | 'paternity'`.

- [ ] **Step 1: Extend the failing test.** In `tests/people-schema.test.ts`, add below the `CORE` constant:

```ts
const LEAVE = '20261013090100_people_leave.sql';
```

and add to the end of the `TABLES` array:

```ts
  { file: LEAVE, table: 'leave_requests', kind: 'personal' },
  { file: LEAVE, table: 'leave_balances', kind: 'personal' },
  { file: LEAVE, table: 'time_off_requests', kind: 'personal' },
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --dir tests people-schema`
Expected: FAIL, `ENOENT … 20261013090100_people_leave.sql`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261013090100_people_leave.sql`

```sql
-- Lekiu leave: requests, yearly balances and short time-off. Read-only this
-- slice; the leave slice adds the write grants and policies.

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  leave_type text not null
    check (leave_type in ('annual','medical','emergency','unpaid','maternity','paternity')),
  start_date date not null,
  end_date date not null,
  days numeric(4,1) not null check (days > 0),
  reason text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index leave_requests_org_start_idx on public.leave_requests (org_id, start_date desc);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date desc);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  leave_type text not null
    check (leave_type in ('annual','medical','emergency','unpaid','maternity','paternity')),
  year int not null check (year between 2000 and 2100),
  entitled_days numeric(4,1) not null check (entitled_days >= 0),
  used_days numeric(4,1) not null default 0 check (used_days >= 0),
  created_at timestamptz not null default now(),
  unique (employee_id, leave_type, year),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index leave_balances_org_idx on public.leave_balances (org_id, year);

create table public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  off_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index time_off_requests_org_date_idx on public.time_off_requests (org_id, off_date desc);
create index time_off_requests_employee_idx on public.time_off_requests (employee_id, off_date desc);

select private.people_secure_table('leave_requests', 'personal');
select private.people_secure_table('leave_balances', 'personal');
select private.people_secure_table('time_off_requests', 'personal');
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm vitest run --dir tests people-schema`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013090100_people_leave.sql tests/people-schema.test.ts
git commit -m "feat(people): leave, leave balance and time-off tables (read-only)"
```

---

### Task 3: Claims and overtime — claims, overtime_records

**Files:**
- Create: `supabase/migrations/20261013090200_people_claims_overtime.sql`
- Modify: `tests/people-schema.test.ts` (the `TABLES` array)

**Interfaces:**
- Consumes: `private.people_secure_table(text, text)`, `public.employees(id, org_id)`.
- Produces: tables `public.claims`, `public.overtime_records`. Claim categories `'medical' | 'travel' | 'meals' | 'equipment' | 'other'`; both use status `'pending' | 'approved' | 'rejected' | 'cancelled'`.

- [ ] **Step 1: Extend the failing test.** In `tests/people-schema.test.ts`, add below the `LEAVE` constant:

```ts
const CLAIMS = '20261013090200_people_claims_overtime.sql';
```

and add to the end of the `TABLES` array:

```ts
  { file: CLAIMS, table: 'claims', kind: 'personal' },
  { file: CLAIMS, table: 'overtime_records', kind: 'personal' },
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --dir tests people-schema`
Expected: FAIL, `ENOENT … 20261013090200_people_claims_overtime.sql`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261013090200_people_claims_overtime.sql`

```sql
-- Lekiu financial claims and overtime. The OT Claims, Overtime and Approve
-- Overtime screens are three views of overtime_records. Read-only this slice.

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  category text not null check (category in ('medical','travel','meals','equipment','other')),
  amount_cents bigint not null check (amount_cents > 0),
  claim_date date not null,
  description text,
  has_receipt boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index claims_org_date_idx on public.claims (org_id, claim_date desc);
create index claims_employee_idx on public.claims (employee_id, claim_date desc);

create table public.overtime_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  hours numeric(4,1) not null check (hours > 0 and hours <= 24),
  rate_multiplier numeric(3,1) not null default 1.5 check (rate_multiplier >= 1),
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index overtime_records_org_date_idx on public.overtime_records (org_id, work_date desc);
create index overtime_records_employee_idx on public.overtime_records (employee_id, work_date desc);

select private.people_secure_table('claims', 'personal');
select private.people_secure_table('overtime_records', 'personal');
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm vitest run --dir tests people-schema`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013090200_people_claims_overtime.sql tests/people-schema.test.ts
git commit -m "feat(people): claims and overtime tables (read-only)"
```

---

### Task 4: Attendance — attendance_days, timesheet_entries, shifts, public_holidays

**Files:**
- Create: `supabase/migrations/20261013090300_people_attendance.sql`
- Modify: `tests/people-schema.test.ts` (the `TABLES` array)

**Interfaces:**
- Consumes: `private.people_secure_table(text, text)`, `public.employees(id, org_id)`.
- Produces: tables `public.attendance_days` (status `'present' | 'late' | 'absent' | 'on_leave'`), `public.timesheet_entries`, `public.shifts` (shift `'morning' | 'night' | 'off'`), `public.public_holidays` (scope `'national' | 'state'`).

- [ ] **Step 1: Extend the failing test.** In `tests/people-schema.test.ts`, add below the `CLAIMS` constant:

```ts
const ATTENDANCE = '20261013090300_people_attendance.sql';
```

and add to the end of the `TABLES` array:

```ts
  { file: ATTENDANCE, table: 'attendance_days', kind: 'personal' },
  { file: ATTENDANCE, table: 'timesheet_entries', kind: 'personal' },
  { file: ATTENDANCE, table: 'shifts', kind: 'personal' },
  { file: ATTENDANCE, table: 'public_holidays', kind: 'shared' },
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --dir tests people-schema`
Expected: FAIL, `ENOENT … 20261013090300_people_attendance.sql`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261013090300_people_attendance.sql`

```sql
-- Lekiu attendance: daily attendance, timesheets, shifts and public holidays.
-- Read-only this slice.

create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  status text not null check (status in ('present','late','absent','on_leave')),
  created_at timestamptz not null default now(),
  unique (employee_id, work_date),
  check (clock_out is null or clock_in is null or clock_out >= clock_in),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index attendance_days_org_date_idx on public.attendance_days (org_id, work_date desc);

create table public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  hours numeric(4,1) not null check (hours >= 0 and hours <= 24),
  billable_hours numeric(4,1) not null default 0 check (billable_hours >= 0),
  created_at timestamptz not null default now(),
  unique (employee_id, work_date),
  check (billable_hours <= hours),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index timesheet_entries_org_date_idx on public.timesheet_entries (org_id, work_date desc);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  shift text not null check (shift in ('morning','night','off')),
  created_at timestamptz not null default now(),
  unique (employee_id, work_date),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index shifts_org_date_idx on public.shifts (org_id, work_date);

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  holiday_date date not null,
  scope text not null default 'national' check (scope in ('national','state')),
  state text,
  created_at timestamptz not null default now(),
  unique (org_id, holiday_date, name)
);
create index public_holidays_org_date_idx on public.public_holidays (org_id, holiday_date);

select private.people_secure_table('attendance_days', 'personal');
select private.people_secure_table('timesheet_entries', 'personal');
select private.people_secure_table('shifts', 'personal');
select private.people_secure_table('public_holidays', 'shared');
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm vitest run --dir tests people-schema`
Expected: PASS, 29 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013090300_people_attendance.sql tests/people-schema.test.ts
git commit -m "feat(people): attendance, timesheet, shift and public holiday tables (read-only)"
```

---

### Task 5: Payroll — payroll_runs, payslips, payment_vouchers

**Files:**
- Create: `supabase/migrations/20261013090400_people_payroll.sql`
- Modify: `tests/people-schema.test.ts` (the `TABLES` array, one new test)

**Interfaces:**
- Consumes: `private.people_secure_table(text, text)`, `public.employees(id, org_id)`.
- Produces: tables `public.payroll_runs` (status `'draft' | 'paid'`), `public.payslips` (status `'pending' | 'paid'`, generated `net_cents`, own `period_month`), `public.payment_vouchers` (status `'draft' | 'issued' | 'paid'`).

- [ ] **Step 1: Extend the failing test.** In `tests/people-schema.test.ts`, add below the `ATTENDANCE` constant:

```ts
const PAYROLL = '20261013090400_people_payroll.sql';
```

add to the end of the `TABLES` array:

```ts
  { file: PAYROLL, table: 'payroll_runs', kind: 'hr' },
  { file: PAYROLL, table: 'payslips', kind: 'personal' },
  { file: PAYROLL, table: 'payment_vouchers', kind: 'hr' },
```

and add this test inside the `describe` block, after the last test:

```ts
  test('a payslip carries its own month and a derived net pay', () => {
    const text = sql(PAYROLL);
    const start = text.indexOf('create table public.payslips (');
    const body = text.slice(start, text.indexOf('\n);', start));
    // A member cannot read payroll_runs, so the month must be on the payslip.
    expect(body).toContain('period_month date not null');
    expect(body).toContain('unique (employee_id, period_month)');
    expect(body).toContain(
      'net_cents bigint generated always as (gross_cents - epf_cents - socso_cents - eis_cents - pcb_cents) stored',
    );
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --dir tests people-schema`
Expected: FAIL, `ENOENT … 20261013090400_people_payroll.sql`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261013090400_people_payroll.sql`

```sql
-- Lekiu payroll: monthly runs, payslips and payment vouchers. Runs and
-- vouchers are HR only; a payslip is readable by HR and by its employee.
-- Read-only this slice.

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  status text not null default 'draft' check (status in ('draft','paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, period_month),
  unique (id, org_id)
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  payroll_run_id uuid not null,
  period_month date not null check (extract(day from period_month) = 1),
  gross_cents bigint not null check (gross_cents >= 0),
  epf_cents bigint not null default 0 check (epf_cents >= 0),
  socso_cents bigint not null default 0 check (socso_cents >= 0),
  eis_cents bigint not null default 0 check (eis_cents >= 0),
  pcb_cents bigint not null default 0 check (pcb_cents >= 0),
  net_cents bigint generated always as (gross_cents - epf_cents - socso_cents - eis_cents - pcb_cents) stored,
  status text not null default 'pending' check (status in ('pending','paid')),
  created_at timestamptz not null default now(),
  unique (employee_id, period_month),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade,
  foreign key (payroll_run_id, org_id) references public.payroll_runs(id, org_id) on delete cascade
);
create index payslips_org_period_idx on public.payslips (org_id, period_month desc);
create index payslips_run_idx on public.payslips (payroll_run_id);

create table public.payment_vouchers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  voucher_no text not null check (char_length(trim(voucher_no)) between 1 and 30),
  payee text not null,
  voucher_type text not null,
  amount_cents bigint not null check (amount_cents > 0),
  issued_date date not null,
  status text not null default 'draft' check (status in ('draft','issued','paid')),
  created_at timestamptz not null default now(),
  unique (org_id, voucher_no)
);
create index payment_vouchers_org_date_idx on public.payment_vouchers (org_id, issued_date desc);

select private.people_secure_table('payroll_runs', 'hr');
select private.people_secure_table('payslips', 'personal');
select private.people_secure_table('payment_vouchers', 'hr');
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm vitest run --dir tests people-schema`
Expected: PASS, 36 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013090400_people_payroll.sql tests/people-schema.test.ts
git commit -m "feat(people): payroll run, payslip and payment voucher tables (read-only)"
```

---

### Task 6: Performance — goals, scorecards, reviews, trainings, training_enrolments

**Files:**
- Create: `supabase/migrations/20261013090500_people_performance.sql`
- Modify: `tests/people-schema.test.ts` (the `TABLES` array)

**Interfaces:**
- Consumes: `private.people_secure_table(text, text)`, `public.employees(id, org_id)`.
- Produces: tables `public.goals` (status `'on_track' | 'at_risk' | 'done'`), `public.scorecards`, `public.reviews` (rating `'exceeds' | 'meets' | 'below'`), `public.trainings` (status `'upcoming' | 'in_progress' | 'completed'`), `public.training_enrolments`.

- [ ] **Step 1: Extend the failing test.** In `tests/people-schema.test.ts`, add below the `PAYROLL` constant:

```ts
const PERFORMANCE = '20261013090500_people_performance.sql';
```

and add to the end of the `TABLES` array:

```ts
  { file: PERFORMANCE, table: 'goals', kind: 'personal' },
  { file: PERFORMANCE, table: 'scorecards', kind: 'personal' },
  { file: PERFORMANCE, table: 'reviews', kind: 'personal' },
  { file: PERFORMANCE, table: 'trainings', kind: 'shared' },
  { file: PERFORMANCE, table: 'training_enrolments', kind: 'personal' },
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --dir tests people-schema`
Expected: FAIL, `ENOENT … 20261013090500_people_performance.sql`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261013090500_people_performance.sql`

```sql
-- Lekiu performance: goals, scorecards, reviews, and training with
-- enrolments. The training catalogue is shared; who is enrolled is personal.
-- Read-only this slice.

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  progress smallint not null default 0 check (progress between 0 and 100),
  due_date date,
  status text not null default 'on_track' check (status in ('on_track','at_risk','done')),
  created_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index goals_employee_idx on public.goals (employee_id);
create index goals_org_idx on public.goals (org_id);

create table public.scorecards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  period text not null,
  score numeric(3,1) not null check (score between 0 and 5),
  competencies jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (employee_id, period),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index scorecards_org_idx on public.scorecards (org_id, period);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  period text not null,
  rating text not null check (rating in ('exceeds','meets','below')),
  score numeric(3,1) not null check (score between 0 and 5),
  reviewer_name text,
  reviewed_at date,
  created_at timestamptz not null default now(),
  unique (employee_id, period),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index reviews_org_idx on public.reviews (org_id, period);

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  category text,
  provider text,
  starts_on date,
  ends_on date,
  status text not null default 'upcoming' check (status in ('upcoming','in_progress','completed')),
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create index trainings_org_idx on public.trainings (org_id, starts_on desc);

create table public.training_enrolments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  training_id uuid not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (employee_id, training_id),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade,
  foreign key (training_id, org_id) references public.trainings(id, org_id) on delete cascade
);
create index training_enrolments_training_idx on public.training_enrolments (training_id);
create index training_enrolments_org_idx on public.training_enrolments (org_id);

select private.people_secure_table('goals', 'personal');
select private.people_secure_table('scorecards', 'personal');
select private.people_secure_table('reviews', 'personal');
select private.people_secure_table('trainings', 'shared');
select private.people_secure_table('training_enrolments', 'personal');
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm vitest run --dir tests people-schema`
Expected: PASS, 46 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013090500_people_performance.sql tests/people-schema.test.ts
git commit -m "feat(people): goals, scorecard, review and training tables (read-only)"
```

---

### Task 7: Communications and documents — announcements, documents, letters, people_settings

**Files:**
- Create: `supabase/migrations/20261013090600_people_comms_documents.sql`
- Modify: `tests/people-schema.test.ts` (the `TABLES` array, one new test)

**Interfaces:**
- Consumes: `private.people_secure_table(text, text)`, `public.employees(id, org_id)`.
- Produces: tables `public.announcements` (category `'general' | 'holiday' | 'benefits' | 'strategy' | 'policy'`), `public.documents` (doc_type `'payslip' | 'contract' | 'letter' | 'tax' | 'benefits'`; status `'signed' | 'pending_signature' | 'available' | 'expiring'`), `public.letters` (status `'draft' | 'issued'`), `public.people_settings` (one row per org). After this task the `TABLES` array lists all 24 tables.

- [ ] **Step 1: Extend the failing test.** In `tests/people-schema.test.ts`, add below the `PERFORMANCE` constant:

```ts
const COMMS = '20261013090600_people_comms_documents.sql';
```

add to the end of the `TABLES` array:

```ts
  { file: COMMS, table: 'announcements', kind: 'shared' },
  { file: COMMS, table: 'documents', kind: 'personal' },
  { file: COMMS, table: 'letters', kind: 'personal' },
  { file: COMMS, table: 'people_settings', kind: 'hr' },
```

and add this test inside the `describe` block, after the last test:

```ts
  test('all 24 tables are listed, each once', () => {
    const names = TABLES.map((t) => t.table);
    expect(names).toHaveLength(24);
    expect(new Set(names).size).toBe(24);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --dir tests people-schema`
Expected: FAIL, `ENOENT … 20261013090600_people_comms_documents.sql`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261013090600_people_comms_documents.sql`

```sql
-- Lekiu announcements, employee documents, HR letters and HR settings.
-- Documents and letters are records only: no file is stored yet.
-- Read-only this slice.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  body text not null default '',
  category text not null default 'general'
    check (category in ('general','holiday','benefits','strategy','policy')),
  published_at timestamptz not null default now(),
  author_name text,
  created_at timestamptz not null default now()
);
create index announcements_org_published_idx on public.announcements (org_id, published_at desc);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  doc_type text not null check (doc_type in ('payslip','contract','letter','tax','benefits')),
  status text not null default 'available'
    check (status in ('signed','pending_signature','available','expiring')),
  issued_on date,
  expires_on date,
  created_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index documents_employee_idx on public.documents (employee_id, issued_on desc);
create index documents_org_idx on public.documents (org_id);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  letter_type text not null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  status text not null default 'draft' check (status in ('draft','issued')),
  issued_on date,
  created_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade
);
create index letters_employee_idx on public.letters (employee_id);
create index letters_org_idx on public.letters (org_id, created_at desc);

create table public.people_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  work_week jsonb not null default '["mon","tue","wed","thu","fri"]'::jsonb,
  default_annual_leave_days numeric(4,1) not null default 14 check (default_annual_leave_days >= 0),
  overtime_rates jsonb not null default '{"weekday":1.5,"rest_day":2.0,"public_holiday":3.0}'::jsonb,
  notifications jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

select private.people_secure_table('announcements', 'shared');
select private.people_secure_table('documents', 'personal');
select private.people_secure_table('letters', 'personal');
select private.people_secure_table('people_settings', 'hr');
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm vitest run --dir tests people-schema`
Expected: PASS, 55 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013090600_people_comms_documents.sql tests/people-schema.test.ts
git commit -m "feat(people): announcement, document, letter and settings tables (read-only)"
```

---

### Task 8: Demo data — `private.reseed_demo_people()` and its hourly schedule

**Files:**
- Create: `supabase/migrations/20261013090700_people_demo_seed.sql`
- Create: `supabase/migrations/20261013090800_people_demo_cron.sql`
- Create: `tests/people-demo-seed.test.ts`

**Interfaces:**
- Consumes: all 24 tables from Tasks 1–7; the demo workspace `public.orgs.slug = 'rimba-ventures-demo'`.
- Produces: `private.reseed_demo_people()`. Employee ids are `md5('rimba-emp-' || n)::uuid` for `n` in 1..20. **The demo employee (Aisyah Rahim, n = 1) is always `dea97d89-a5b6-f264-bd42-c6df73f664a7`**; plan B's `viewer.ts` uses this constant. Always true after a reseed: 20 active employees in 5 departments (Sales 6, Operations 5, Marketing 3, Finance 3, Management 3); 3 approved leave requests covering today; 6 pending approvals (3 leave, 2 claims, 1 overtime); 8 payroll runs, the current month `draft` and the 7 before it `paid`.

- [ ] **Step 1: Write the failing test** — `tests/people-demo-seed.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const DIR = join(process.cwd(), 'supabase/migrations');
const seed = () => readFileSync(join(DIR, '20261013090700_people_demo_seed.sql'), 'utf8');
const cron = () => readFileSync(join(DIR, '20261013090800_people_demo_cron.sql'), 'utf8');

describe('Lekiu demo seed', () => {
  test('rebuilds only the demo workspace', () => {
    const text = seed();
    expect(text).toContain("select id into demo from public.orgs where slug = 'rimba-ventures-demo'");
    expect(text).toContain("if demo is null then raise exception 'demo org missing'; end if;");
    const deletes = text.match(/delete from public\.\w+[^;]*;/g) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const statement of deletes) expect(statement).toContain('where org_id = demo');
  });

  test('gives every employee a stable id, so the demo employee never changes', () => {
    const text = seed();
    expect(text).toContain("md5('rimba-emp-' || v.n)::uuid");
    expect(text).toContain("(1, 'Aisyah Rahim'");
  });

  test('is anchored to today in Malaysia, not to a fixed date', () => {
    const text = seed();
    expect(text).toContain("today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;");
    expect(text).not.toMatch(/'20\d\d-\d\d-\d\d'/);
  });

  test('cannot be called through the API, and runs once when applied', () => {
    const text = seed();
    expect(text).toContain(
      'revoke all on function private.reseed_demo_people() from public, anon, authenticated;',
    );
    expect(text.trimEnd().endsWith('select private.reseed_demo_people();')).toBe(true);
  });

  test('is scheduled hourly in its own migration', () => {
    const text = cron();
    expect(text).toContain('create extension if not exists pg_cron;');
    expect(text).toContain(
      "select cron.schedule('reseed-demo-people', '15 * * * *', $$select private.reseed_demo_people()$$);",
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run --dir tests people-demo-seed`
Expected: FAIL, `ENOENT … 20261013090700_people_demo_seed.sql`.

- [ ] **Step 3: Write the seed migration** — `supabase/migrations/20261013090700_people_demo_seed.sql`

```sql
-- Demo-workspace HR seed (fictional Rimba Ventures). Idempotent and anchored
-- to today, so the demo always has someone on leave today, approvals waiting
-- and a payroll run for the current month. Runs hourly (next migration).
-- Statutory deductions below are illustrative round figures, not the official
-- contribution tables.
create or replace function private.reseed_demo_people()
returns void language plpgsql security definer set search_path = public as $$
declare
  demo uuid;
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  month_start date;
  week_start date;
  this_year int;
begin
  select id into demo from public.orgs where slug = 'rimba-ventures-demo';
  if demo is null then raise exception 'demo org missing'; end if;
  month_start := date_trunc('month', today)::date;
  week_start := date_trunc('week', today)::date;
  this_year := extract(year from today)::int;

  -- Deleting employees removes every personal row with them.
  delete from public.employees where org_id = demo;
  delete from public.payroll_runs where org_id = demo;
  delete from public.payment_vouchers where org_id = demo;
  delete from public.departments where org_id = demo;
  delete from public.public_holidays where org_id = demo;
  delete from public.trainings where org_id = demo;
  delete from public.announcements where org_id = demo;
  delete from public.people_settings where org_id = demo;

  insert into public.departments (id, org_id, name)
  select md5('rimba-dept-' || d)::uuid, demo, d
  from unnest(array['Sales','Operations','Marketing','Finance','Management']) as d;

  -- 20 employees: Sales 6, Operations 5, Marketing 3, Finance 3, Management 3.
  -- tenure = days since joining; bday = days from today to the next birthday.
  insert into public.employees (id, org_id, employee_no, name, work_email, department_id,
    designation, employment_type, is_manager, join_date, status, date_of_birth_day, date_of_birth_month)
  select md5('rimba-emp-' || v.n)::uuid, demo, 'EMP-' || lpad(v.n::text, 3, '0'), v.name,
    v.handle || '@openkuasa.com', md5('rimba-dept-' || v.dept)::uuid, v.designation, v.etype, v.mgr,
    today - v.tenure, 'active',
    extract(day from today + v.bday)::smallint, extract(month from today + v.bday)::smallint
  from (values
    (1, 'Aisyah Rahim', 'aisyah', 'Sales', 'Sales Executive', 'full_time', false, 1730, 19),
    (2, 'Faiz Hakim', 'faiz', 'Marketing', 'Designer', 'full_time', false, 1680, 143),
    (3, 'Ahmad Zaki', 'zaki', 'Operations', 'Ops Lead', 'full_time', true, 1081, 201),
    (4, 'Nurul Huda', 'nurul', 'Finance', 'Accountant', 'full_time', false, 960, 9),
    (5, 'Siti Aminah', 'siti', 'Sales', 'Sales Executive', 'part_time', false, 850, 77),
    (6, 'Lim Wei Jie', 'weijie', 'Operations', 'Technician', 'contract', false, 1060, 256),
    (7, 'Siti Lestari', 'lestari', 'Management', 'HR Executive', 'full_time', false, 610, 310),
    (8, 'Raj Kumar', 'raj', 'Finance', 'Finance Analyst', 'full_time', false, 470, 118),
    (9, 'Tan Mei Ling', 'meiling', 'Marketing', 'Content Lead', 'full_time', true, 1240, 45),
    (10, 'Hafiz Osman', 'hafiz', 'Sales', 'Business Development', 'full_time', false, 395, 170),
    (11, 'Amirul Danial', 'amirul', 'Sales', 'Sales Executive', 'full_time', false, 720, 228),
    (12, 'Farid Ismail', 'farid', 'Sales', 'Sales Manager', 'full_time', true, 2010, 284),
    (13, 'Priya Devi', 'priya', 'Sales', 'Account Executive', 'full_time', false, 330, 61),
    (14, 'Chong Wei Han', 'weihan', 'Operations', 'Logistics Coordinator', 'full_time', false, 890, 332),
    (15, 'Zainab Yusof', 'zainab', 'Operations', 'Customer Support', 'full_time', false, 540, 97),
    (16, 'Daniel Wong', 'daniel', 'Operations', 'Technician', 'contract', false, 210, 189),
    (17, 'Syafiq Karim', 'syafiq', 'Marketing', 'Performance Marketer', 'full_time', false, 660, 131),
    (18, 'Liyana Salleh', 'liyana', 'Finance', 'Finance Manager', 'full_time', true, 1520, 266),
    (19, 'Kavitha Nair', 'kavitha', 'Management', 'Operations Director', 'full_time', true, 2300, 29),
    (20, 'Hakim Abdullah', 'hakim', 'Management', 'Managing Director', 'full_time', true, 2800, 215)
  ) as v(n, name, handle, dept, designation, etype, mgr, tenure, bday);

  -- Pay: RM 2,800 to RM 5,600 by position in the list; managers RM 3,000 more.
  insert into public.employee_private (employee_id, org_id, nric, date_of_birth, phone, address,
    base_salary_cents, bank_name, bank_account, epf_no, socso_no, tax_no,
    emergency_contact_name, emergency_contact_phone)
  select e.id, demo,
    '900101-14-' || lpad((5000 + e.n)::text, 4, '0'),
    make_date(this_year - 26 - (e.n % 14), e.date_of_birth_month, least(e.date_of_birth_day, 28)),
    '+60 12-555 ' || lpad((1000 + e.n * 37)::text, 4, '0'),
    e.n || ' Jalan Rimba, 50450 Kuala Lumpur',
    280000 + ((e.n * 7) % 8) * 40000 + case when e.is_manager then 300000 else 0 end,
    (array['Maybank','CIMB','Public Bank','RHB'])[1 + (e.n % 4)],
    lpad((100000000 + e.n * 7919)::text, 12, '5'),
    'EPF' || lpad((20000 + e.n)::text, 8, '0'),
    'SOC' || lpad((30000 + e.n)::text, 8, '0'),
    'SG' || lpad((40000 + e.n)::text, 9, '0'),
    'Waris ' || split_part(e.name, ' ', 1),
    '+60 13-555 ' || lpad((2000 + e.n * 41)::text, 4, '0')
  from (select x.*, substr(x.employee_no, 5)::int as n from public.employees x where x.org_id = demo) e;

  -- Leave. First three: approved and covering today. Next three: waiting.
  insert into public.leave_requests (org_id, employee_id, leave_type, start_date, end_date, days, reason, status, decided_at, created_at)
  select demo, md5('rimba-emp-' || v.n)::uuid, v.leave_type, today + v.from_day, today + v.to_day, v.days, v.reason, v.status,
    case when v.status = 'pending' then null else now() - interval '3 days' end,
    now() - make_interval(days => v.applied_ago)
  from (values
    (7, 'annual', -2, 1, 4.0, 'Family trip', 'approved', 12),
    (6, 'medical', 0, 0, 1.0, 'Clinic visit', 'approved', 1),
    (4, 'emergency', 0, 0, 1.0, 'Family matter', 'approved', 1),
    (1, 'annual', 10, 11, 2.0, 'Balik kampung', 'pending', 2),
    (11, 'annual', 5, 5, 1.0, 'Personal errand', 'pending', 1),
    (9, 'emergency', 3, 3, 1.0, 'Car repair', 'pending', 0),
    (2, 'annual', -40, -38, 3.0, 'Holiday', 'approved', 55),
    (3, 'medical', -25, -24, 2.0, 'Flu', 'approved', 26),
    (5, 'annual', -60, -58, 3.0, 'Wedding', 'approved', 75),
    (8, 'unpaid', -33, -33, 1.0, 'Personal', 'rejected', 40),
    (10, 'annual', -18, -17, 2.0, 'Rest', 'approved', 30),
    (12, 'annual', -75, -71, 5.0, 'Umrah', 'approved', 100),
    (13, 'medical', -12, -12, 1.0, 'Dental', 'approved', 13),
    (15, 'annual', -50, -49, 2.0, 'Holiday', 'approved', 62),
    (17, 'emergency', -8, -8, 1.0, 'Child unwell', 'approved', 9),
    (18, 'annual', -90, -86, 5.0, 'Holiday', 'approved', 110),
    (1, 'medical', -21, -21, 1.0, 'Fever', 'approved', 22),
    (1, 'annual', -45, -44, 2.0, 'Holiday', 'approved', 60)
  ) as v(n, leave_type, from_day, to_day, days, reason, status, applied_ago);

  insert into public.leave_balances (org_id, employee_id, leave_type, year, entitled_days, used_days)
  select demo, e.id, t.leave_type, this_year, t.entitled,
    coalesce((
      select sum(r.days) from public.leave_requests r
      where r.employee_id = e.id and r.leave_type = t.leave_type and r.status = 'approved'
        and extract(year from r.start_date) = this_year
    ), 0)
  from public.employees e
  cross join (values ('annual', 16.0), ('medical', 14.0), ('emergency', 3.0)) as t(leave_type, entitled)
  where e.org_id = demo;

  insert into public.time_off_requests (org_id, employee_id, off_date, start_time, end_time, reason, status, decided_at)
  select demo, md5('rimba-emp-' || v.n)::uuid, today + v.day, v.start_time::time, v.end_time::time, v.reason, v.status,
    case when v.status = 'pending' then null else now() - interval '2 days' end
  from (values
    (1, -9, '15:00', '17:00', 'Bank appointment', 'approved'),
    (1, -30, '09:00', '11:00', 'School event', 'approved'),
    (2, 2, '14:00', '16:00', 'Clinic follow-up', 'pending'),
    (5, -14, '16:00', '18:00', 'JPJ appointment', 'approved'),
    (10, -6, '09:00', '10:30', 'Car service', 'rejected'),
    (14, -20, '13:00', '15:00', 'Bank appointment', 'approved')
  ) as v(n, day, start_time, end_time, reason, status);

  -- Claims. First two are waiting.
  insert into public.claims (org_id, employee_id, category, amount_cents, claim_date, description, has_receipt, status, decided_at)
  select demo, md5('rimba-emp-' || v.n)::uuid, v.category, v.amount, today + v.day, v.description, v.receipt, v.status,
    case when v.status = 'pending' then null else now() - interval '2 days' end
  from (values
    (2, 'medical', 24000, -1, 'Clinic consultation', true, 'pending'),
    (4, 'travel', 18000, -2, 'Site visit mileage', true, 'pending'),
    (1, 'travel', 32000, -12, 'Client visit, Johor Bahru', true, 'approved'),
    (1, 'meals', 8600, -20, 'Client lunch', true, 'approved'),
    (1, 'medical', 15000, -41, 'Panel clinic', true, 'approved'),
    (1, 'equipment', 68400, -55, 'Headset and keyboard', false, 'rejected'),
    (3, 'travel', 21000, -9, 'Warehouse run', true, 'approved'),
    (5, 'meals', 6400, -15, 'Team lunch', true, 'approved'),
    (9, 'equipment', 129000, -27, 'Camera tripod', true, 'approved'),
    (12, 'travel', 54000, -33, 'Penang roadshow', true, 'approved'),
    (13, 'medical', 9000, -6, 'Pharmacy', true, 'approved'),
    (17, 'other', 12000, -18, 'Courier fees', false, 'rejected')
  ) as v(n, category, amount, day, description, receipt, status);

  -- Overtime. The first is waiting; pay is hours x rate x RM 25.
  insert into public.overtime_records (org_id, employee_id, work_date, hours, rate_multiplier, amount_cents, status, decided_at)
  select demo, md5('rimba-emp-' || v.n)::uuid, today + v.day, v.hours, v.rate,
    round(v.hours * v.rate * 2500)::bigint, v.status,
    case when v.status = 'pending' then null else now() - interval '1 day' end
  from (values
    (3, -2, 4.0, 1.5, 'pending'),
    (1, -7, 2.0, 1.5, 'approved'),
    (1, -23, 3.0, 1.5, 'approved'),
    (1, -37, 2.5, 2.0, 'approved'),
    (6, -5, 3.5, 1.5, 'approved'),
    (6, -19, 4.0, 2.0, 'approved'),
    (14, -11, 2.0, 1.5, 'approved'),
    (15, -4, 1.5, 1.5, 'approved'),
    (16, -13, 5.0, 2.0, 'approved'),
    (16, -26, 3.0, 1.5, 'rejected'),
    (3, -16, 2.5, 1.5, 'approved'),
    (10, -8, 2.0, 1.5, 'approved')
  ) as v(n, day, hours, rate, status);

  -- Attendance for the last eight weeks of weekdays. h is a stable 0..39 per
  -- employee and day: 0 is absent, 1 to 4 late, the rest on time.
  insert into public.attendance_days (org_id, employee_id, work_date, clock_in, clock_out, status)
  select demo, a.employee_id, a.work_date,
    case when a.status in ('absent', 'on_leave') then null
         else (a.work_date + time '09:00'
               + case when a.status = 'late' then (10 + a.h * 5) else -(a.h % 10) end * interval '1 minute')
              at time zone 'Asia/Kuala_Lumpur' end,
    case when a.status in ('absent', 'on_leave') or a.work_date = today then null
         else (a.work_date + time '18:00' + (a.h % 30) * interval '1 minute') at time zone 'Asia/Kuala_Lumpur' end,
    a.status
  from (
    select e.id as employee_id, d::date as work_date, x.h,
      case
        when exists (
          select 1 from public.leave_requests r
          where r.employee_id = e.id and r.status = 'approved' and d::date between r.start_date and r.end_date
        ) then 'on_leave'
        when x.h = 0 then 'absent'
        when x.h between 1 and 4 then 'late'
        else 'present'
      end as status
    from public.employees e
    cross join generate_series(today - 55, today, interval '1 day') as d
    cross join lateral (select (abs(hashtext(e.id::text || d::date::text)::bigint) % 40)::int as h) x
    where e.org_id = demo and extract(isodow from d) < 6
  ) a;

  insert into public.timesheet_entries (org_id, employee_id, work_date, hours, billable_hours)
  select demo, a.employee_id, a.work_date, t.hours, round(t.hours * 0.8 * 2) / 2
  from public.attendance_days a
  cross join lateral (
    select 7.5 + (abs(hashtext(a.employee_id::text || a.work_date::text || 'h')::bigint) % 3) * 0.5 as hours
  ) t
  where a.org_id = demo and a.status in ('present', 'late');

  -- This week's roster for Operations.
  insert into public.shifts (org_id, employee_id, work_date, shift)
  select demo, e.id, week_start + g.i,
    case (substr(e.employee_no, 5)::int + g.i) % 4 when 0 then 'off' when 1 then 'night' else 'morning' end
  from public.employees e
  cross join generate_series(0, 6) as g(i)
  where e.org_id = demo and e.department_id = md5('rimba-dept-Operations')::uuid;

  -- Fixed-date holidays only: the movable ones change every year.
  insert into public.public_holidays (org_id, name, holiday_date, scope, state)
  select demo, v.name, make_date(this_year, v.m, v.d), v.scope, v.state
  from (values
    ('New Year''s Day', 1, 1, 'state', 'Kuala Lumpur'),
    ('Federal Territory Day', 2, 1, 'state', 'Kuala Lumpur'),
    ('Labour Day', 5, 1, 'national', null),
    ('National Day', 8, 31, 'national', null),
    ('Malaysia Day', 9, 16, 'national', null),
    ('Christmas Day', 12, 25, 'national', null)
  ) as v(name, m, d, scope, state);

  -- Payroll: this month in draft, the seven before it paid.
  insert into public.payroll_runs (id, org_id, period_month, status, paid_at)
  select md5('rimba-run-' || g.m)::uuid, demo, (month_start - make_interval(months => g.m))::date,
    case when g.m = 0 then 'draft' else 'paid' end,
    case when g.m = 0 then null else (month_start - make_interval(months => g.m) + interval '27 days') end
  from generate_series(0, 7) as g(m);

  insert into public.payslips (org_id, employee_id, payroll_run_id, period_month,
    gross_cents, epf_cents, socso_cents, eis_cents, pcb_cents, status)
  select demo, p.employee_id, r.id, r.period_month, p.base_salary_cents,
    round(p.base_salary_cents * 0.11)::bigint,
    least(round(p.base_salary_cents * 0.005), 2975)::bigint,
    least(round(p.base_salary_cents * 0.002), 1190)::bigint,
    case when p.base_salary_cents > 500000 then (8000 + round((p.base_salary_cents - 500000) * 0.08))::bigint
         when p.base_salary_cents > 350000 then round((p.base_salary_cents - 350000) * 0.03)::bigint
         else 0 end,
    case when r.status = 'paid' then 'paid' else 'pending' end
  from public.employee_private p
  join public.employees e on e.id = p.employee_id
  join public.payroll_runs r on r.org_id = demo and e.join_date < (r.period_month + interval '1 month')::date
  where p.org_id = demo;

  insert into public.payment_vouchers (org_id, voucher_no, payee, voucher_type, amount_cents, issued_date, status)
  select demo, 'PV-' || lpad(v.no::text, 4, '0'), v.payee, v.voucher_type, v.amount, today + v.day, v.status
  from (values
    (1041, 'Aisyah Rahim', 'Claim reimbursement', 32000, -10, 'paid'),
    (1042, 'Tan Mei Ling', 'Claim reimbursement', 129000, -24, 'paid'),
    (1043, 'Lembaga Hasil Dalam Negeri', 'Statutory payment', 412000, -18, 'paid'),
    (1044, 'KWSP', 'Statutory payment', 1986000, -18, 'paid'),
    (1045, 'Farid Ismail', 'Advance', 150000, -3, 'issued'),
    (1046, 'Daniel Wong', 'Overtime payout', 37500, 0, 'draft')
  ) as v(no, payee, voucher_type, amount, day, status);

  -- Performance.
  insert into public.goals (org_id, employee_id, title, progress, due_date, status)
  select demo, e.id, v.title, least(100, v.progress + (e.n * 7) % 20),
    today + v.due,
    case when least(100, v.progress + (e.n * 7) % 20) >= 100 then 'done'
         when v.progress < 40 then 'at_risk' else 'on_track' end
  from (select x.*, substr(x.employee_no, 5)::int as n from public.employees x where x.org_id = demo) e
  cross join (values
    ('Hit the quarterly target', 62, 40),
    ('Complete the compliance course', 85, 20),
    ('Cut response time to under 4 hours', 30, 60),
    ('Mentor one new hire', 55, 75)
  ) as v(title, progress, due)
  where e.n <= 10;

  insert into public.scorecards (org_id, employee_id, period, score, competencies)
  select demo, e.id, 'H1 ' || this_year, 3.0 + ((e.n * 7) % 19) / 10.0,
    jsonb_build_object(
      'Delivery', 3.0 + ((e.n * 3) % 20) / 10.0,
      'Teamwork', 3.0 + ((e.n * 5) % 20) / 10.0,
      'Ownership', 3.0 + ((e.n * 11) % 20) / 10.0,
      'Communication', 3.0 + ((e.n * 13) % 20) / 10.0)
  from (select x.*, substr(x.employee_no, 5)::int as n from public.employees x where x.org_id = demo) e;

  insert into public.reviews (org_id, employee_id, period, rating, score, reviewer_name, reviewed_at)
  select demo, s.employee_id, s.period,
    case when s.score >= 4.3 then 'exceeds' when s.score >= 3.4 then 'meets' else 'below' end,
    s.score, 'Kavitha Nair', today - 45
  from public.scorecards s where s.org_id = demo;

  insert into public.trainings (id, org_id, title, category, provider, starts_on, ends_on, status)
  select md5('rimba-training-' || v.k)::uuid, demo, v.title, v.category, v.provider, today + v.from_day, today + v.to_day, v.status
  from (values
    (1, 'Workplace safety refresher', 'Compliance', 'In-house', -60, -59, 'completed'),
    (2, 'PDPA for customer data', 'Compliance', 'In-house', -30, -30, 'completed'),
    (3, 'Consultative selling', 'Sales', 'External trainer', -3, 4, 'in_progress'),
    (4, 'Excel for finance teams', 'Skills', 'Online course', 12, 13, 'upcoming'),
    (5, 'First-time manager programme', 'Leadership', 'External trainer', 30, 32, 'upcoming')
  ) as v(k, title, category, provider, from_day, to_day, status);

  insert into public.training_enrolments (org_id, employee_id, training_id, completed)
  select demo, e.id, t.id, t.status = 'completed'
  from (select x.*, substr(x.employee_no, 5)::int as n from public.employees x where x.org_id = demo) e
  cross join (
    select tr.id, tr.status, row_number() over (order by tr.starts_on) as k
    from public.trainings tr where tr.org_id = demo
  ) t
  where (e.n + t.k) % 3 = 0 or (e.n = 1 and t.k <= 3);

  -- Communications and documents.
  insert into public.announcements (org_id, title, body, category, published_at, author_name)
  select demo, v.title, v.body, v.category, now() - make_interval(days => v.ago), 'Siti Lestari'
  from (values
    ('Office closed for National Day', 'The office is closed on 31 August. Support runs a skeleton shift.', 'holiday', 4),
    ('New panel clinics added', 'Three more panel clinics are available under the medical benefit.', 'benefits', 9),
    ('Quarterly town hall', 'Join the town hall this Friday at 3pm in the main meeting room.', 'general', 13),
    ('Updated leave policy', 'Annual leave may now be carried forward up to five days.', 'policy', 21),
    ('Second-half priorities', 'Leadership has shared the three priorities for the second half.', 'strategy', 34)
  ) as v(title, body, category, ago);

  insert into public.documents (org_id, employee_id, title, doc_type, status, issued_on, expires_on)
  select demo, e.id, 'Employment contract', 'contract', 'signed', e.join_date, null
  from public.employees e where e.org_id = demo;

  insert into public.documents (org_id, employee_id, title, doc_type, status, issued_on, expires_on)
  select demo, md5('rimba-emp-1')::uuid, v.title, v.doc_type, v.status, today + v.issued, today + v.expires
  from (values
    ('Payslip, last month', 'payslip', 'available', -8, null),
    ('Payslip, two months ago', 'payslip', 'available', -38, null),
    ('Payslip, three months ago', 'payslip', 'available', -69, null),
    ('EA form', 'tax', 'available', -150, null),
    ('Confirmation letter', 'letter', 'pending_signature', -2, null),
    ('Medical card', 'benefits', 'expiring', -340, 25)
  ) as v(title, doc_type, status, issued, expires);

  insert into public.letters (org_id, employee_id, letter_type, title, status, issued_on)
  select demo, md5('rimba-emp-' || v.n)::uuid, v.letter_type, v.title, v.status,
    case when v.status = 'issued' then today + v.day else null end
  from (values
    (1, 'Confirmation', 'Confirmation of employment', 'issued', -2),
    (13, 'Offer', 'Offer of employment', 'issued', -330),
    (10, 'Warning', 'Late attendance reminder', 'draft', 0),
    (9, 'Promotion', 'Promotion to Content Lead', 'issued', -120),
    (16, 'Contract renewal', 'Contract renewal', 'draft', 0)
  ) as v(n, letter_type, title, status, day);

  insert into public.people_settings (org_id, notifications)
  values (demo, '{"leave_requests":true,"payslip_ready":true,"document_expiry":true,"birthdays":false}'::jsonb);
end; $$;
revoke all on function private.reseed_demo_people() from public, anon, authenticated;

select private.reseed_demo_people();
```

- [ ] **Step 4: Write the schedule migration** — `supabase/migrations/20261013090800_people_demo_cron.sql`

```sql
-- Keep the Lekiu demo fresh. Its own migration so a pg_cron problem can never
-- block the tables or the seed. Runs at :15, away from the reach reseed at :00.
create extension if not exists pg_cron;
select cron.schedule('reseed-demo-people', '15 * * * *', $$select private.reseed_demo_people()$$);
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm vitest run --dir tests people-demo-seed`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261013090700_people_demo_seed.sql supabase/migrations/20261013090800_people_demo_cron.sql tests/people-demo-seed.test.ts
git commit -m "feat(people): demo HR data, rebuilt hourly and anchored to today"
```

---

### Task 9: The access checks

Two files. Neither can pass until Task 10 applies the migrations; they are written first so that Task 10 has something to run.

**Files:**
- Create: `tests/people.rls.test.ts`
- Create: `supabase/tests/people_rls_check.sql`

**Interfaces:**
- Consumes: everything from Tasks 1–8; `public.create_org_for_current_user(org_name text)`, `public.join_demo_org()`; `tests/setup/supabase.ts` (`hasSupabaseEnv`, `supabaseEnvSkipReason`).
- Produces: `pnpm vitest run --dir tests people.rls` (skips without `.env.local`), and a SQL script whose only output is an error message starting `PEOPLE_RLS_CHECK PASSED` or `PEOPLE_RLS_CHECK FAILED:`.

- [ ] **Step 1: Write the live test** — `tests/people.rls.test.ts`

Anonymous sign-ins can be an owner of a new workspace or a viewer of the demo workspace. They cannot be a plain `member` (an anonymous user cannot accept an invite); that tier is Step 2.

```ts
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';

const testWithSupabase = hasSupabaseEnv ? test : test.skip;
if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const client = (): SupabaseClient =>
  createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const DEMO_EMPLOYEE_ID = 'dea97d89-a5b6-f264-bd42-c6df73f664a7';
const PERSONAL = [
  'employee_private', 'leave_requests', 'leave_balances', 'time_off_requests', 'claims',
  'overtime_records', 'attendance_days', 'timesheet_entries', 'shifts', 'payslips', 'goals',
  'scorecards', 'reviews', 'training_enrolments', 'documents', 'letters',
];
const HR_ONLY = ['payroll_runs', 'payment_vouchers', 'people_settings'];
const SHARED = ['departments', 'employees', 'public_holidays', 'trainings', 'announcements'];

async function ownedOrg(name: string) {
  const c = client();
  const { error: e1 } = await c.auth.signInAnonymously();
  expect(e1, e1?.message).toBeNull();
  const { data: orgId, error } = await c.rpc('create_org_for_current_user', { org_name: name });
  expect(error, error?.message).toBeNull();
  return { c, orgId: orgId as string };
}

async function demoGuest() {
  const c = client();
  const { error: e1 } = await c.auth.signInAnonymously();
  expect(e1, e1?.message).toBeNull();
  const { data: demoId, error } = await c.rpc('join_demo_org');
  expect(error, error?.message).toBeNull();
  return { c, demoId: demoId as string };
}

const count = async (c: SupabaseClient, table: string, orgId: string) => {
  const { count: n, error } = await c
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);
  expect(error, `${table}: ${error?.message}`).toBeNull();
  return n ?? 0;
};

let owner: Awaited<ReturnType<typeof ownedOrg>>;
let other: Awaited<ReturnType<typeof ownedOrg>>;

beforeAll(async () => {
  if (!hasSupabaseEnv) return;
  owner = await ownedOrg('People Owner Sdn Bhd');
  other = await ownedOrg('People Other Sdn Bhd');
});
afterAll(async () => {
  await owner?.c.auth.signOut();
  await other?.c.auth.signOut();
});

testWithSupabase('an owner can add, edit and delete a department and an employee with private details', async () => {
  const dept = await owner.c
    .from('departments')
    .insert({ org_id: owner.orgId, name: 'Sales' })
    .select('id')
    .single();
  expect(dept.error, dept.error?.message).toBeNull();

  const emp = await owner.c
    .from('employees')
    .insert({ org_id: owner.orgId, employee_no: 'EMP-001', name: 'Farah Idris', department_id: dept.data!.id })
    .select('id, status, user_id, updated_at')
    .single();
  expect(emp.error, emp.error?.message).toBeNull();
  expect(emp.data!.status).toBe('active');
  expect(emp.data!.user_id).toBeNull();

  const priv = await owner.c
    .from('employee_private')
    .insert({ employee_id: emp.data!.id, org_id: owner.orgId, base_salary_cents: 420000, nric: '900101-14-5001' })
    .select('base_salary_cents')
    .single();
  expect(priv.error, priv.error?.message).toBeNull();
  expect(priv.data!.base_salary_cents).toBe(420000);

  const upd = await owner.c
    .from('employees')
    .update({ designation: 'Sales Executive' })
    .eq('id', emp.data!.id)
    .select('designation, updated_at')
    .single();
  expect(upd.error, upd.error?.message).toBeNull();
  expect(upd.data!.designation).toBe('Sales Executive');
  expect(new Date(upd.data!.updated_at) >= new Date(emp.data!.updated_at)).toBe(true);

  // A department that still has an employee cannot be deleted.
  const blocked = await owner.c.from('departments').delete().eq('id', dept.data!.id);
  expect(blocked.error?.code).toBe('23503');

  // Deleting the employee takes the private row with it.
  const del = await owner.c.from('employees').delete().eq('id', emp.data!.id);
  expect(del.error, del.error?.message).toBeNull();
  expect(await count(owner.c, 'employee_private', owner.orgId)).toBe(0);
  const delDept = await owner.c.from('departments').delete().eq('id', dept.data!.id);
  expect(delDept.error, delDept.error?.message).toBeNull();
});

testWithSupabase('an owner cannot link an employee to someone outside the workspace', async () => {
  const outsider = (await other.c.auth.getUser()).data.user!.id;
  const res = await owner.c
    .from('employees')
    .insert({ org_id: owner.orgId, employee_no: 'EMP-900', name: 'Not Ours', user_id: outsider })
    .select('id');
  expect(res.error?.message).toContain('not a member of this workspace');
});

testWithSupabase('an owner cannot write to a table that is read-only this slice', async () => {
  const emp = await owner.c
    .from('employees')
    .insert({ org_id: owner.orgId, employee_no: 'EMP-002', name: 'Read Only' })
    .select('id')
    .single();
  expect(emp.error, emp.error?.message).toBeNull();
  const res = await owner.c.from('leave_requests').insert({
    org_id: owner.orgId, employee_id: emp.data!.id, leave_type: 'annual',
    start_date: '2026-10-20', end_date: '2026-10-21', days: 2,
  });
  expect(res.error?.code).toBe('42501'); // no insert grant
  await owner.c.from('employees').delete().eq('id', emp.data!.id);
});

testWithSupabase('one workspace cannot see or change another workspace\'s HR data', async () => {
  const emp = await owner.c
    .from('employees')
    .insert({ org_id: owner.orgId, employee_no: 'EMP-003', name: 'Private Person' })
    .select('id')
    .single();
  expect(emp.error, emp.error?.message).toBeNull();
  await owner.c.from('employee_private').insert({ employee_id: emp.data!.id, org_id: owner.orgId, base_salary_cents: 500000 });

  expect(await count(other.c, 'employees', owner.orgId)).toBe(0);
  expect(await count(other.c, 'employee_private', owner.orgId)).toBe(0);

  const hijack = await other.c.from('employees').update({ name: 'Changed' }).eq('id', emp.data!.id).select('id');
  expect(hijack.data ?? []).toHaveLength(0);
  const plant = await other.c.from('employees').insert({ org_id: owner.orgId, employee_no: 'X', name: 'Planted' });
  expect(plant.error?.code).toBe('42501');

  await owner.c.from('employees').delete().eq('id', emp.data!.id);
});

testWithSupabase('a demo guest reads the whole demo workspace, and it has the promised shape', async () => {
  const d = await demoGuest();

  for (const table of [...SHARED, ...PERSONAL, ...HR_ONLY]) {
    expect(await count(d.c, table, d.demoId), table).toBeGreaterThan(0);
  }
  expect(await count(d.c, 'employees', d.demoId)).toBe(20);
  expect(await count(d.c, 'departments', d.demoId)).toBe(5);
  expect(await count(d.c, 'payroll_runs', d.demoId)).toBe(8);

  const me = await d.c.from('employees').select('name').eq('id', DEMO_EMPLOYEE_ID).single();
  expect(me.data?.name).toBe('Aisyah Rahim');

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
  const onLeave = await d.c
    .from('leave_requests')
    .select('id')
    .eq('org_id', d.demoId)
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today);
  expect(onLeave.data ?? []).toHaveLength(3);

  const pending = async (table: string) => {
    const { count: n } = await d.c
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('org_id', d.demoId)
      .eq('status', 'pending');
    return n ?? 0;
  };
  expect(await pending('leave_requests')).toBe(3);
  expect(await pending('claims')).toBe(2);
  expect(await pending('overtime_records')).toBe(1);

  const draft = await d.c.from('payroll_runs').select('period_month').eq('org_id', d.demoId).eq('status', 'draft');
  expect(draft.data ?? []).toHaveLength(1);
  expect(draft.data![0].period_month).toBe(`${today.slice(0, 7)}-01`);

  await d.c.auth.signOut();
});

testWithSupabase('a demo guest cannot change anything', async () => {
  const d = await demoGuest();
  const ins = await d.c.from('employees').insert({ org_id: d.demoId, employee_no: 'X', name: 'Guest Edit' });
  expect(ins.error?.code).toBe('42501');
  const upd = await d.c.from('employees').update({ name: 'Changed' }).eq('id', DEMO_EMPLOYEE_ID).select('id');
  expect(upd.data ?? []).toHaveLength(0);
  const del = await d.c.from('employees').delete().eq('id', DEMO_EMPLOYEE_ID).select('id');
  expect(del.data ?? []).toHaveLength(0);
  const pay = await d.c.from('employee_private').update({ base_salary_cents: 1 }).eq('employee_id', DEMO_EMPLOYEE_ID).select('employee_id');
  expect(pay.data ?? []).toHaveLength(0);
  await d.c.auth.signOut();
});

testWithSupabase('being in the demo opens the demo only', async () => {
  // Someone who is not in the demo sees none of it.
  const demoIdRes = await demoGuest();
  for (const table of ['employees', 'payslips', 'payroll_runs']) {
    expect(await count(owner.c, table, demoIdRes.demoId), table).toBe(0);
  }
  // A demo guest sees nothing of a real workspace.
  const emp = await owner.c
    .from('employees')
    .insert({ org_id: owner.orgId, employee_no: 'EMP-004', name: 'Not For Guests' })
    .select('id')
    .single();
  expect(emp.error, emp.error?.message).toBeNull();
  expect(await count(demoIdRes.c, 'employees', owner.orgId)).toBe(0);
  await owner.c.from('employees').delete().eq('id', emp.data!.id);
  await demoIdRes.c.auth.signOut();
});
```

- [ ] **Step 2: Write the member-tier check** — `supabase/tests/people_rls_check.sql`

This is one `do` block. It builds a workspace with an admin and two members, acts as each of them, and **always ends by raising**, which rolls everything back. It is run as the database owner through the MCP in Task 10.

```sql
-- Lekiu member-tier access check. Leaves nothing behind: the block always ends
-- with RAISE, so every insert below is rolled back. Read the message:
--   PEOPLE_RLS_CHECK PASSED ...   or   PEOPLE_RLS_CHECK FAILED: <what went wrong>
do $$
declare
  org uuid := gen_random_uuid();
  other_org uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  e1 uuid;
  e2 uuid;
  run_id uuid := gen_random_uuid();
  demo uuid;
  linked uuid;
  n int;
  t text;
  fails text[] := '{}';
  personal text[] := array['employee_private','leave_requests','claims','payslips','reviews','documents'];
  hr_only text[] := array['payroll_runs','payment_vouchers','people_settings'];
begin
  -- ---- people and a workspace ----------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    u.id || '@rls-check.openkuasa-test.dev', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false
  from unnest(array[admin_id, m1, m2, outsider]) as u(id);

  insert into public.orgs (id, name) values (org, 'RLS Check Sdn Bhd'), (other_org, 'RLS Other Sdn Bhd');
  insert into public.org_members (org_id, user_id, role)
  values (org, admin_id, 'admin'), (other_org, outsider, 'owner');

  -- Link on joining: the employee exists first, then the member joins.
  insert into public.employees (org_id, employee_no, name, work_email)
  values (org, 'E1', 'Member One', m1 || '@rls-check.openkuasa-test.dev') returning id into e1;
  insert into public.org_members (org_id, user_id, role) values (org, m1, 'member');
  select user_id into linked from public.employees where id = e1;
  if linked is distinct from m1 then fails := array_append(fails, 'joining did not link the employee'); end if;

  -- Link on adding: the member exists first, then the employee is added.
  insert into public.org_members (org_id, user_id, role) values (org, m2, 'member');
  insert into public.employees (org_id, employee_no, name, work_email)
  values (org, 'E2', 'Member Two', m2 || '@rls-check.openkuasa-test.dev') returning id into e2;
  select user_id into linked from public.employees where id = e2;
  if linked is distinct from m2 then fails := array_append(fails, 'adding an employee did not link the member'); end if;

  -- A link to someone outside the workspace is refused.
  begin
    update public.employees set user_id = outsider where id = e2;
    fails := array_append(fails, 'linked an employee to a non-member');
  exception when others then null;
  end;

  -- ---- one personal row each, and the HR-only rows --------------------
  insert into public.employee_private (employee_id, org_id, base_salary_cents) values (e1, org, 400000), (e2, org, 900000);
  insert into public.leave_requests (org_id, employee_id, leave_type, start_date, end_date, days)
  values (org, e1, 'annual', current_date, current_date, 1), (org, e2, 'medical', current_date, current_date, 1);
  insert into public.claims (org_id, employee_id, category, amount_cents, claim_date)
  values (org, e1, 'travel', 1000, current_date), (org, e2, 'medical', 2000, current_date);
  insert into public.payroll_runs (id, org_id, period_month) values (run_id, org, date_trunc('month', current_date)::date);
  insert into public.payslips (org_id, employee_id, payroll_run_id, period_month, gross_cents)
  values (org, e1, run_id, date_trunc('month', current_date)::date, 400000),
         (org, e2, run_id, date_trunc('month', current_date)::date, 900000);
  insert into public.reviews (org_id, employee_id, period, rating, score)
  values (org, e1, 'H1', 'meets', 3.5), (org, e2, 'H1', 'exceeds', 4.5);
  insert into public.documents (org_id, employee_id, title, doc_type)
  values (org, e1, 'Contract', 'contract'), (org, e2, 'Contract', 'contract');
  insert into public.payment_vouchers (org_id, voucher_no, payee, voucher_type, amount_cents, issued_date)
  values (org, 'PV-1', 'Someone', 'Advance', 1000, current_date);
  insert into public.people_settings (org_id) values (org);

  -- ---- as member one ---------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;

  foreach t in array personal loop
    execute format('select count(*) from public.%I where org_id = %L', t, org) into n;
    if n <> 1 then fails := array_append(fails, format('a member reads %s rows of %s, expected only their own 1', n, t)); end if;
  end loop;
  execute format('select count(*) from public.payslips where employee_id = %L', e2) into n;
  if n <> 0 then fails := array_append(fails, 'a member reads a colleague''s payslip'); end if;
  foreach t in array hr_only loop
    execute format('select count(*) from public.%I where org_id = %L', t, org) into n;
    if n <> 0 then fails := array_append(fails, format('a member reads %s rows of HR-only %s', n, t)); end if;
  end loop;
  execute format('select count(*) from public.employees where org_id = %L', org) into n;
  if n <> 2 then fails := array_append(fails, format('a member sees %s of 2 colleagues in the directory', n)); end if;

  begin
    execute format('insert into public.employees (org_id, employee_no, name) values (%L, ''X'', ''Planted'')', org);
    fails := array_append(fails, 'a member added an employee');
  exception when insufficient_privilege then null;
  end;
  execute format('update public.employee_private set base_salary_cents = 1 where employee_id = %L', e1);
  get diagnostics n = row_count;
  if n <> 0 then fails := array_append(fails, 'a member changed their own salary'); end if;
  execute format('delete from public.employees where id = %L', e2);
  get diagnostics n = row_count;
  if n <> 0 then fails := array_append(fails, 'a member deleted a colleague'); end if;

  reset role;

  -- ---- as the admin ----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  foreach t in array personal loop
    execute format('select count(*) from public.%I where org_id = %L', t, org) into n;
    if n <> 2 then fails := array_append(fails, format('the admin reads %s rows of %s, expected 2', n, t)); end if;
  end loop;
  foreach t in array hr_only loop
    execute format('select count(*) from public.%I where org_id = %L', t, org) into n;
    if n <> 1 then fails := array_append(fails, format('the admin reads %s rows of %s, expected 1', n, t)); end if;
  end loop;
  reset role;

  -- ---- as the owner of another workspace -------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  foreach t in array personal || hr_only || array['employees'] loop
    execute format('select count(*) from public.%I where org_id = %L', t, org) into n;
    if n <> 0 then fails := array_append(fails, format('another workspace reads %s rows of %s', n, t)); end if;
  end loop;
  reset role;

  -- ---- a member who is removed loses their own rows at once -------------
  delete from public.org_members where org_id = org and user_id = m1;
  select user_id into linked from public.employees where id = e1;
  if linked is not null then fails := array_append(fails, 'removing a member left the employee linked'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  execute format('select count(*) from public.payslips where org_id = %L', org) into n;
  if n <> 0 then fails := array_append(fails, 'a removed member still reads their payslip'); end if;
  reset role;

  -- ---- the demo reseed keeps its shape when it runs again ---------------
  select id into demo from public.orgs where slug = 'rimba-ventures-demo';
  perform private.reseed_demo_people();
  perform private.reseed_demo_people();
  select count(*) into n from public.employees where org_id = demo;
  if n <> 20 then fails := array_append(fails, format('the demo has %s employees after two reseeds, expected 20', n)); end if;
  select count(*) into n from public.employees where org_id = demo and id = 'dea97d89-a5b6-f264-bd42-c6df73f664a7' and name = 'Aisyah Rahim';
  if n <> 1 then fails := array_append(fails, 'the demo employee id changed'); end if;
  select count(*) into n from public.leave_requests
  where org_id = demo and status = 'approved'
    and (now() at time zone 'Asia/Kuala_Lumpur')::date between start_date and end_date;
  if n <> 3 then fails := array_append(fails, format('%s people on leave today in the demo, expected 3', n)); end if;
  select (select count(*) from public.leave_requests where org_id = demo and status = 'pending')
       + (select count(*) from public.claims where org_id = demo and status = 'pending')
       + (select count(*) from public.overtime_records where org_id = demo and status = 'pending') into n;
  if n <> 6 then fails := array_append(fails, format('%s pending approvals in the demo, expected 6', n)); end if;

  -- ---- a workspace with HR data can still be deleted --------------------
  begin
    delete from public.orgs where id = org;
  exception when others then
    fails := array_append(fails, ('deleting a workspace with HR data failed: ' || sqlerrm));
  end;

  raise exception 'PEOPLE_RLS_CHECK %', case
    when cardinality(fails) = 0 then 'PASSED (everything rolled back)'
    else 'FAILED: ' || array_to_string(fails, '; ')
  end;
end $$;
```

- [ ] **Step 3: Confirm the live test is collected**

Run: `pnpm vitest run --dir tests people.rls`
Expected on this machine, where the Supabase variables are in the shell environment (the other `*.rls.test.ts` files run here): the 7 tests **fail** with an error naming a missing table such as `public.departments`, because nothing is applied yet. That failure is expected until Task 10. If the variables are absent instead, the 7 tests are skipped and the exit code is 0.

- [ ] **Step 4: Run the rest of the suite**

Run: `pnpm vitest run --dir tests --exclude '**/people.rls.test.ts'`
Expected: everything passes, including `people-schema` (55) and `people-demo-seed` (5).

- [ ] **Step 5: Commit**

```bash
git add tests/people.rls.test.ts supabase/tests/people_rls_check.sql
git commit -m "test(people): live access tests and a self-rolling-back member-tier check"
```

---

### Task 10: Apply to the live database and open the PR

**This task changes the live database. Stop and get the owner's explicit go-ahead before Step 2.** Say what will happen: nine migrations creating 24 new tables and one hourly job on project `ugchntdgaeefmufumchx`; no existing table is altered except that `org_members` gains two triggers.

**Files:** none created. Reads the nine migration files and `supabase/tests/people_rls_check.sql`.

**Interfaces:**
- Consumes: `mcp__openkuasa-supabase__list_migrations`, `apply_migration`, `execute_sql`, `get_advisors`.
- Produces: the tables live; a passed access check; a PR.

- [ ] **Step 1: Check the starting point**

Call `mcp__openkuasa-supabase__list_migrations`. Expected: no migration named `people_*`. Run `git fetch origin` then `git ls-tree --name-only origin/main supabase/migrations/` and confirm no file there starts with `20261013`. If one does, rename these nine files to the next free prefix, update the three filename constants in `tests/people-schema.test.ts` and the two in `tests/people-demo-seed.test.ts`, re-run both tests, and commit.

- [ ] **Step 2: Apply the eight table and seed migrations, in order**

After the owner's go-ahead, call `mcp__openkuasa-supabase__apply_migration` once per file, with `name` set to the filename without the timestamp and extension and `query` set to the file's full contents:

`people_core`, `people_leave`, `people_claims_overtime`, `people_attendance`, `people_payroll`, `people_performance`, `people_comms_documents`, `people_demo_seed`.

If one fails, stop. Read the error, fix the SQL file, re-run `pnpm vitest run --dir tests people-schema people-demo-seed`, commit the fix, and apply that file again. Do not apply later files over a failed one.

- [ ] **Step 3: Run the member-tier check**

Two probes first, both through `mcp__openkuasa-supabase__execute_sql`, because the local dry run could not cover them:

```sql
select proname, prosrc from pg_proc where proname in ('rls_auto_enable', 'sync_profile_from_auth_user');
```

Read both bodies. `rls_auto_enable` should only enable row level security on new tables; if it also creates a policy named `mfa_required`, Step 2 would already have failed on the first table. `sync_profile_from_auth_user` runs when the check inserts into `auth.users`; note any field of `raw_user_meta_data` it reads.

```sql
do $$ begin set local role authenticated; reset role; raise exception 'ROLE_SWITCH_OK'; end $$;
```

Expected: an error whose message is `ROLE_SWITCH_OK`. If it is a permission error instead, the MCP's database role cannot act as `authenticated` and the check cannot run this way: stop and tell the owner.

If the check itself then fails on its first statement (the insert into `auth.users`), the cause is the script's user rows, not a migration: add whatever column or `raw_user_meta_data` field the error or the profile trigger names, and re-run.

Call `mcp__openkuasa-supabase__execute_sql` with the full contents of `supabase/tests/people_rls_check.sql`.
Expected: an error whose message is `PEOPLE_RLS_CHECK PASSED (everything rolled back)`.
If the message starts `PEOPLE_RLS_CHECK FAILED:`, each item after it is a real access fault: fix the migration with a new corrective migration file (never by editing an applied one), apply it, and run the check again. If the error is anything else (for example a missing column on `auth.users`), the script itself is at fault: fix the script and re-run.

Then confirm nothing was left behind:

```sql
select
  (select count(*) from public.orgs where name in ('RLS Check Sdn Bhd', 'RLS Other Sdn Bhd')) as orgs_left,
  (select count(*) from auth.users where email like '%@rls-check.openkuasa-test.dev') as users_left;
```

Expected: `orgs_left = 0`, `users_left = 0`.

- [ ] **Step 4: Run the live tests**

Run: `pnpm vitest run --dir tests people.rls`
Expected: PASS, 7 tests. (If they were skipped in Task 9, the Supabase variables are missing: copy `.env.local` into the worktree, it is gitignored.)

If the first test fails on the `update … designation` step with `permission denied for column updated_at`, the touch trigger's write to `updated_at` is being checked against the caller's column grants. Fix it with a new migration, `20261013090900_people_updated_at_grant.sql`, containing `grant update (updated_at) on public.employees to authenticated;` and `grant update (updated_at) on public.employee_private to authenticated;` (the reach tables needed the same for `ad_settings`), apply it, and re-run.

- [ ] **Step 5: Apply the schedule and check the advisors**

Call `apply_migration` with `people_demo_cron`. Then:

```sql
select jobname, schedule, active from cron.job where jobname = 'reseed-demo-people';
```

Expected: one row, `15 * * * *`, `active = true`.

Call `mcp__openkuasa-supabase__get_advisors` with type `security`. Expected: no new finding that names a `people`/HR table or one of the new `private.*` functions. A finding about a table without a policy, or a function with a mutable search path, must be fixed before the PR.

- [ ] **Step 6: Push and open the PR**

```bash
gh api user --jq .login          # must print: OpenKuasa
git fetch origin
git rebase origin/main
pnpm vitest run --dir tests
git push -u origin feat-085-lekiu-foundation-chat
gh issue list --state open       # look for a tracking issue for Lekiu's data foundation
gh pr create --title "feat-085-lekiu-foundation-chat" --body "Lekiu database foundation (plan A of three).

- 24 HR tables with two-tier access: owner/admin read everything; members read shared tables and only their own personal rows; the demo workspace is readable in full by its members
- Admin-only writes on departments, employees and employee_private; every other table is read-only for now
- Employee records link to signed-in users by confirmed work email, or by hand
- Demo HR data rebuilt hourly and anchored to today

No app code reads these tables yet. Migrations are already applied to the live project and the access checks pass (tests/people.rls.test.ts, supabase/tests/people_rls_check.sql).

Spec: docs/superpowers/specs/2026-10-10-lekiu-foundation-chat-design.md"
```

If `gh issue list` shows an open issue that tracks this work, add a `Closes #<that number>` line to the body. If none does, add nothing. Do not merge: the owner reviews first.
