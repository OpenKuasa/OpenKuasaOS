-- Public lead forms: a visitor who is not signed in can open an active form at
-- /f/<form id>, fill it in and submit it. Each submission is recorded here,
-- makes (or finds) a Kasturi contact, and moves the form's two counters.
--
-- Access is in two layers, as everywhere else, plus one rule of its own:
--   * members read their workspace's submissions, writers may delete one, and
--     nobody may insert or update one through the API (there is no grant);
--   * `anon` has no grant on forms, form_submissions or crm_contacts. Everything
--     a visitor does goes through the three SECURITY DEFINER functions below,
--     each with a pinned, empty search_path (every name is schema-qualified) and
--     EXECUTE granted to anon and authenticated only.
--
-- No IP address, user agent or other trace of the visitor is stored: a row is
-- what they typed and when.

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  -- The contact this submission made or matched. Deleting the contact keeps the
  -- submission; (contact_id, org_id) keeps the pair inside one workspace.
  contact_id uuid,
  -- What was submitted. Four fixed fields today (name, email, phone, message);
  -- a form builder can add keys later without changing the table.
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint form_submissions_contact_fkey foreign key (contact_id, org_id)
    references public.crm_contacts(id, org_id) on delete set null (contact_id)
);
alter table public.form_submissions enable row level security;
create index form_submissions_org_created_idx on public.form_submissions (org_id, created_at desc);
create index form_submissions_form_created_idx on public.form_submissions (form_id, created_at desc);
create index form_submissions_contact_idx on public.form_submissions (contact_id);

create policy form_submissions_select on public.form_submissions for select to authenticated
  using (private.is_org_member(org_id));
create policy form_submissions_delete on public.form_submissions for delete to authenticated
  using (private.is_org_writer(org_id));
create policy mfa_required on public.form_submissions as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.form_submissions from anon, authenticated;
grant select, delete on public.form_submissions to authenticated;

-- Lets the submit function find "this email is already a contact here" without
-- reading every contact in the workspace. Not unique: the Contacts page has
-- always allowed two contacts with one email, and still does.
create index crm_contacts_org_lower_email_idx on public.crm_contacts (org_id, lower(email));

-- ---------------------------------------------------------------------------
-- What the public page may know about a form: its name, the workspace's display
-- name, and whether it is taking responses. No row for an unknown id. A form
-- that is not taking responses gives no names at all.
--
-- A form takes responses when it is active. The shared demo workspace never
-- does: every demo guest reads that workspace, so a public form there would let
-- anyone on the internet write into what they all see.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_form(p_form_id uuid)
returns table (form_name text, org_name text, accepting boolean)
language sql security definer stable set search_path = '' as $$
  select
    case when a.accepting then f.name end,
    case when a.accepting then o.name end,
    a.accepting
  from public.forms f
  join public.orgs o on o.id = f.org_id
  cross join lateral (
    select f.status = 'active' and o.slug is distinct from 'rimba-ventures-demo' as accepting
  ) a
  where f.id = p_form_id;
$$;

