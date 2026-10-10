-- Jebat data foundation: campaigns, leads, appointments (READ-ONLY this slice)
-- Writes arrive in later CRUD slices (add grant + is_org_writer policy TOGETHER).

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('whatsapp','facebook','instagram','tiktok')),
  status text not null default 'active' check (status in ('active','paused')),
  leads_count int not null default 0,
  spend_cents bigint not null default 0,
  cpl_cents bigint,
  created_at timestamptz not null default now()
);
alter table public.campaigns enable row level security;
create index campaigns_org_created_idx on public.campaigns (org_id, created_at desc);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('whatsapp','facebook','instagram','tiktok')),
  stage text not null check (stage in ('lead','contacted','qualified','booked','won')),
  source text,
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
create index leads_org_created_idx on public.leads (org_id, created_at desc);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_name text not null,
  kind text not null,
  scheduled_at timestamptz not null,
  via text,
  created_at timestamptz not null default now()
);
alter table public.appointments enable row level security;
create index appointments_org_sched_idx on public.appointments (org_id, scheduled_at);

-- read policy + MFA belt-and-suspenders + read-only grants, identical per table
do $$
declare t text;
begin
  foreach t in array array['campaigns','leads','appointments'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_org_member(org_id))',
      t || '_select', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated '
      || 'using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
