-- Lekir slice 2a: jobs become writable. Two layers, added together: the grants
-- cap the verbs and columns, the policy scopes the rows to writers.

alter table public.hire_jobs
  add column description text check (char_length(description) <= 10000),
  add column salary_min_cents bigint check (salary_min_cents >= 0),
  add column salary_max_cents bigint check (salary_max_cents >= 0),
  add column show_salary boolean not null default false,
  add column closes_on date,
  add column work_arrangement text check (work_arrangement in ('onsite','hybrid','remote')),
  add column headcount integer not null default 1 check (headcount >= 1),
  add constraint hire_jobs_salary_range check (
    salary_min_cents is null or salary_max_cents is null or salary_max_cents >= salary_min_cents
  );

create policy hire_jobs_write on public.hire_jobs for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
grant insert on public.hire_jobs to authenticated;
grant update (title, department, location, employment_type, status, opened_at, closed_at,
              description, salary_min_cents, salary_max_cents, show_salary, closes_on,
              work_arrangement, headcount) on public.hire_jobs to authenticated;
grant delete on public.hire_jobs to authenticated;

-- A job with applications is closed, not deleted: deleting cascades to the
-- applications and their interviews. The app refuses first; this stops a direct
-- API call too. When the whole workspace is being deleted its org row is
-- already gone by the time the cascade reaches its jobs, so that is let through.
create or replace function private.hire_jobs_delete_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.orgs o where o.id = old.org_id) then
    return old;
  end if;
  if exists (select 1 from public.hire_applications a where a.job_id = old.id) then
    raise exception 'This job has applications. Close it instead.'
      using errcode = 'P0001';
  end if;
  return old;
end $$;
revoke all on function private.hire_jobs_delete_guard() from public, anon, authenticated;

create trigger hire_jobs_delete_guard
  before delete on public.hire_jobs
  for each row execute function private.hire_jobs_delete_guard();
