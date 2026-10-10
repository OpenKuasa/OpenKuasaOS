-- Ask-Jebat per-user/day quota.
-- The LLM is the only metered cost and confirm-email is off, so a signed-in
-- account is cheap to create. This is the durable server-side backstop on top of
-- the spend limit set on the OpenRouter key. Writes happen only through the
-- SECURITY DEFINER consume_ai_quota() RPC; the route calls it with the user's
-- session (role `authenticated`).

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

-- A user may read their own usage; there is no INSERT/UPDATE policy — the only
-- writer is consume_ai_quota() (SECURITY DEFINER), mirroring how org_members is
-- written only through create_org_for_current_user()/join_demo_org().
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select using (user_id = (select auth.uid()));

-- Atomically increment today's count and report the remaining allowance.
-- Returns `daily_limit - count` (>= 0) when under the cap, or -1 when over or
-- when there is no session.
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
  if uid is null then
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

revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;
