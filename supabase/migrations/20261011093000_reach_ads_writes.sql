-- Slice 2: make campaigns writable, add creatives + ad_settings. Two-layer access
-- (grant ceiling + is_org_writer RLS) per table. cpl_cents becomes generated.

-- campaigns: CPL derived + honest (null at zero leads), unforgeable (not granted).
alter table public.campaigns drop column cpl_cents;
alter table public.campaigns add column cpl_cents bigint
  generated always as (case when leads_count > 0 then spend_cents / leads_count else null end) stored;
create policy campaigns_write on public.campaigns for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
grant insert on public.campaigns to authenticated;
grant update (name, channel, status, spend_cents, leads_count) on public.campaigns to authenticated;
grant delete on public.campaigns to authenticated;

-- creatives (metadata only).
create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  type text not null check (type in ('image','video','copy')),
  channel text not null check (channel in ('whatsapp','facebook','instagram','tiktok')),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  body text,
  ctr numeric,
  created_at timestamptz not null default now()
);
alter table public.creatives enable row level security;
create index creatives_org_created_idx on public.creatives (org_id, created_at desc);
create policy creatives_select on public.creatives for select to authenticated
  using (private.is_org_member(org_id));
create policy creatives_write on public.creatives for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy mfa_required on public.creatives as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.creatives from anon, authenticated;
grant select on public.creatives to authenticated;
grant insert on public.creatives to authenticated;
grant update (campaign_id, name, type, channel, status, body, ctr) on public.creatives to authenticated;
grant delete on public.creatives to authenticated;

-- ad_settings (one row per org; org_id is the PK).
create table public.ad_settings (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  daily_cap_cents bigint,
  monthly_cap_cents bigint,
  currency text not null default 'MYR' check (char_length(currency) = 3),
  automation jsonb not null default '{}'::jsonb,
  notifications jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.ad_settings enable row level security;
create policy ad_settings_select on public.ad_settings for select to authenticated
  using (private.is_org_member(org_id));
create policy ad_settings_write on public.ad_settings for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy mfa_required on public.ad_settings as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.ad_settings from anon, authenticated;
grant select on public.ad_settings to authenticated;
grant insert on public.ad_settings to authenticated;
grant update (daily_cap_cents, monthly_cap_cents, currency, automation, notifications) on public.ad_settings to authenticated;
