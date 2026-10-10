-- Account settings: per-user profiles + company details on orgs.
-- Additive only. profiles rows are created by a trigger on auth.users, so the
-- client never inserts; it may only update its own editable columns.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  job_title text,
  timezone text not null default 'Asia/Kuala_Lumpur',
  language text not null default 'en' check (language in ('en','ms')),
  product_updates boolean not null default true,
  notification_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Keep profiles.email mirrored from auth.users (null for anonymous demo users).
create or replace function private.sync_profile_from_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, nullif(new.email, ''))
  on conflict (user_id) do update set email = excluded.email;
  return new;
end; $$;
revoke execute on function private.sync_profile_from_auth_user() from public, anon, authenticated;

create trigger on_auth_user_profile_sync
  after insert or update of email on auth.users
  for each row execute function private.sync_profile_from_auth_user();

insert into public.profiles (user_id, email)
select id, nullif(email, '') from auth.users
on conflict (user_id) do nothing;

-- Team directory: a member may read the profiles of people in their org.
create or replace function private.shares_org_with(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.org_members mine
    join public.org_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid() and theirs.user_id = target
  );
$$;
revoke execute on function private.shares_org_with(uuid) from public;
grant execute on function private.shares_org_with(uuid) to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_org_with(user_id));
create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- email is owned by the trigger, so it is not in the UPDATE column list.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, job_title, timezone, language, product_updates, notification_prefs)
  on public.profiles to authenticated;

-- Company details.
alter table public.orgs
  add column registration_no text,
  add column sst_no text,
  add column website text,
  add column industry text,
  add column company_size text,
  add column address text,
  add column city text,
  add column state text,
  add column postcode text;

-- Company details are an owner/admin concern; members and viewers read only.
create or replace function private.is_org_admin(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.org_members
    where org_id = target and user_id = auth.uid() and role in ('owner','admin')
  );
$$;
revoke execute on function private.is_org_admin(uuid) from public;
grant execute on function private.is_org_admin(uuid) to authenticated;

drop policy if exists orgs_update on public.orgs;
create policy orgs_update on public.orgs
  for update to authenticated
  using (private.is_org_admin(id)) with check (private.is_org_admin(id));

-- id, slug and created_at are not client-editable (slug identifies the demo org).
revoke update on public.orgs from authenticated;
grant update (name, registration_no, sst_no, website, industry, company_size,
              address, city, state, postcode)
  on public.orgs to authenticated;
