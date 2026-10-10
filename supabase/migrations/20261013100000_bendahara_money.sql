-- Bendahara money, part 1 of 2 (additive; safe to apply while the previous
-- code is still deployed).
--   * Every workspace gets a bank account and a cash account.
--   * finance_transactions: one row per movement of money.
--   * finance_allocations: how a movement is split across documents.
--   * payments_out is copied into those two; supplier_bill_totals now reads
--     them. payments_out itself is dropped by the next migration, after the
--     code that reads it is no longer deployed.
--   * Guards: a posted bill or payment is locked and can only be voided.
--   * Functions that save, post and pay in one transaction.

-- ---- default accounts -------------------------------------------------------
create or replace function private.finance_seed_accounts(target_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.finance_accounts (org_id, name, kind)
  select target_org, v.name, v.kind
  from (values ('Main Bank','bank'), ('Cash in hand','cash')) as v(name, kind)
  on conflict do nothing;
$$;
revoke all on function private.finance_seed_accounts(uuid) from public, anon, authenticated;

create or replace function private.finance_seed_new_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.finance_seed_categories(new.id);
  perform private.finance_seed_accounts(new.id);
  return new;
end $$;

select private.finance_seed_accounts(id) from public.orgs;

-- ---- money ------------------------------------------------------------------
create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  account_id uuid not null,
  txn_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('bank_transfer','fpx','duitnow','card','ewallet','cash','cheque')),
  reference text,
  -- RC- for money in, PV- for money out; given when the movement is posted.
  number text,
  contact_id uuid,
  party_name text,
  category_id uuid,
  status text not null default 'draft'
    check (status in ('draft','pending_approval','scheduled','posted','rejected','void')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  transfer_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  check (status <> 'posted' or number is not null),
  foreign key (org_id, account_id) references public.finance_accounts(org_id, id),
  foreign key (org_id, contact_id) references public.finance_contacts(org_id, id),
  foreign key (org_id, category_id) references public.finance_categories(org_id, id)
);
create unique index finance_transactions_number_key on public.finance_transactions (org_id, number) where number is not null;
create index finance_transactions_date_idx on public.finance_transactions (org_id, txn_date);
create index finance_transactions_account_idx on public.finance_transactions (org_id, account_id);

-- One row per document a movement pays. Only bills exist so far; invoices,
-- expenses and credit notes add their own column, and the check then becomes
-- "exactly one of them".
create table public.finance_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  transaction_id uuid not null,
  bill_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (bill_id is not null),
  unique (transaction_id, bill_id),
  foreign key (org_id, transaction_id) references public.finance_transactions(org_id, id) on delete cascade,
  foreign key (org_id, bill_id) references public.supplier_bills(org_id, id)
);
create index finance_allocations_bill_idx on public.finance_allocations (org_id, bill_id);

do $$
declare t text;
begin
  foreach t in array array['finance_transactions','finance_allocations'] loop
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

-- ---- bills: a draft has no number ------------------------------------------
alter table public.supplier_bills
  alter column bill_no drop not null,
  add column posted_at timestamptz,
  add constraint supplier_bills_number_check check (status = 'draft' or bill_no is not null);

update public.supplier_bills set posted_at = created_at where status <> 'draft';

-- Each workspace's bill counter starts after its highest existing BILL- number.
insert into public.finance_sequences (org_id, doc_type, prefix, next_number)
select org_id, 'bill', 'BILL-', max(substring(bill_no from '^BILL-([0-9]{1,9})$')::integer) + 1
from public.supplier_bills
where bill_no ~ '^BILL-[0-9]{1,9}$'
group by org_id
on conflict (org_id, doc_type)
  do update set next_number = greatest(public.finance_sequences.next_number, excluded.next_number);

-- ---- copy the existing payments (before any guard exists) -------------------
insert into public.finance_transactions
  (id, org_id, direction, account_id, txn_date, amount, method, reference, number, contact_id, status, created_at)
select p.id, p.org_id, 'out', a.id, p.paid_on, p.amount, p.method, p.reference, p.payment_no, b.supplier_id,
       case p.status when 'paid' then 'posted' else 'scheduled' end, p.created_at
from public.payments_out p
join public.supplier_bills b on b.org_id = p.org_id and b.id = p.bill_id
-- Matched without regard to capitals: account names are unique that way, so a
-- workspace that already had "main bank" kept its own row when seeded above.
join public.finance_accounts a
  on a.org_id = p.org_id
 and lower(a.name) = case when p.method = 'cash' then 'cash in hand' else 'main bank' end;

insert into public.finance_allocations (org_id, transaction_id, bill_id, amount)
select p.org_id, p.id, p.bill_id, p.amount from public.payments_out p;

