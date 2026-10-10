-- Flexible, self-running schedules for agents (currently Weekly Studio).
create table public.agent_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  agent_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  nl_text text,
  interval_seconds integer not null check (interval_seconds >= 300),
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  end_at timestamptz,
  max_runs integer check (max_runs is null or max_runs between 1 and 1000),
  runs_used integer not null default 0,
  max_total_cents integer check (max_total_cents is null or max_total_cents between 0 and 100000),
  spent_cents integer not null default 0,
  status text not null default 'active' check (status in ('active','paused','completed')),
  paused_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_schedules enable row level security;
revoke all on public.agent_schedules from anon, authenticated;
grant select, insert, delete on public.agent_schedules to authenticated;
grant update (nl_text, interval_seconds, next_run_at, end_at, max_runs, max_total_cents, status, updated_at)
  on public.agent_schedules to authenticated;

create policy agent_schedules_select on public.agent_schedules
  for select to authenticated using (private.is_org_member(org_id));
create policy agent_schedules_write on public.agent_schedules
  for all to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy agent_schedules_mfa on public.agent_schedules
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create index agent_schedules_due_idx on public.agent_schedules (status, next_run_at);
create index agent_schedules_org_idx on public.agent_schedules (org_id);

-- Workspace rolling-ceiling config (safe defaults; tenant-editable).
alter table public.agent_configs
  add column daily_cap_cents integer not null default 500 check (daily_cap_cents between 0 and 1000000),
  add column weekly_cap_cents integer not null default 2000 check (weekly_cap_cents between 0 and 1000000);
grant update (daily_cap_cents, weekly_cap_cents) on public.agent_configs to authenticated;

-- Monitor-skip needs a 'skipped' run status. (The inline CHECK from the 5a
-- migration is auto-named agent_runs_status_check; if a live check shows a
-- different name, drop THAT name instead — the controller verifies at apply.)
alter table public.agent_runs drop constraint agent_runs_status_check;
alter table public.agent_runs add constraint agent_runs_status_check
  check (status in ('running','done','failed','skipped'));

-- Data migration: existing enabled cadence configs become schedule rows.
insert into public.agent_schedules (org_id, agent_key, interval_seconds, next_run_at, nl_text)
select org_id, agent_key,
  case cadence when 'daily' then 86400 when 'weekly' then 604800 end,
  now(),
  'Migrated from ' || cadence || ' cadence'
from public.agent_configs
where enabled = true and cadence in ('daily','weekly');
