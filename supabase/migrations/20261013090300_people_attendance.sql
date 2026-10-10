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