-- ---- views ------------------------------------------------------------------
-- Recreated rather than replaced: b.* gained a column.
drop view public.supplier_bill_totals;
create view public.supplier_bill_totals with (security_invoker = true) as
select
  b.*,
  c.name as supplier_name,
  coalesce(l.total, 0)::numeric(14,2) as total,
  coalesce(p.paid, 0)::numeric(14,2) as paid,
  (coalesce(l.total, 0) - coalesce(p.paid, 0))::numeric(14,2) as balance,
  case
    when b.status in ('draft','void') then b.status
    -- A posted bill with no lines yet has nothing to pay; it is not Paid.
    when coalesce(l.total, 0) > 0 and coalesce(l.total, 0) - coalesce(p.paid, 0) <= 0 then 'paid'
    when b.due_date < current_date then 'overdue'
    else 'pending'
  end as display_status
from public.supplier_bills b
join public.finance_contacts c on c.org_id = b.org_id and c.id = b.supplier_id
left join lateral (
  select sum(amount + sst_amount) as total
  from public.supplier_bill_lines
  where org_id = b.org_id and bill_id = b.id
) l on true
left join lateral (
  -- Only posted money out counts as paid.
  select sum(a.amount) as paid
  from public.finance_allocations a
  join public.finance_transactions t on t.org_id = a.org_id and t.id = a.transaction_id
  where a.org_id = b.org_id and a.bill_id = b.id and t.direction = 'out' and t.status = 'posted'
) p on true;
revoke all on public.supplier_bill_totals from anon, authenticated;
grant select on public.supplier_bill_totals to authenticated;

-- One row per bill a payment out pays.
create view public.finance_payments_out with (security_invoker = true) as
select
  a.id as allocation_id,
  t.id as transaction_id,
  t.org_id,
  t.number,
  t.txn_date,
  t.method,
  a.amount,
  t.amount as transaction_amount,
  t.status,
  t.reference,
  t.account_id,
  acc.name as account_name,
  b.id as bill_id,
  b.bill_no,
  c.name as supplier_name,
  t.created_at
from public.finance_allocations a
join public.finance_transactions t on t.org_id = a.org_id and t.id = a.transaction_id
join public.supplier_bills b on b.org_id = a.org_id and b.id = a.bill_id
join public.finance_contacts c on c.org_id = b.org_id and c.id = b.supplier_id
join public.finance_accounts acc on acc.org_id = t.org_id and acc.id = t.account_id
where t.direction = 'out';
revoke all on public.finance_payments_out from anon, authenticated;
grant select on public.finance_payments_out to authenticated;

-- ---- guards -----------------------------------------------------------------
-- Each guard steps aside when its workspace is being deleted: by the time a
-- cascade reaches these rows the orgs row is already gone.

create or replace function private.finance_bill_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and exists (select 1 from public.orgs where id = old.org_id) then
      raise exception 'a posted bill cannot be deleted' using errcode = 'FIN01';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    if new.status not in ('draft','posted') then
      raise exception 'a draft bill is deleted, not voided' using errcode = 'FIN01';
    end if;
    return new;
  end if;

  if old.status = 'posted' and new.status = 'void' then
    if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'a posted bill cannot be changed' using errcode = 'FIN01';
    end if;
    if exists (
      select 1
      from public.finance_allocations a
      join public.finance_transactions t on t.org_id = a.org_id and t.id = a.transaction_id
      where a.org_id = old.org_id and a.bill_id = old.id
        and t.status in ('draft','pending_approval','scheduled','posted')
    ) then
      raise exception 'the bill has payments' using errcode = 'FIN02';
    end if;
    return new;
  end if;

  raise exception 'a posted bill cannot be changed' using errcode = 'FIN01';
end $$;

create trigger finance_bill_guard
  before update or delete on public.supplier_bills
  for each row execute function private.finance_bill_guard();

create or replace function private.finance_bill_line_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s text;
begin
  -- The workspace is being deleted: its bills and their lines all go.
  if tg_op = 'DELETE' and not exists (select 1 from public.orgs where id = old.org_id) then
    return old;
  end if;
  if tg_op <> 'INSERT' then
    select status into s from public.supplier_bills where org_id = old.org_id and id = old.bill_id;
    -- No parent row: the bill itself is being deleted, and its lines go with it.
    if s is not null and s <> 'draft' then
      raise exception 'the lines of a posted bill cannot be changed' using errcode = 'FIN01';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select status into s from public.supplier_bills where org_id = new.org_id and id = new.bill_id;
    if s is not null and s <> 'draft' then
      raise exception 'the lines of a posted bill cannot be changed' using errcode = 'FIN01';
    end if;
    return new;
  end if;
  return old;
end $$;

create trigger finance_bill_line_guard
  before insert or update or delete on public.supplier_bill_lines
  for each row execute function private.finance_bill_line_guard();

