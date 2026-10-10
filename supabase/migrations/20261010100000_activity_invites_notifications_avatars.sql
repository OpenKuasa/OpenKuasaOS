-- Account features: activity log, in-app notifications, member invites and
-- role management, avatars, and a per-user active workspace.
-- Additive only. Writes to activity_log, notifications, org_invites and
-- org_members all go through SECURITY DEFINER functions; clients only read
-- (plus marking their own notifications read).

-- ---------------------------------------------------------------------------
-- profiles: avatar + active workspace
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column avatar_path text,
  add column current_org_id uuid references public.orgs(id) on delete set null;
grant update (avatar_path, current_org_id) on public.profiles to authenticated;

-- The org a user is "in": their chosen one if they are still a member of it,
-- otherwise their earliest membership.
create or replace function private.current_org(p_user uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select coalesce(
    (select m.org_id
       from public.profiles p
       join public.org_members m on m.org_id = p.current_org_id and m.user_id = p.user_id
      where p.user_id = p_user),
    (select m.org_id from public.org_members m
      where m.user_id = p_user order by m.created_at asc limit 1)
  );
$$;
revoke execute on function private.current_org(uuid) from public, anon, authenticated;

create or replace function private.display_name(p_user uuid)
returns text language sql security definer stable set search_path = public as $$
  select coalesce(
    (select coalesce(nullif(trim(p.full_name), ''), nullif(split_part(p.email, '@', 1), ''))
       from public.profiles p where p.user_id = p_user),
    'Member'
  );
$$;
revoke execute on function private.display_name(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- activity_log
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  action text not null,
  target text,
  category text not null check (category in ('auth','team','data','security','billing')),
  created_at timestamptz not null default now()
);
alter table public.activity_log enable row level security;
create index activity_log_org_created_idx on public.activity_log (org_id, created_at desc);

create policy activity_log_select on public.activity_log
  for select to authenticated using (private.is_org_member(org_id));
revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

-- ---------------------------------------------------------------------------
-- notifications (in-app)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.orgs(id) on delete cascade,
  event text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

create policy notifications_select on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Inserts one in-app notification unless the recipient has switched that
-- event (or the in-app channel) off. 'security' is always delivered.
create or replace function private.deliver_notification(
  p_user uuid, p_org uuid, p_event text, p_title text, p_body text, p_href text
) returns void language plpgsql security definer set search_path = public as $$
declare prefs jsonb;
begin
  if p_event <> 'security' then
    select notification_prefs into prefs from public.profiles where user_id = p_user;
    if coalesce((prefs->'channels'->>'inapp')::boolean, true) = false then return; end if;
    if coalesce((prefs->'events'->p_event->>'inapp')::boolean, true) = false then return; end if;
  end if;
  insert into public.notifications (user_id, org_id, event, title, body, href)
  values (p_user, p_org, p_event, left(p_title, 200), left(p_body, 500), p_href);
end; $$;
revoke execute on function private.deliver_notification(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;

-- Records one activity row for the caller's current org and optionally fans
-- out a notification to themselves ('self') or to the org's owners/admins
-- ('admins'). Viewers (incl. demo guests) are silently ignored.
create or replace function public.log_event(
  p_action text,
  p_category text,
  p_target text default null,
  p_notify text default null,
  p_event text default 'team_activity',
  p_title text default null,
  p_body text default null,
  p_href text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  org uuid;
  r record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  org := private.current_org(uid);
  if org is null then return; end if;
  if not exists (
    select 1 from public.org_members
    where org_id = org and user_id = uid and role <> 'viewer'
  ) then return; end if;

  insert into public.activity_log (org_id, actor_id, actor_name, action, target, category)
  values (org, uid, private.display_name(uid), left(p_action, 200), left(p_target, 200), p_category);

  if p_title is null or (p_href is not null and p_href not like '/%') then return; end if;
  if p_notify = 'self' then
    perform private.deliver_notification(uid, org, p_event, p_title, p_body, p_href);
  elsif p_notify = 'admins' then
    for r in
      select user_id from public.org_members
      where org_id = org and role in ('owner','admin') and user_id <> uid
    loop
      perform private.deliver_notification(r.user_id, org, p_event, p_title, p_body, p_href);
    end loop;
  end if;
end; $$;
revoke all on function public.log_event(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.log_event(text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- org_invites (link-based)
-- ---------------------------------------------------------------------------
create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin','member','viewer')),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);
alter table public.org_invites enable row level security;
create unique index org_invites_pending_idx on public.org_invites (org_id, email)
  where accepted_at is null and revoked_at is null;

create policy org_invites_select on public.org_invites
  for select to authenticated using (private.is_org_admin(org_id));
revoke all on public.org_invites from anon, authenticated;
grant select on public.org_invites to authenticated;

create or replace function public.create_invite(p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  org uuid;
  addr text := lower(trim(p_email));
  new_token uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  org := private.current_org(uid);
  if org is null or not private.is_org_admin(org) then raise exception 'not allowed'; end if;
  if p_role not in ('admin','member','viewer') then raise exception 'invalid role'; end if;
  if addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if exists (
    select 1 from public.org_members m
    join public.profiles p on p.user_id = m.user_id
    where m.org_id = org and lower(p.email) = addr
  ) then raise exception 'already a member'; end if;

  update public.org_invites set revoked_at = now()
  where org_id = org and email = addr and accepted_at is null and revoked_at is null;

  insert into public.org_invites (org_id, email, role, invited_by)
  values (org, addr, p_role, uid) returning token into new_token;

  insert into public.activity_log (org_id, actor_id, actor_name, action, target, category)
  values (org, uid, private.display_name(uid), 'Invited a member as ' || p_role, addr, 'team');
  return new_token;
end; $$;

create or replace function public.revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
declare inv public.org_invites;
begin
  select * into inv from public.org_invites where id = p_invite;
  if inv.id is null or not private.is_org_admin(inv.org_id) then raise exception 'not allowed'; end if;
  update public.org_invites set revoked_at = now()
  where id = p_invite and accepted_at is null and revoked_at is null;
  if found then
    insert into public.activity_log (org_id, actor_id, actor_name, action, target, category)
    values (inv.org_id, auth.uid(), private.display_name(auth.uid()), 'Revoked an invite', inv.email, 'team');
  end if;
end; $$;

-- Readable with just the token, so the accept page works before sign-in.
create or replace function public.get_invite(p_token uuid)
returns table (org_name text, email text, role text, status text)
language sql security definer stable set search_path = public as $$
  select o.name, i.email, i.role,
    case
      when i.accepted_at is not null then 'accepted'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at < now() then 'expired'
      else 'pending'
    end
  from public.org_invites i join public.orgs o on o.id = i.org_id
  where i.token = p_token;
$$;

create or replace function public.accept_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv public.org_invites;
  my_email text;
  who text;
  org_name text;
  r record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select lower(email) into my_email from auth.users where id = uid and is_anonymous is not true;
  select * into inv from public.org_invites where token = p_token for update;
  if inv.id is null then raise exception 'invite not found'; end if;
  if inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at < now() then
    raise exception 'invite no longer valid';
  end if;
  if my_email is null or my_email <> inv.email then raise exception 'invite is for another email'; end if;

  insert into public.org_members (org_id, user_id, role)
  values (inv.org_id, uid, inv.role)
  on conflict (org_id, user_id) do nothing;
  update public.org_invites set accepted_at = now() where id = inv.id;
  update public.profiles set current_org_id = inv.org_id where user_id = uid;

  who := private.display_name(uid);
  select name into org_name from public.orgs where id = inv.org_id;
  insert into public.activity_log (org_id, actor_id, actor_name, action, target, category)
  values (inv.org_id, uid, who, 'Joined the workspace as ' || inv.role, inv.email, 'team');
  for r in
    select user_id from public.org_members
    where org_id = inv.org_id and role in ('owner','admin') and user_id <> uid
  loop
    perform private.deliver_notification(
      r.user_id, inv.org_id, 'team_activity',
      who || ' joined ' || org_name, inv.email || ' accepted their invite.', '/account/team');
  end loop;
  return inv.org_id;
end; $$;

-- Role changes and removal: owners/admins only, never on the owner or on
-- yourself.
create or replace function public.set_member_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  org uuid;
  current_role_name text;
  org_name text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  org := private.current_org(uid);
  if org is null or not private.is_org_admin(org) then raise exception 'not allowed'; end if;
  if p_role not in ('admin','member','viewer') then raise exception 'invalid role'; end if;
  if p_user = uid then raise exception 'cannot change your own role'; end if;
  select role into current_role_name from public.org_members where org_id = org and user_id = p_user;
  if current_role_name is null then raise exception 'not a member'; end if;
  if current_role_name = 'owner' then raise exception 'cannot change the owner'; end if;

  update public.org_members set role = p_role where org_id = org and user_id = p_user;
  select name into org_name from public.orgs where id = org;
  insert into public.activity_log (org_id, actor_id, actor_name, action, target, category)
  values (org, uid, private.display_name(uid), 'Changed a role to ' || p_role, private.display_name(p_user), 'team');
  perform private.deliver_notification(
    p_user, org, 'team_activity',
    'Your role in ' || org_name || ' is now ' || p_role, null, '/account/team');
end; $$;

create or replace function public.remove_member(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  org uuid;
  current_role_name text;
  who text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  org := private.current_org(uid);
  if org is null or not private.is_org_admin(org) then raise exception 'not allowed'; end if;
  if p_user = uid then raise exception 'cannot remove yourself'; end if;
  select role into current_role_name from public.org_members where org_id = org and user_id = p_user;
  if current_role_name is null then raise exception 'not a member'; end if;
  if current_role_name = 'owner' then raise exception 'cannot remove the owner'; end if;

  who := private.display_name(p_user);
  delete from public.org_members where org_id = org and user_id = p_user;
  update public.profiles set current_org_id = null where user_id = p_user and current_org_id = org;
  insert into public.activity_log (org_id, actor_id, actor_name, action, target, category)
  values (org, uid, private.display_name(uid), 'Removed a member', who, 'team');
end; $$;

revoke all on function public.create_invite(text, text) from public, anon;
revoke all on function public.revoke_invite(uuid) from public, anon;
revoke all on function public.accept_invite(uuid) from public, anon;
revoke all on function public.set_member_role(uuid, text) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
revoke all on function public.get_invite(uuid) from public;
grant execute on function public.create_invite(text, text) to authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.get_invite(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- avatars bucket: public read, each signed-up user writes under <user_id>/
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
