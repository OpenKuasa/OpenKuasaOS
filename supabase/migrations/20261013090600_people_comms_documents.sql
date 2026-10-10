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