-- ---------------------------------------------------------------------------
-- Counts one view of an active form. A signed-in member of the form's own
-- workspace previewing it is not counted. Anything else is: this is a public
-- function, so a bot or a script can raise the number.
-- ---------------------------------------------------------------------------
create or replace function public.record_form_view(p_form_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.forms f
     set views_count = f.views_count + 1
    from public.orgs o
   where f.id = p_form_id
     and o.id = f.org_id
     and f.status = 'active'
     and o.slug is distinct from 'rimba-ventures-demo'
     and not exists (
       select 1 from public.org_members m
        where m.org_id = f.org_id and m.user_id = (select auth.uid())
     );
$$;

-- ---------------------------------------------------------------------------
-- Takes one submission. Answers with a word, never an id, and the same 'ok'
-- whether the email was new or already a contact:
--   ok                 recorded (or the honeypot was filled: nothing recorded)
--   not_found          no such form
--   closed             the form is a draft, paused, or in the demo workspace
--   throttled          the form has had 30 submissions in the last minute
--   invalid_name, name_too_long, invalid_email, email_too_long,
--   phone_too_long, message_too_long
--
-- The page checks the same rules first; they are checked again here because
-- anyone can call this function directly.
-- ---------------------------------------------------------------------------
create or replace function public.submit_public_form(
  p_form_id uuid,
  p_name text,
  p_email text,
  p_phone text default null,
  p_message text default null,
  p_honeypot text default null
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_form_id uuid;
  v_org_id uuid;
  v_form_name text;
  v_accepting boolean;
  v_space integer;
  v_contact_id uuid;
begin
  -- A field no person can see was filled in: say thanks and keep nothing.
  if btrim(coalesce(p_honeypot, '')) <> '' then
    return 'ok';
  end if;

  -- Lengths first, so nothing below works on an over-long value.
  if char_length(v_name) > 120 then return 'name_too_long'; end if;
  if char_length(v_email) > 254 then return 'email_too_long'; end if;
  if char_length(v_phone) > 40 then return 'phone_too_long'; end if;
  if char_length(v_message) > 2000 then return 'message_too_long'; end if;

  -- One line of text: runs of spaces, tabs and line breaks become one space.
  v_name := btrim(regexp_replace(v_name, '\s+', ' ', 'g'));
  v_phone := btrim(regexp_replace(v_phone, '\s+', ' ', 'g'));
  if v_name = '' then return 'invalid_name'; end if;
  -- The shape the Contacts page asks for: something@something.something.
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return 'invalid_email'; end if;

  -- Locking the form's row makes submissions to one form take turns, so the
  -- throttle and the counter below cannot be raced.
  select f.id, f.org_id, f.name,
         f.status = 'active' and o.slug is distinct from 'rimba-ventures-demo'
    into v_form_id, v_org_id, v_form_name, v_accepting
    from public.forms f
    join public.orgs o on o.id = f.org_id
   where f.id = p_form_id
     for update of f;
  if v_form_id is null then return 'not_found'; end if;
  if not v_accepting then return 'closed'; end if;

  if (select count(*) from public.form_submissions s
       where s.form_id = v_form_id and s.created_at > now() - interval '1 minute') >= 30 then
    return 'throttled';
  end if;

  -- Two forms of one workspace receiving the same new email at the same moment
  -- must not make two contacts.
  perform pg_advisory_xact_lock(hashtextextended(v_org_id::text || ':' || v_email, 0));

  select c.id into v_contact_id
    from public.crm_contacts c
   where c.org_id = v_org_id and lower(c.email) = v_email
   order by c.created_at asc, c.id asc
   limit 1;

  -- An existing contact is linked and left exactly as it is: a visitor must not
  -- be able to rewrite a record by typing someone else's email.
  if v_contact_id is null then
    v_space := position(' ' in v_name);
    insert into public.crm_contacts (org_id, first_name, last_name, email, phone, source, status, tags)
    values (
      v_org_id,
      case when v_space > 0 then left(v_name, v_space - 1) else v_name end,
      case when v_space > 0 then substr(v_name, v_space + 1) end,
      v_email,
      nullif(v_phone, ''),
      'Lead form: ' || v_form_name,
      'lead',
      array['lead-form']
    )
    returning id into v_contact_id;
  end if;

  insert into public.form_submissions (org_id, form_id, contact_id, payload)
  values (
    v_org_id, v_form_id, v_contact_id,
    jsonb_build_object(
      'name', v_name,
      'email', v_email,
      'phone', nullif(v_phone, ''),
      'message', nullif(v_message, '')
    )
  );

  update public.forms set submissions_count = submissions_count + 1 where id = v_form_id;

  return 'ok';
end $$;

-- New functions are executable by everyone until told otherwise.
revoke execute on function public.get_public_form(uuid) from public, anon, authenticated;
revoke execute on function public.record_form_view(uuid) from public, anon, authenticated;
revoke execute on function public.submit_public_form(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.get_public_form(uuid) to anon, authenticated;
grant execute on function public.record_form_view(uuid) to anon, authenticated;
grant execute on function public.submit_public_form(uuid, text, text, text, text, text) to anon, authenticated;
