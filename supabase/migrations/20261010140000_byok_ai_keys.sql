-- Bring-your-own-key for AI chat.
-- A workspace stores one OpenRouter key. The app encrypts it (AES-256-GCM)
-- with a server-only secret before it reaches the database, so the stored
-- value is useless to anyone who can only talk to the data API — including
-- members of the workspace. Without a key, each user gets a small weekly
-- allowance of free questions on the platform key.

create table public.org_ai_keys (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  ciphertext text not null,
  key_hint text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.org_ai_keys enable row level security;
revoke all on public.org_ai_keys from anon, authenticated;

-- Owner/admin only. `p_ciphertext` is already encrypted by the app.
create or replace function public.set_org_ai_key(p_ciphertext text, p_hint text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  org uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  org := private.current_org(uid);
  if org is null or not private.is_org_admin(org) then raise exception 'not allowed'; end if;
  if p_ciphertext is null or length(p_ciphertext) not between 20 and 2000
     or p_hint is null or length(p_hint) > 20 then
    raise exception 'invalid key';
  end if;

  insert into public.org_ai_keys (org_id, ciphertext, key_hint, updated_by, updated_at)
  values (org, p_ciphertext, p_hint, uid, now())
  on conflict (org_id) do update
    set ciphertext = excluded.ciphertext,
        key_hint = excluded.key_hint,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  insert into public.activity_log (org_id, actor_id, actor_name, action, target, category)
  values (org, uid, private.display_name(uid), 'Set the workspace AI key', p_hint, 'security');
end; $$;

create or replace function public.clear_org_ai_key()
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  org uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  org := private.current_org(uid);
  if org is null or not private.is_org_admin(org) then raise exception 'not allowed'; end if;

  delete from public.org_ai_keys where org_id = org;
  if found then
    insert into public.activity_log (org_id, actor_id, actor_name, action, target, category)
    values (org, uid, private.display_name(uid), 'Removed the workspace AI key', null, 'security');
  end if;
end; $$;

-- What members may know: whether a key is set, and its last characters.
create or replace function public.org_ai_key_status()
returns table (key_hint text, updated_at timestamptz)
language sql security definer stable set search_path = public as $$
  select k.key_hint, k.updated_at
  from public.org_ai_keys k
  where k.org_id = private.current_org(auth.uid());
$$;

-- The encrypted key for the caller's workspace, for the chat route to decrypt
-- with the server secret. Any member's chat uses the workspace key.
create or replace function public.org_ai_key_ciphertext()
returns text language sql security definer stable set search_path = public as $$
  select k.ciphertext
  from public.org_ai_keys k
  where k.org_id = private.current_org(auth.uid());
$$;

-- Free questions on the platform key, per user per calendar week (UTC, Monday).
create table public.ai_free_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  count integer not null default 0,
  primary key (user_id, week_start)
);
alter table public.ai_free_usage enable row level security;
revoke all on public.ai_free_usage from anon, authenticated;

create or replace function private.ai_week_start()
returns date language sql stable set search_path = '' as $$
  select date_trunc('week', now() at time zone 'utc')::date;
$$;
revoke execute on function private.ai_week_start() from public, anon, authenticated;

-- How many free questions the caller has used this week (does not consume).
create or replace function public.free_questions_used()
returns integer language sql security definer stable set search_path = public as $$
  select coalesce((
    select u.count from public.ai_free_usage u
    where u.user_id = auth.uid() and u.week_start = private.ai_week_start()
  ), 0);
$$;

-- Atomically takes one free question. Returns how many are left (>= 0), or -1
-- when the allowance is used up, there is no session, the session is a demo
-- guest, or it still owes a second factor.
create or replace function public.consume_free_question(weekly_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  wk date := private.ai_week_start();
  new_count integer;
begin
  if uid is null or not private.mfa_ok() then return -1; end if;
  if exists (select 1 from auth.users where id = uid and is_anonymous is true) then
    return -1;
  end if;

  insert into public.ai_free_usage as u (user_id, week_start, count)
  values (uid, wk, 1)
  on conflict (user_id, week_start)
  do update set count = u.count + 1
    where u.count < weekly_limit
  returning u.count into new_count;

  -- No row returned: the update was skipped because the cap was reached.
  if new_count is null or new_count > weekly_limit then return -1; end if;
  return weekly_limit - new_count;
end; $$;

revoke all on function public.set_org_ai_key(text, text) from public, anon;
revoke all on function public.clear_org_ai_key() from public, anon;
revoke all on function public.org_ai_key_status() from public, anon;
revoke all on function public.org_ai_key_ciphertext() from public, anon;
revoke all on function public.free_questions_used() from public, anon;
revoke all on function public.consume_free_question(integer) from public, anon;
grant execute on function public.set_org_ai_key(text, text) to authenticated;
grant execute on function public.clear_org_ai_key() to authenticated;
grant execute on function public.org_ai_key_status() to authenticated;
grant execute on function public.org_ai_key_ciphertext() to authenticated;
grant execute on function public.free_questions_used() to authenticated;
grant execute on function public.consume_free_question(integer) to authenticated;