create or replace function private.finance_transaction_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('posted','void') and exists (select 1 from public.orgs where id = old.org_id) then
      raise exception 'a posted payment cannot be deleted' using errcode = 'FIN09';
    end if;
    return old;
  end if;

  if old.status = 'posted' and new.status = 'void'
     and (to_jsonb(new) - 'status' - 'updated_at') is not distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    return new;
  end if;
  if old.status in ('posted','void') then
    raise exception 'a posted payment cannot be changed' using errcode = 'FIN09';
  end if;
  return new;
end $$;

create trigger finance_transaction_guard
  before update or delete on public.finance_transactions
  for each row execute function private.finance_transaction_guard();

create or replace function private.finance_allocation_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t record;
  bill_status text;
  bill_total numeric;
  taken numeric;
begin
  -- The workspace is being deleted: its payments and their splits all go.
  if tg_op = 'DELETE' and not exists (select 1 from public.orgs where id = old.org_id) then
    return old;
  end if;
  if tg_op <> 'INSERT' then
    select status into t from public.finance_transactions where org_id = old.org_id and id = old.transaction_id;
    -- No parent row: the payment itself is being deleted.
    if found and t.status in ('posted','void') then
      raise exception 'the split of a posted payment cannot be changed' using errcode = 'FIN09';
    end if;
    if tg_op = 'DELETE' then return old; end if;
  end if;

  select amount, status into t from public.finance_transactions where org_id = new.org_id and id = new.transaction_id;
  if found and t.status in ('posted','void') then
    raise exception 'the split of a posted payment cannot be changed' using errcode = 'FIN09';
  end if;

  select coalesce(sum(amount), 0) into taken
  from public.finance_allocations
  where org_id = new.org_id and transaction_id = new.transaction_id and id <> new.id;
  if taken + new.amount > t.amount then
    raise exception 'the split is more than the payment' using errcode = 'FIN03';
  end if;

  -- Lock the bill, so two payments at the same moment are checked one after the other.
  select status into bill_status from public.supplier_bills
  where org_id = new.org_id and id = new.bill_id for update;
  if bill_status is distinct from 'posted' then
    raise exception 'a payment can only go against a posted bill' using errcode = 'FIN04';
  end if;

  select coalesce(sum(amount + sst_amount), 0) into bill_total
  from public.supplier_bill_lines where org_id = new.org_id and bill_id = new.bill_id;
  select coalesce(sum(a.amount), 0) into taken
  from public.finance_allocations a
  join public.finance_transactions x on x.org_id = a.org_id and x.id = a.transaction_id
  where a.org_id = new.org_id and a.bill_id = new.bill_id and a.id <> new.id
    and x.status in ('draft','pending_approval','scheduled','posted');
  if taken + new.amount > bill_total then
    raise exception 'more than is still owed on the bill' using errcode = 'FIN05';
  end if;
  return new;
end $$;

create trigger finance_allocation_guard
  before insert or update or delete on public.finance_allocations
  for each row execute function private.finance_allocation_guard();

create or replace function private.finance_contact_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_supplier and not new.is_supplier
     and exists (select 1 from public.supplier_bills where org_id = old.org_id and supplier_id = old.id) then
    raise exception 'the contact has bills' using errcode = 'FIN07';
  end if;
  return new;
end $$;

create trigger finance_contact_guard
  before update on public.finance_contacts
  for each row execute function private.finance_contact_guard();

-- ---- functions --------------------------------------------------------------
-- All run as the caller, so RLS decides who may write and to which workspace.

-- Creates a draft bill, or replaces a draft's header and lines. Returns its id.
create or replace function public.finance_save_bill(target_org uuid, bill jsonb, lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bid uuid := nullif(bill->>'id', '')::uuid;
  n integer;
begin
  if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) = 0 then
    raise exception 'a bill needs at least one line' using errcode = 'FIN10';
  end if;

  if bid is null then
    insert into public.supplier_bills (org_id, supplier_id, supplier_ref, bill_date, due_date, notes, status)
    values (
      target_org,
      (bill->>'supplier_id')::uuid,
      nullif(bill->>'supplier_ref', ''),
      (bill->>'bill_date')::date,
      (bill->>'due_date')::date,
      nullif(bill->>'notes', ''),
      'draft'
    )
    returning id into bid;
  else
    update public.supplier_bills
       set supplier_id = (bill->>'supplier_id')::uuid,
           supplier_ref = nullif(bill->>'supplier_ref', ''),
           bill_date = (bill->>'bill_date')::date,
           due_date = (bill->>'due_date')::date,
           notes = nullif(bill->>'notes', ''),
           updated_at = now()
     where org_id = target_org and id = bid;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'the bill no longer exists' using errcode = 'FIN11';
    end if;
    delete from public.supplier_bill_lines where org_id = target_org and bill_id = bid;
  end if;

  insert into public.supplier_bill_lines
    (org_id, bill_id, product_id, description, quantity, uom, pack_size, unit_price, sst_rate)
  select
    target_org, bid,
    nullif(l->>'product_id', '')::uuid,
    l->>'description',
    (l->>'quantity')::numeric,
    nullif(l->>'uom', ''),
    nullif(l->>'pack_size', ''),
    (l->>'unit_price')::numeric,
    coalesce((l->>'sst_rate')::numeric, 0)
  from jsonb_array_elements(lines) as l;

  return bid;
