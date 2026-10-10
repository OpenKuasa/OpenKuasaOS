-- Bendahara foundation: the records every finance screen shares.
--   * finance_contacts: one company can be a customer, a supplier or both; TIN.
--   * finance_accounts: the bank and cash accounts money moves through.
--   * finance_categories: what an expense, or income with no invoice, is for.
--   * finance_sequences + finance_next_number(): document numbers.
-- Same access model as every other table: members read, writers write, the
-- restrictive mfa_required policy, grants to authenticated only.

-- ---- contacts: customer and supplier are no longer exclusive ----------------
alter table public.finance_contacts
  add column is_customer boolean not null default false,
  add column is_supplier boolean not null default false,
  add column tin text;

update public.finance_contacts
   set is_customer = (type = 'customer'),
       is_supplier = (type = 'supplier');

alter table public.finance_contacts
  drop column type,
  add constraint finance_contacts_role_check check (is_customer or is_supplier);

-- ---- accounts --------------------------------------------------------------
create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('bank','cash')),
  bank_name text,
  account_no text,
  opening_balance numeric(14,2) not null default 0,
  opening_date date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index finance_accounts_name_key on public.finance_accounts (org_id, lower(name));

-- ---- categories ------------------------------------------------------------
create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index finance_categories_name_key on public.finance_categories (org_id, kind, lower(name));

-- ---- document numbering ----------------------------------------------------
create table public.finance_sequences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  doc_type text not null check (doc_type in ('invoice','quotation','credit_note','bill','receipt','voucher')),
  prefix text not null,
  next_number integer not null default 1 check (next_number >= 1),
  pad integer not null default 4 check (pad between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, doc_type)
);

-- ---- RLS, second factor, grants -------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['finance_accounts','finance_categories','finance_sequences'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_org_member(org_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_org_writer(org_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.is_org_writer(org_id))', t || '_delete', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated '
      || 'using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Hands out the next number for one document type, e.g. INV-0001. The UPDATE
-- locks the workspace's row for that type, so two callers at the same moment
-- wait for each other and never receive the same number. Runs as the caller:
-- RLS on finance_sequences is what stops a viewer or another workspace.
create or replace function public.finance_next_number(target_org uuid, doc text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  default_prefix text;
  p text;
  n integer;
  w integer;
begin
  if not private.is_org_writer(target_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  default_prefix := case doc
    when 'invoice' then 'INV-'
    when 'quotation' then 'QT-'
    when 'credit_note' then 'CN-'
    when 'bill' then 'BILL-'
    when 'receipt' then 'RC-'
    when 'voucher' then 'PV-'
  end;
  if default_prefix is null then
    raise exception 'unknown document type %', doc using errcode = '22023';
  end if;

  insert into public.finance_sequences (org_id, doc_type, prefix)
  values (target_org, doc, default_prefix)
  on conflict (org_id, doc_type) do nothing;

  update public.finance_sequences
     set next_number = next_number + 1, updated_at = now()
   where org_id = target_org and doc_type = doc
  returning prefix, next_number - 1, pad into p, n, w;

  -- lpad cuts a string longer than the target, so never pad to less than the number's own length.
  return p || lpad(n::text, greatest(w, length(n::text)), '0');
end $$;

revoke all on function public.finance_next_number(uuid, text) from public, anon;
grant execute on function public.finance_next_number(uuid, text) to authenticated;

-- ---- default categories ----------------------------------------------------
-- Every workspace, existing and future, starts with the same short list.
create or replace function private.finance_seed_categories(target_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.finance_categories (org_id, name, kind)
  select target_org, v.name, v.kind
  from (values
    ('Rent','expense'), ('Utilities','expense'), ('Marketing','expense'),
    ('Travel','expense'), ('Supplies','expense'), ('Salaries','expense'),
    ('Services','expense'), ('Sales','income'), ('Other income','income')
  ) as v(name, kind)
  on conflict do nothing;
$$;
revoke all on function private.finance_seed_categories(uuid) from public, anon, authenticated;

create or replace function private.finance_seed_new_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.finance_seed_categories(new.id);
  return new;
end $$;
revoke all on function private.finance_seed_new_org() from public, anon, authenticated;

create trigger finance_seed_new_org
  after insert on public.orgs
  for each row execute function private.finance_seed_new_org();

select private.finance_seed_categories(id) from public.orgs;
