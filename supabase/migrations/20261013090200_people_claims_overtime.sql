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
