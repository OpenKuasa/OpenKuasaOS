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
