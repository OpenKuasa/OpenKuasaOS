-- Lekir data foundation: jobs, candidates, applications, interviews (READ-ONLY this slice).
-- Writes arrive in later slices (add grants and write policies TOGETHER).

create table public.hire_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  title text not null,
  department text,
  location text,
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time','part_time','contract','internship')),
  status text not null default 'draft'
    check (status in ('draft','open','paused','closed')),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.hire_jobs enable row level security;
create index hire_jobs_org_created_idx on public.hire_jobs (org_id, created_at desc);

create table public.hire_candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  headline text,
  location text,
  skills text[] not null default '{}',
  source text,
  pool_status text not null default 'none'
    check (pool_status in ('none','available','passive','re_engaged')),
  created_at timestamptz not null default now()
);
alter table public.hire_candidates enable row level security;
create index hire_candidates_org_created_idx on public.hire_candidates (org_id, created_at desc);

create table public.hire_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  candidate_id uuid not null references public.hire_candidates(id) on delete cascade,
  job_id uuid not null references public.hire_jobs(id) on delete cascade,
  stage text not null default 'applied'
    check (stage in ('applied','screening','interview','offer','hired')),
  outcome text not null default 'active'
    check (outcome in ('active','rejected','withdrawn')),
  rating smallint check (rating between 1 and 5),
  source text,
  applied_at timestamptz not null default now(),
  offered_at timestamptz,
  hired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (candidate_id, job_id)
);
alter table public.hire_applications enable row level security;
create index hire_applications_org_applied_idx on public.hire_applications (org_id, applied_at desc);
create index hire_applications_job_idx on public.hire_applications (job_id);
create index hire_applications_candidate_idx on public.hire_applications (candidate_id);

create table public.hire_interviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  application_id uuid not null references public.hire_applications(id) on delete cascade,
  scheduled_at timestamptz not null,
  kind text not null default 'video' check (kind in ('video','onsite','phone')),
  interviewer_name text,
  status text not null default 'scheduled'
    check (status in ('scheduled','completed','cancelled','no_show')),
  created_at timestamptz not null default now()
);
alter table public.hire_interviews enable row level security;
create index hire_interviews_org_sched_idx on public.hire_interviews (org_id, scheduled_at);
create index hire_interviews_application_idx on public.hire_interviews (application_id);

-- read policy + MFA belt-and-suspenders + read-only grants, identical per table
do $$
declare t text;
begin
  foreach t in array array['hire_jobs','hire_candidates','hire_applications','hire_interviews'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_org_member(org_id))',
      t || '_select', t);
    -- The project adds mfa_required to new public tables by itself; replace it
    -- so this file gives the same result with or without that trigger.
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated '
      || 'using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
