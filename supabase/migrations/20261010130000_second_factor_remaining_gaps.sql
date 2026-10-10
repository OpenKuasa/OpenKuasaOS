-- Close the remaining gaps in database-level two-factor enforcement: the two
-- membership-creating functions and the Ask-Jebat quota. A session that still
-- owes an authenticator code can now do nothing through the data API except
-- redeem a recovery code.

create or replace function public.create_org_for_current_user(org_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not private.mfa_ok() then raise exception 'second factor required'; end if;
  insert into public.orgs (name) values (org_name) returning id into new_id;
  insert into public.org_members (org_id, user_id, role)
  values (new_id, auth.uid(), 'owner');
  return new_id;
end; $$;

create or replace function public.join_demo_org()
returns uuid language plpgsql security definer set search_path = public as $$
declare demo_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not private.mfa_ok() then raise exception 'second factor required'; end if;
  select id into demo_id from public.orgs where slug = 'rimba-ventures-demo';
  if demo_id is null then raise exception 'demo org missing'; end if;
  insert into public.org_members (org_id, user_id, role)
  values (demo_id, auth.uid(), 'viewer')
  on conflict (org_id, user_id) do nothing;
  return demo_id;
end; $$;

-- Ask-Jebat usage: own rows only, and only once the second factor is passed.
create policy mfa_required on public.ai_usage as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- A session that owes a code gets -1 (denied), the same answer as no session.
create or replace function public.consume_ai_quota(daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  uid uuid := auth.uid();
  new_count integer;
begin
  if uid is null or not private.mfa_ok() then
    return -1;
  end if;

  insert into public.ai_usage as u (user_id, day, count)
  values (uid, today, 1)
  on conflict (user_id, day)
  do update set count = u.count + 1
  returning u.count into new_count;

  if new_count > daily_limit then
    return -1;
  end if;
  return daily_limit - new_count;
end;
$$;
