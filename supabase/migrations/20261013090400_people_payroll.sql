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