end $$;

-- Posts a draft bill and returns its number. The number is taken here, so a
-- failed post does not use one up.
create or replace function public.finance_post_bill(target_org uuid, target_bill uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b record;
  total numeric;
  no text;
begin
  select status, bill_no into b from public.supplier_bills
  where org_id = target_org and id = target_bill for update;
  if not found then
    raise exception 'the bill no longer exists' using errcode = 'FIN11';
  end if;
  if b.status <> 'draft' then
    raise exception 'the bill is already posted' using errcode = 'FIN01';
  end if;
  select coalesce(sum(amount + sst_amount), 0) into total
  from public.supplier_bill_lines where org_id = target_org and bill_id = target_bill;
  if total <= 0 then
    raise exception 'a bill needs an amount before it is posted' using errcode = 'FIN10';
  end if;

  no := coalesce(b.bill_no, public.finance_next_number(target_org, 'bill'));
  update public.supplier_bills
     set status = 'posted', bill_no = no, posted_at = now(), updated_at = now()
   where org_id = target_org and id = target_bill;
  return no;
end $$;

-- Records one payment out, split across one supplier's bills. status is
-- 'posted' (paid now, numbered) or 'scheduled' (not yet money out). Returns its id.
create or replace function public.finance_record_payment_out(target_org uuid, payment jsonb, allocations jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tid uuid;
  total numeric;
  suppliers uuid[];
  want text := coalesce(payment->>'status', 'posted');
  no text;
begin
  if want not in ('posted','scheduled') then
    raise exception 'unknown payment status %', want using errcode = '22023';
  end if;
  if jsonb_typeof(allocations) is distinct from 'array' or jsonb_array_length(allocations) = 0 then
    raise exception 'no bill was chosen' using errcode = 'FIN06';
  end if;

  select coalesce(sum((a->>'amount')::numeric), 0) into total from jsonb_array_elements(allocations) as a;
  select array_agg(distinct b.supplier_id) into suppliers
  from jsonb_array_elements(allocations) as a
  join public.supplier_bills b on b.org_id = target_org and b.id = (a->>'bill_id')::uuid;
  if suppliers is null or array_length(suppliers, 1) <> 1 then
    raise exception 'one payment pays one supplier' using errcode = 'FIN06';
  end if;

  insert into public.finance_transactions
    (org_id, direction, account_id, txn_date, amount, method, reference, contact_id, notes, status)
  values (
    target_org, 'out',
    (payment->>'account_id')::uuid,
    coalesce((payment->>'txn_date')::date, current_date),
    total,
    payment->>'method',
    nullif(payment->>'reference', ''),
    suppliers[1],
    nullif(payment->>'notes', ''),
    'draft'
  )
  returning id into tid;

  insert into public.finance_allocations (org_id, transaction_id, bill_id, amount)
  select target_org, tid, (a->>'bill_id')::uuid, (a->>'amount')::numeric
  from jsonb_array_elements(allocations) as a;

  if want = 'posted' then
    no := public.finance_next_number(target_org, 'voucher');
  end if;
  update public.finance_transactions
     set status = want, number = no, updated_at = now()
   where org_id = target_org and id = tid;
  return tid;
end $$;

-- Turns a scheduled payment into a paid one and returns its number.
create or replace function public.finance_mark_payment_paid(target_org uuid, target_txn uuid, paid_on date)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t record;
  no text;
begin
  select status, number into t from public.finance_transactions
  where org_id = target_org and id = target_txn for update;
  if not found then
    raise exception 'the payment no longer exists' using errcode = 'FIN11';
  end if;
  if t.status <> 'scheduled' then
    raise exception 'only a scheduled payment can be marked paid' using errcode = 'FIN09';
  end if;
  no := coalesce(t.number, public.finance_next_number(target_org, 'voucher'));
  update public.finance_transactions
     set status = 'posted', number = no, txn_date = coalesce(paid_on, current_date), updated_at = now()
   where org_id = target_org and id = target_txn;
  return no;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.finance_save_bill(uuid, jsonb, jsonb)',
    'public.finance_post_bill(uuid, uuid)',
    'public.finance_record_payment_out(uuid, jsonb, jsonb)',
    'public.finance_mark_payment_paid(uuid, uuid, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
