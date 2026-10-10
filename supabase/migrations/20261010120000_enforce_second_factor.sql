-- Enforce two-factor authentication in the database, not just in the app.
-- A user who has a verified authenticator but whose session has only passed
-- the password step (aal1) gets no rows and no writes until they enter a
-- code (aal2). Users without an authenticator are unaffected.

create or replace function private.mfa_ok()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    );
$$;
revoke execute on function private.mfa_ok() from public, anon;
grant execute on function private.mfa_ok() to authenticated;

-- Membership helpers answer "no" for a session that still owes a code. This
-- covers every org-scoped policy and every function that gates on them
-- (create_invite, revoke_invite, set_member_role, remove_member, log_event).
create or replace function private.is_org_member(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select private.mfa_ok() and exists (
    select 1 from public.org_members
    where org_id = target and user_id = auth.uid()
  );
$$;

create or replace function private.is_org_writer(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select private.mfa_ok() and exists (
    select 1 from public.org_members
    where org_id = target and user_id = auth.uid() and role <> 'viewer'
  );
$$;

create or replace function private.is_org_admin(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select private.mfa_ok() and exists (
    select 1 from public.org_members
    where org_id = target and user_id = auth.uid() and role in ('owner','admin')
  );
$$;

create or replace function private.shares_org_with(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select private.mfa_ok() and exists (
    select 1
    from public.org_members mine
    join public.org_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid() and theirs.user_id = target
  );
$$;

create or replace function private.current_org(p_user uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select case when private.mfa_ok() then coalesce(
    (select m.org_id
       from public.profiles p
       join public.org_members m on m.org_id = p.current_org_id and m.user_id = p.user_id
      where p.user_id = p_user),
    (select m.org_id from public.org_members m
      where m.user_id = p_user order by m.created_at asc limit 1)
  ) end;
$$;

-- Restrictive policies AND with the existing ones, so they also cover the
-- policies that match on user_id alone (profiles, notifications).
create policy mfa_required on public.orgs as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.org_members as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.profiles as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.activity_log as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.notifications as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.org_invites as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create policy avatars_mfa_required on storage.objects as restrictive
  for all to authenticated
  using (bucket_id <> 'avatars' or (select private.mfa_ok()))
  with check (bucket_id <> 'avatars' or (select private.mfa_ok()));

-- accept_invite gates on nothing but the caller's email, so it needs its own
-- check: joining a workspace must wait for the second factor.
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
  if not private.mfa_ok() then raise exception 'second factor required'; end if;
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
