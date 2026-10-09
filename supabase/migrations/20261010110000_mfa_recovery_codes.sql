-- Two-factor recovery codes. Supabase Auth owns the TOTP factors; these are
-- our own break-glass codes. Only SHA-256 hashes are stored, clients get no
-- table access at all, and everything goes through SECURITY DEFINER functions.
-- Redeeming a code removes the user's factors, so the next token refresh is a
-- normal single-factor session and they can set 2FA up again.

create table public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.mfa_recovery_codes enable row level security;
create index mfa_recovery_codes_user_idx on public.mfa_recovery_codes (user_id);
revoke all on public.mfa_recovery_codes from anon, authenticated;

create table public.mfa_recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.mfa_recovery_attempts enable row level security;
create index mfa_recovery_attempts_user_idx on public.mfa_recovery_attempts (user_id, created_at desc);
revoke all on public.mfa_recovery_attempts from anon, authenticated;

-- Replaces the caller's codes. Only a session that has just passed the
-- second factor (aal2) may mint codes, so a stolen password cannot.
create or replace function public.replace_recovery_codes(p_hashes text[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  h text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then raise exception 'second factor required'; end if;
  if p_hashes is null or array_length(p_hashes, 1) is null or array_length(p_hashes, 1) > 20 then
    raise exception 'invalid codes';
  end if;
  foreach h in array p_hashes loop
    if h !~ '^[0-9a-f]{64}$' then raise exception 'invalid codes'; end if;
  end loop;

  delete from public.mfa_recovery_codes where user_id = uid;
  insert into public.mfa_recovery_codes (user_id, code_hash)
  select uid, x from unnest(p_hashes) as x;
  return array_length(p_hashes, 1);
end; $$;

create or replace function public.recovery_codes_remaining()
returns integer language sql security definer stable set search_path = public as $$
  select count(*)::integer from public.mfa_recovery_codes
  where user_id = auth.uid() and used_at is null;
$$;

-- Break-glass sign-in: a valid unused code removes the caller's factors and
-- remaining codes. Returns false for a wrong code; raises 'too many attempts'
-- after 5 failures in 15 minutes.
create or replace function public.redeem_recovery_code(p_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  matched uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if (
    select count(*) from public.mfa_recovery_attempts
    where user_id = uid and created_at > now() - interval '15 minutes'
  ) >= 5 then
    raise exception 'too many attempts';
  end if;

  select id into matched from public.mfa_recovery_codes
  where user_id = uid and used_at is null and code_hash = p_hash
  limit 1 for update;

  if matched is null then
    insert into public.mfa_recovery_attempts (user_id) values (uid);
    return false;
  end if;

  delete from auth.mfa_factors where user_id = uid;
  delete from public.mfa_recovery_codes where user_id = uid;
  delete from public.mfa_recovery_attempts where user_id = uid;
  return true;
end; $$;

-- Called after 2FA is switched off: codes for a factor that no longer exists
-- must not linger. Refuses while a verified factor is still enrolled.
create or replace function public.clear_recovery_codes()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (
    select 1 from auth.mfa_factors where user_id = uid and status = 'verified'
  ) then raise exception 'second factor still enrolled'; end if;
  delete from public.mfa_recovery_codes where user_id = uid;
end; $$;

revoke all on function public.replace_recovery_codes(text[]) from public, anon;
revoke all on function public.recovery_codes_remaining() from public, anon;
revoke all on function public.redeem_recovery_code(text) from public, anon;
revoke all on function public.clear_recovery_codes() from public, anon;
grant execute on function public.replace_recovery_codes(text[]) to authenticated;
grant execute on function public.recovery_codes_remaining() to authenticated;
grant execute on function public.redeem_recovery_code(text) to authenticated;
grant execute on function public.clear_recovery_codes() to authenticated;
