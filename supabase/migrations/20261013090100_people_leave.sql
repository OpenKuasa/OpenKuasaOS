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
