-- Jebat autonomous agent (Weekly Studio): configs, runs, assets. Already applied live; committed for reproducibility.
-- One config row per (org, agent). Owner-editable.
create table public.agent_configs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  agent_key text not null,
  enabled boolean not null default false,
  cadence text not null default 'weekly' check (cadence in ('off','daily','weekly')),
  max_cost_cents integer not null default 200 check (max_cost_cents between 0 and 10000),
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, agent_key)
);

-- One row per autonomous (or manual) run. Written by the worker only.
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  agent_key text not null,
  status text not null default 'running' check (status in ('running','done','failed')),
  trigger text not null default 'schedule' check (trigger in ('schedule','manual')),
  digest_md text,
  cost_cents integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- One row per generated asset on a run. Video rows start 'pending'.
create table public.agent_run_assets (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null check (kind in ('poster','image','video')),
  status text not null default 'pending' check (status in ('pending','done','failed')),
  provider_job_id text,
  storage_path text,
  created_at timestamptz not null default now()
);

alter table public.agent_configs enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_run_assets enable row level security;

create policy agent_configs_select on public.agent_configs for select to authenticated using (private.is_org_member(org_id));
create policy agent_configs_write on public.agent_configs for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy agent_runs_select on public.agent_runs for select to authenticated using (private.is_org_member(org_id));
create policy agent_run_assets_select on public.agent_run_assets for select to authenticated using (private.is_org_member(org_id));

create policy mfa_required on public.agent_configs as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.agent_runs as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.agent_run_assets as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

grant select on public.agent_configs, public.agent_runs, public.agent_run_assets to authenticated;
grant insert on public.agent_configs to authenticated;
grant update (enabled, cadence, max_cost_cents, last_run_at, updated_at) on public.agent_configs to authenticated;
grant delete on public.agent_configs to authenticated;
-- No insert/update/delete grant on agent_runs or agent_run_assets (service role only).

insert into storage.buckets (id, name, public) values ('agent-assets','agent-assets',false) on conflict (id) do nothing;
