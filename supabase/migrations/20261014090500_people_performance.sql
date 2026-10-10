-- Lekiu performance: goals, scorecards, reviews, and training with
-- enrolments. The training catalogue is shared; who is enrolled is personal.
-- Read-only this slice.

create table public.hr_goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  progress smallint not null default 0 check (progress between 0 and 100),
  due_date date,
  status text not null default 'on_track' check (status in ('on_track','at_risk','done')),
  created_at timestamptz not null default now(),
  foreign key (employee_id, org_id) references public.hr_employees(id, org_id) on delete cascade
);
create index hr_goals_employee_idx on public.hr_goals (employee_id);
create index hr_goals_org_idx on public.hr_goals (org_id);

create table public.hr_scorecards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  period text not null,
  score numeric(3,1) not null check (score between 0 and 5),
  competencies jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (employee_id, period),
  foreign key (employee_id, org_id) references public.hr_employees(id, org_id) on delete cascade
);
create index hr_scorecards_org_idx on public.hr_scorecards (org_id, period);

create table public.hr_reviews (
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
  foreign key (employee_id, org_id) references public.hr_employees(id, org_id) on delete cascade
);
create index hr_reviews_org_idx on public.hr_reviews (org_id, period);

create table public.hr_trainings (
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
create index hr_trainings_org_idx on public.hr_trainings (org_id, starts_on desc);

create table public.hr_training_enrolments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  employee_id uuid not null,
  training_id uuid not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (employee_id, training_id),
  foreign key (employee_id, org_id) references public.hr_employees(id, org_id) on delete cascade,
  foreign key (training_id, org_id) references public.hr_trainings(id, org_id) on delete cascade
);
create index hr_training_enrolments_training_idx on public.hr_training_enrolments (training_id);
create index hr_training_enrolments_org_idx on public.hr_training_enrolments (org_id);

select private.people_secure_table('hr_goals', 'personal');
select private.people_secure_table('hr_scorecards', 'personal');
select private.people_secure_table('hr_reviews', 'personal');
select private.people_secure_table('hr_trainings', 'shared');
select private.people_secure_table('hr_training_enrolments', 'personal');
