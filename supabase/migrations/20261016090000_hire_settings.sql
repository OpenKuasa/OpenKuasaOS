-- Lekir slice 2b: a workspace's public job board. One settings row per
-- workspace, and two functions that are the only thing a signed-out visitor
-- can reach. A workspace with no row has the defaults: board off.

create table public.hire_settings (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  careers_enabled boolean not null default false,
  careers_headline text check (char_length(careers_headline) <= 80),
  careers_tagline text check (char_length(careers_tagline) <= 160),
  updated_at timestamptz not null default now()
);
alter table public.hire_settings enable row level security;

create policy hire_settings_select on public.hire_settings for select to authenticated
  using (private.is_org_member(org_id));
create policy hire_settings_write on public.hire_settings for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
-- The project adds mfa_required to new public tables by itself; replace it so
-- this file gives the same result with or without that trigger.
drop policy if exists mfa_required on public.hire_settings;
create policy mfa_required on public.hire_settings as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

revoke all on public.hire_settings from anon, authenticated;
grant select, insert on public.hire_settings to authenticated;
grant update (careers_enabled, careers_headline, careers_tagline, updated_at) on public.hire_settings to authenticated;

-- ---------------------------------------------------------------------------
-- The public board: one row per open job of a workspace whose board is on.
-- A board that is on with no open jobs gives one row with a null job_id, so
-- the page can show the workspace's name instead of "not found". Nothing for
-- a board that is off, the demo workspace, or an unknown id.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_careers(p_org_id uuid)
returns table (
  org_name text, headline text, tagline text,
  job_id uuid, title text, department text, location text,
  work_arrangement text, employment_type text, closes_on date, accepting boolean
)
language sql security definer stable set search_path = '' as $$
  select
    o.name, s.careers_headline, s.careers_tagline,
    j.id, j.title, j.department, j.location,
    j.work_arrangement, j.employment_type, j.closes_on,
    case when j.id is null then null
         else j.closes_on is null or j.closes_on >= (now() at time zone 'Asia/Kuala_Lumpur')::date end
  from public.orgs o
  join public.hire_settings s on s.org_id = o.id and s.careers_enabled
  left join public.hire_jobs j
    on j.org_id = o.id and j.status = 'open' and nullif(btrim(j.description), '') is not null
  where o.id = p_org_id
    and o.slug is distinct from 'rimba-ventures-demo'
  order by j.opened_at desc nulls last, j.title;
$$;

-- ---------------------------------------------------------------------------
-- One open job of a workspace whose board is on. The salary is given only
-- when the workspace chose to show it.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_job(p_org_id uuid, p_job_id uuid)
returns table (
  org_name text, headline text, tagline text,
  job_id uuid, title text, department text, location text,
  work_arrangement text, employment_type text, closes_on date, accepting boolean,
  description text, salary_min_cents bigint, salary_max_cents bigint
)
language sql security definer stable set search_path = '' as $$
  select
    o.name, s.careers_headline, s.careers_tagline,
    j.id, j.title, j.department, j.location,
    j.work_arrangement, j.employment_type, j.closes_on,
    j.closes_on is null or j.closes_on >= (now() at time zone 'Asia/Kuala_Lumpur')::date,
    j.description,
    case when j.show_salary then j.salary_min_cents end,
    case when j.show_salary then j.salary_max_cents end
  from public.orgs o
  join public.hire_settings s on s.org_id = o.id and s.careers_enabled
  join public.hire_jobs j
    on j.org_id = o.id and j.status = 'open' and nullif(btrim(j.description), '') is not null
  where o.id = p_org_id
    and j.id = p_job_id
    and o.slug is distinct from 'rimba-ventures-demo';
$$;

revoke execute on function public.get_public_careers(uuid) from public, anon, authenticated;
revoke execute on function public.get_public_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_public_careers(uuid) to anon, authenticated;
grant execute on function public.get_public_job(uuid, uuid) to anon, authenticated;
