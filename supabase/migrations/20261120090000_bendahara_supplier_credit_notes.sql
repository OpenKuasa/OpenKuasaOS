-- Bendahara supplier credit notes (additive; safe to apply while the previous
-- code is still deployed).
--
-- A credit note from a supplier is written against one posted supplier bill:
-- an overpayment, returned goods, a short delivery. It is the mirror of the
-- customer credit note (20261022100000), pointed at a bill.
--
--   * finance_supplier_credit_notes: draft -> issued -> void, numbered SCN- when
--     issued. One amount, a date, a reason, the supplier's own reference, notes.
--     The supplier is the bill's supplier; it is not stored twice.
--   * finance_supplier_credit_applications: which bill took how much of a note,
--     the same idea as finance_allocations on the payment side. When a note is
--     issued it is applied to its own bill, up to what that bill still owes.
--     What is left stays open on the supplier, and a person applies it to a
--     later bill from the same supplier. Applying makes no ledger entry: the
--     note already reduced Accounts Payable when it was issued.
--   * supplier_bill_totals counts applied credit in balance and display_status,
--     in a new column "credited" (paid stays money out). The guard on payments
--     counts it as already settled, so a payment voucher cannot pay past it.
--   * finance_purchase_order_totals: billed_total takes issued credit notes
--     off, so an order the supplier has corrected stops reading as over-billed.
--   * finance_ledger_lines: an issued note debits Accounts Payable and credits
--     the bill's category; a void posts a reversal on the day it was voided.
--
-- Rules (the guards sit on the tables, not only in the functions):
--   * a note goes against a posted bill, and all the issued notes of a bill
--     together never exceed the bill's total (FIN04, FIN05);
--   * the applications of a note never exceed the note, go only to a posted
--     bill of the same supplier (FIN04, FIN42), and the payments and credit on
--     a bill never exceed its total (FIN05);
--   * a note is voided only while its credit is used on nothing but its own
--     bill; voiding takes that off again (FIN41). To void one whose credit was
--     used on a later bill, take it off that bill first;
--   * a bill cannot be voided while a draft or issued note is against it, or
--     while credit is applied to it (FIN43);
--   * issuing and voiding a note, applying credit and taking it off need an
--     owner or admin, as posting and voiding a bill do (FIN14).
--
-- Error codes: FIN41, FIN42, FIN43 are new (the highest before this file is FIN40).

-- Fail fast instead of queueing behind a long transaction and stalling sign-ins.
set local lock_timeout = '5s';

-- ---- numbering: a supplier credit note takes an SCN- number -------------------------
alter table public.finance_sequences
  drop constraint finance_sequences_doc_type_check,
  add constraint finance_sequences_doc_type_check
    check (doc_type in ('invoice','quotation','credit_note','bill','receipt','voucher','transfer','rfq','purchase_order','journal','contra','supplier_credit_note'));

-- The body of 20261119100000_bendahara_contra_entries.sql (the newest on main) with
-- one line added: 'supplier_credit_note' gives 'SCN-'. It stays "security definer".
create or replace function public.finance_next_number(target_org uuid, doc text)
returns text
language plpgsql
security definer
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
    when 'transfer' then 'TR-'
    when 'rfq' then 'RFQ-'
    when 'purchase_order' then 'PO-'
    when 'journal' then 'JV-'
    when 'contra' then 'CT-'
    when 'supplier_credit_note' then 'SCN-'
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

revoke all on function public.finance_next_number(uuid, text) from public, anon, service_role;
grant execute on function public.finance_next_number(uuid, text) to authenticated;

-- ---- tables -------------------------------------------------------------------------
create table public.finance_supplier_credit_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  bill_id uuid not null,
  -- SCN-0001; given when the credit note is issued.
  credit_note_no text,
  credit_date date not null default current_date,
  reason text not null default 'other'
    check (reason in ('overpaid','returned_goods','short_delivery','other')),
  amount numeric(14,2) not null check (amount > 0),
  -- The supplier's own number for the credit note.
  supplier_ref text,
  notes text,
  status text not null default 'draft' check (status in ('draft','issued','void')),
  issued_at timestamptz,
  -- Written by the trigger finance_void_stamp and by nobody else.
  voided_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, credit_note_no),
  -- A draft has no number; an issued or void credit note has one, and an
  -- issued one says when it was issued.
  constraint finance_supplier_credit_notes_number_check
    check ((status = 'draft') = (credit_note_no is null) and (status <> 'issued' or issued_at is not null)),
  foreign key (org_id, bill_id) references public.supplier_bills(org_id, id)
);
create index finance_supplier_credit_notes_bill_idx on public.finance_supplier_credit_notes (org_id, bill_id);
create index finance_supplier_credit_notes_date_idx on public.finance_supplier_credit_notes (org_id, credit_date);

-- One row per bill a credit note is applied to. Never edited: taken off (deleted) and put on again.
create table public.finance_supplier_credit_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  credit_note_id uuid not null,
  bill_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (credit_note_id, bill_id),
  foreign key (org_id, credit_note_id) references public.finance_supplier_credit_notes(org_id, id),
  foreign key (org_id, bill_id) references public.supplier_bills(org_id, id)
);
create index finance_supplier_credit_applications_bill_idx on public.finance_supplier_credit_applications (org_id, bill_id);
create index finance_supplier_credit_applications_note_idx on public.finance_supplier_credit_applications (org_id, credit_note_id);

-- Notes: the four policies and mfa_required, as the other finance documents have them.
alter table public.finance_supplier_credit_notes enable row level security;
create policy finance_supplier_credit_notes_select on public.finance_supplier_credit_notes
  for select to authenticated using (private.is_org_member(org_id));
create policy finance_supplier_credit_notes_insert on public.finance_supplier_credit_notes
  for insert to authenticated with check (private.is_org_writer(org_id));
create policy finance_supplier_credit_notes_update on public.finance_supplier_credit_notes
  for update to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy finance_supplier_credit_notes_delete on public.finance_supplier_credit_notes
  for delete to authenticated using (private.is_org_writer(org_id));
create policy mfa_required on public.finance_supplier_credit_notes as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.finance_supplier_credit_notes from anon, authenticated, service_role;
grant select, insert, update, delete on public.finance_supplier_credit_notes to authenticated;

-- Applications: anyone in the workspace reads; putting credit on a bill and
-- taking it off settle a bill like a payment does, so they need the sign-off.
-- There is no update: a row is taken off and put on again.
alter table public.finance_supplier_credit_applications enable row level security;
create policy finance_supplier_credit_applications_select on public.finance_supplier_credit_applications
  for select to authenticated using (private.is_org_member(org_id));
create policy finance_supplier_credit_applications_insert on public.finance_supplier_credit_applications
  for insert to authenticated with check (private.finance_may_sign_off(org_id));
create policy finance_supplier_credit_applications_delete on public.finance_supplier_credit_applications
  for delete to authenticated using (private.finance_may_sign_off(org_id));
create policy mfa_required on public.finance_supplier_credit_applications as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.finance_supplier_credit_applications from anon, authenticated, service_role;
grant select, insert, delete on public.finance_supplier_credit_applications to authenticated;

-- ---- guard: the credit note ---------------------------------------------------------
-- Lock order, here and in the application guard: the note, then the bill.
-- The guard on allocations takes only the bill.
create or replace function private.finance_supplier_credit_note_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  doc_status text;
  total numeric;
  others numeric;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and exists (select 1 from public.orgs where id = old.org_id) then
      raise exception 'an issued supplier credit note cannot be deleted' using errcode = 'FIN01';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'a supplier credit note starts as a draft' using errcode = 'FIN01';
    end if;
  else
    -- A deleted user is cleared from created_by by its foreign key, whatever
    -- the credit note's status. Nothing else may change with it.
    if new.status = old.status
       and (to_jsonb(new) - 'created_by') = (to_jsonb(old) - 'created_by')
       and (new.created_by is null or new.created_by = old.created_by) then
      return new;
    end if;

    if old.status = 'issued' and new.status = 'void' then
      if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
        raise exception 'an issued supplier credit note cannot be changed' using errcode = 'FIN01';
      end if;
      -- The note is locked (it is being updated), and now its bill, in the order the guard on applications
      -- takes them: credit being applied at the same moment waits for this, then finds the note void (FIN04).
      perform 1 from public.supplier_bills where org_id = old.org_id and id = old.bill_id for update;
      if exists (
        select 1 from public.finance_supplier_credit_applications a
        where a.org_id = old.org_id and a.credit_note_id = old.id and a.bill_id <> old.bill_id
      ) then
        raise exception 'the credit has been used on another bill; take it off that bill first' using errcode = 'FIN41';
      end if;
      -- What it took off its own bill is owed again.
      delete from public.finance_supplier_credit_applications
      where org_id = old.org_id and credit_note_id = old.id;
      return new;
    end if;

    if old.status <> 'draft' then
      raise exception 'an issued supplier credit note cannot be changed' using errcode = 'FIN01';
    end if;
    if new.status = 'void' then
      raise exception 'a draft supplier credit note is deleted, not voided' using errcode = 'FIN01';
    end if;
  end if;

  -- A draft being written, or a draft being issued. Lock the bill, so two
  -- credit notes at the same moment are checked one after the other.
  select status into doc_status from public.supplier_bills
  where org_id = new.org_id and id = new.bill_id for update;
  if not found then
    -- Not there, or not this caller's to change: the foreign key or row-level
    -- security refuses the write and says which.
    return new;
  end if;
  if doc_status <> 'posted' then
    raise exception 'a supplier credit note can only go against a posted bill' using errcode = 'FIN04';
  end if;
  select coalesce(sum(amount + sst_amount), 0) into total
  from public.supplier_bill_lines where org_id = new.org_id and bill_id = new.bill_id;
  select coalesce(sum(n.amount), 0) into others
  from public.finance_supplier_credit_notes n
  where n.org_id = new.org_id and n.bill_id = new.bill_id and n.status = 'issued' and n.id <> new.id;
  if new.amount > total - others then
    raise exception 'more than the bill has left to credit' using errcode = 'FIN05';
  end if;
  return new;
end $$;
revoke all on function private.finance_supplier_credit_note_guard() from public, anon, authenticated, service_role;

create trigger finance_supplier_credit_note_guard
  before insert or update or delete on public.finance_supplier_credit_notes
  for each row execute function private.finance_supplier_credit_note_guard();

-- Issuing and voiding need an owner or admin. Sorts after the guard, which answers first.
create trigger finance_supplier_credit_note_sign_off
  before update on public.finance_supplier_credit_notes
  for each row execute function private.finance_sign_off_guard();

-- The last BEFORE trigger of the table, as on the other four documents
-- (20261111090000): every guard has compared the row before this writes voided_at.
create trigger finance_void_stamp
  before insert or update on public.finance_supplier_credit_notes
  for each row execute function private.finance_void_stamp();

-- ---- guard: credit applied to a bill ------------------------------------------------
create or replace function private.finance_supplier_credit_application_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  note record;
  target record;
  home uuid;
  used numeric;
  total numeric;
  held numeric;
  credited numeric;
  set_off numeric;
begin
  -- Lock the note, so it cannot be voided while this is checked.
  select status, amount, bill_id into note from public.finance_supplier_credit_notes
  where org_id = new.org_id and id = new.credit_note_id for update;
  if not found then
    -- Not there, or not this caller's to read: the foreign key says which.
    return new;
  end if;
  if note.status <> 'issued' then
    raise exception 'credit can only be applied from an issued supplier credit note' using errcode = 'FIN04';
  end if;

  -- Lock the bill, so two payments or credits at the same moment are checked one after the other.
  select status, supplier_id into target from public.supplier_bills
  where org_id = new.org_id and id = new.bill_id for update;
  if not found then
    return new;
  end if;
  if target.status <> 'posted' then
    raise exception 'credit can only be applied to a posted bill' using errcode = 'FIN04';
  end if;
  select supplier_id into home from public.supplier_bills where org_id = new.org_id and id = note.bill_id;
  if target.supplier_id is distinct from home then
    raise exception 'credit can only be applied to a bill from the same supplier' using errcode = 'FIN42';
  end if;

  select coalesce(sum(amount), 0) into used
  from public.finance_supplier_credit_applications
  where org_id = new.org_id and credit_note_id = new.credit_note_id;
  if used + new.amount > note.amount then
    raise exception 'more than is left of the credit note' using errcode = 'FIN05';
  end if;

  -- Payments not yet posted hold their part of the bill, as the guard on allocations counts them.
  select coalesce(sum(amount + sst_amount), 0) into total
  from public.supplier_bill_lines where org_id = new.org_id and bill_id = new.bill_id;
  select coalesce(sum(a.amount), 0) into held
  from public.finance_allocations a
  join public.finance_transactions x on x.org_id = a.org_id and x.id = a.transaction_id
  where a.org_id = new.org_id and a.bill_id = new.bill_id
    and x.status in ('draft','pending_approval','scheduled','posted');
  select coalesce(sum(amount), 0) into credited
  from public.finance_supplier_credit_applications
  where org_id = new.org_id and bill_id = new.bill_id;
  -- Posted contra entries (20261119100000) set off part of the bill as well.
  select coalesce(sum(cl.amount), 0) into set_off
  from public.finance_contra_lines cl
  join public.finance_contras k on k.org_id = cl.org_id and k.id = cl.contra_id
  where cl.org_id = new.org_id and cl.bill_id = new.bill_id and k.status = 'posted';
  if held + credited + set_off + new.amount > total then
    raise exception 'more than is still owed on the bill' using errcode = 'FIN05';
  end if;
  return new;
end $$;
revoke all on function private.finance_supplier_credit_application_guard() from public, anon, authenticated, service_role;

create trigger finance_supplier_credit_application_guard
  before insert on public.finance_supplier_credit_applications
  for each row execute function private.finance_supplier_credit_application_guard();

-- ---- guard: a payment counts the credit on its bill ---------------------------------
-- An addition to private.finance_allocation_guard (20261028100000), which is
-- not replaced: that guard has already checked the payment's state, locked
-- the bill and held payments to the bill's total. This one, firing right
-- after it (its name sorts after finance_allocation_guard and before
-- finance_allocation_still), holds payments and applied credit together to
-- the total (FIN05), together with any posted contra entry on the bill (whose
-- own cap, finance_allocation_less_contra, does not know credit). A bill with
-- no credit on it is not read again.
create or replace function private.finance_allocation_guard_credit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  credited numeric;
  total numeric;
  held numeric;
  set_off numeric;
begin
  if new.bill_id is null then
    return new;
  end if;
  select coalesce(sum(amount), 0) into credited
  from public.finance_supplier_credit_applications
  where org_id = new.org_id and bill_id = new.bill_id;
  if credited = 0 then
    return new;
  end if;
  select coalesce(sum(amount + sst_amount), 0) into total
  from public.supplier_bill_lines where org_id = new.org_id and bill_id = new.bill_id;
  select coalesce(sum(a.amount), 0) into held
  from public.finance_allocations a
  join public.finance_transactions x on x.org_id = a.org_id and x.id = a.transaction_id
  where a.org_id = new.org_id and a.bill_id = new.bill_id and a.id <> new.id
    and x.status in ('draft','pending_approval','scheduled','posted');
  select coalesce(sum(cl.amount), 0) into set_off
  from public.finance_contra_lines cl
  join public.finance_contras k on k.org_id = cl.org_id and k.id = cl.contra_id
  where cl.org_id = new.org_id and cl.bill_id = new.bill_id and k.status = 'posted';
  if held + credited + set_off + new.amount > total then
    raise exception 'more than is still owed on the bill' using errcode = 'FIN05';
  end if;
  return new;
end $$;
revoke all on function private.finance_allocation_guard_credit() from public, anon, authenticated, service_role;

create trigger finance_allocation_guard_credit
  before insert or update on public.finance_allocations
  for each row execute function private.finance_allocation_guard_credit();

-- ---- guard: a contra entry counts the credit on its bills ---------------------------
-- An addition to private.finance_contra_guard (20261119100000), which is not
-- replaced: when a contra entry is posted it holds payments and other contra
-- entries to each bill's total, and does not know credit. This one, firing
-- after it (its name sorts after finance_contra_guard), adds the credit applied
-- to the bill. The bills are already locked "for update" by that guard.
create or replace function private.finance_contra_guard_credit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  l record;
begin
  for l in
    select cl.bill_id, b.bill_no,
           (select coalesce(sum(bl.amount + bl.sst_amount), 0) from public.supplier_bill_lines bl
             where bl.org_id = cl.org_id and bl.bill_id = cl.bill_id)
         - (select coalesce(sum(a.amount), 0) from public.finance_allocations a
             join public.finance_transactions x on x.org_id = a.org_id and x.id = a.transaction_id
             where a.org_id = cl.org_id and a.bill_id = cl.bill_id
               and x.status in ('draft','pending_approval','scheduled','posted'))
         - (select coalesce(sum(o.amount), 0) from public.finance_contra_lines o
             join public.finance_contras k on k.org_id = o.org_id and k.id = o.contra_id
             where o.org_id = cl.org_id and o.bill_id = cl.bill_id and k.status = 'posted')
         - (select coalesce(sum(ca.amount), 0) from public.finance_supplier_credit_applications ca
             where ca.org_id = cl.org_id and ca.bill_id = cl.bill_id) as room,
           cl.amount
    from public.finance_contra_lines cl
    join public.supplier_bills b on b.org_id = cl.org_id and b.id = cl.bill_id
    where cl.org_id = new.org_id and cl.contra_id = new.id and cl.bill_id is not null
  loop
    -- This entry is still a draft in the table, so its own lines are not in "room".
    if l.amount > l.room then
      raise exception 'more than is still owed on bill %', l.bill_no using errcode = 'FIN05';
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.finance_contra_guard_credit() from public, anon, authenticated, service_role;

create trigger finance_contra_guard_credit
  before update on public.finance_contras
  for each row
  when (old.status = 'draft' and new.status = 'posted')
  execute function private.finance_contra_guard_credit();

-- ---- guard: a bill with credit stays in the books -----------------------------------
-- A bill is voided only when no draft or issued note is against it and no
-- credit is applied to it: otherwise its entry would be reversed and the
-- note's would not. Sorts after finance_bill_guard and finance_bill_sign_off
-- (so a person who may not void is answered FIN14 first) and before
-- finance_void_stamp. finance_bill_guard keeps its own rules.
create or replace function private.finance_bill_void_credit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.finance_supplier_credit_notes n
    where n.org_id = old.org_id and n.bill_id = old.id and n.status in ('draft','issued')
  ) or exists (
    select 1 from public.finance_supplier_credit_applications a
    where a.org_id = old.org_id and a.bill_id = old.id
  ) then
    raise exception 'a bill with a supplier credit note or credit on it cannot be voided' using errcode = 'FIN43';
  end if;
  return new;
end $$;
revoke all on function private.finance_bill_void_credit() from public, anon, authenticated, service_role;

create trigger finance_bill_void_credit
  before update on public.supplier_bills
  for each row
  when (new.status = 'void' and old.status is distinct from 'void')
  execute function private.finance_bill_void_credit();

-- ---- views --------------------------------------------------------------------------
-- supplier_bill_totals: the text 20261119100000 (contra entries) gave it, with
-- "credited" appended after its "set_off", so "create or replace" keeps the
-- view, its grants and what reads it. balance and display_status take applied
-- credit off as well as set-off; paid is still only posted money out.
create or replace view public.supplier_bill_totals with (security_invoker = true) as
select
  b.id, b.org_id, b.bill_no, b.supplier_ref, b.supplier_id, b.bill_date, b.due_date,
  b.status, b.notes, b.created_at, b.updated_at, b.posted_at,
  c.name as supplier_name,
  coalesce(l.total, 0)::numeric(14,2) as total,
  coalesce(p.paid, 0)::numeric(14,2) as paid,
  (coalesce(l.total, 0) - coalesce(p.paid, 0) - coalesce(sc.set_off, 0) - coalesce(k.credited, 0))::numeric(14,2) as balance,
  case
    when b.status in ('draft','void') then b.status
    -- A posted bill with no lines yet has nothing to pay; it is not Paid.
    when coalesce(l.total, 0) > 0 and coalesce(l.total, 0) - coalesce(p.paid, 0) - coalesce(sc.set_off, 0) - coalesce(k.credited, 0) <= 0 then 'paid'
    when b.due_date < current_date then 'overdue'
    else 'pending'
  end as display_status,
  coalesce(sc.set_off, 0)::numeric(14,2) as set_off,
  coalesce(k.credited, 0)::numeric(14,2) as credited
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
) p on true
left join lateral (
  -- Posted contra entries against the bill: settled with no money moving.
  select sum(cl.amount) as set_off
  from public.finance_contra_lines cl
  join public.finance_contras ce on ce.org_id = cl.org_id and ce.id = cl.contra_id
  where cl.org_id = b.org_id and cl.bill_id = b.id and ce.status = 'posted'
) sc on true
left join lateral (
  -- Credit from issued notes put on this bill. A note that is voided has none left on a bill.
  select sum(a.amount) as credited
  from public.finance_supplier_credit_applications a
  where a.org_id = b.org_id and a.bill_id = b.id
) k on true;
revoke all on public.supplier_bill_totals from anon, authenticated, service_role;
grant select on public.supplier_bill_totals to authenticated;

-- One row per note, with what it has been applied to and what is still open.
create view public.finance_supplier_credit_note_totals with (security_invoker = true) as
select
  n.*,
  sb.bill_no,
  sb.supplier_id,
  c.name as supplier_name,
  coalesce(a.applied, 0)::numeric(14,2) as applied,
  (case when n.status = 'issued' then n.amount - coalesce(a.applied, 0) else 0 end)::numeric(14,2) as open_amount
from public.finance_supplier_credit_notes n
join public.supplier_bills sb on sb.org_id = n.org_id and sb.id = n.bill_id
join public.finance_contacts c on c.org_id = sb.org_id and c.id = sb.supplier_id
left join lateral (
  select sum(x.amount) as applied
  from public.finance_supplier_credit_applications x
  where x.org_id = n.org_id and x.credit_note_id = n.id
) a on true;
revoke all on public.finance_supplier_credit_note_totals from anon, authenticated, service_role;
grant select on public.finance_supplier_credit_note_totals to authenticated;

-- finance_purchase_order_totals: the text 20261106090000 gave it, with the
-- issued credit notes on the order's bills taken off billed_total. A view's
-- "p.*" is fixed when the view is made, so it is made again.
drop view public.finance_purchase_order_totals;

create view public.finance_purchase_order_totals with (security_invoker = true) as
select
  p.*,
  c.name as supplier_name,
  r.rfq_no,
  coalesce(l.subtotal, 0)::numeric(14,2) as subtotal,
  coalesce(l.sst, 0)::numeric(14,2) as sst_total,
  (coalesce(l.subtotal, 0) + coalesce(l.sst, 0))::numeric(14,2) as total,
  case
    when coalesce(l.started, 0) = 0 then 'pending'
    when coalesce(l.outstanding, 0) = 0 then 'delivered'
    else 'partial'
  end as delivery,
  -- What has arrived, at the order's prices and SST rates.
  coalesce(l.received, 0)::numeric(14,2) as received_total,
  (coalesce(b.billed, 0) - coalesce(cn.credited, 0))::numeric(14,2) as billed_total,
  (coalesce(b.billed, 0) - coalesce(cn.credited, 0) > coalesce(l.subtotal, 0) + coalesce(l.sst, 0)) as over_billed,
  -- Billed for more than has arrived: the usual thing to catch before paying.
  (coalesce(b.billed, 0) - coalesce(cn.credited, 0) > coalesce(l.received, 0)) as billed_over_received
from public.finance_purchase_orders p
join public.finance_contacts c on c.org_id = p.org_id and c.id = p.supplier_id
left join public.finance_rfqs r on r.org_id = p.org_id and r.id = p.rfq_id
left join lateral (
  select
    sum(amount) as subtotal,
    sum(sst_amount) as sst,
    count(*) filter (where received_quantity > 0) as started,
    count(*) filter (where received_quantity < quantity) as outstanding,
    sum(round(received_quantity * unit_price, 2) + round(received_quantity * unit_price * sst_rate / 100, 2)) as received
  from public.finance_purchase_order_lines
  where org_id = p.org_id and purchase_order_id = p.id
) l on true
left join lateral (
  -- Every bill raised against the order that has not been voided, drafts included.
  select sum(bl.amount + bl.sst_amount) as billed
  from public.supplier_bills sb
  join public.supplier_bill_lines bl on bl.org_id = sb.org_id and bl.bill_id = sb.id
  where sb.org_id = p.org_id and sb.purchase_order_id = p.id and sb.status <> 'void'
) b on true
left join lateral (
  -- What the supplier has credited on those bills: issued notes only.
  select sum(n.amount) as credited
  from public.supplier_bills sb
  join public.finance_supplier_credit_notes n on n.org_id = sb.org_id and n.bill_id = sb.id
  where sb.org_id = p.org_id and sb.purchase_order_id = p.id and sb.status <> 'void' and n.status = 'issued'
) cn on true;

revoke all on public.finance_purchase_order_totals from anon, authenticated, service_role;
grant select on public.finance_purchase_order_totals to authenticated;

-- ---- the ledger ---------------------------------------------------------------------
-- finance_ledger_lines, replaced: the text 20261119100000 (contra entries) gave it,
-- with one more kind of entry, the supplier credit note. The same ten columns with the
-- same types, so "create or replace" keeps the view and everything that reads
-- it (finance_ledger_balances). An issued note debits Accounts Payable and
-- credits the bill's category (SST on a purchase is part of the cost, so the
-- whole amount goes there, as the bill's whole total did). Two lines, the same
-- amount, so it balances. A voided one is reversed on the day it was voided.
create or replace view public.finance_ledger_lines with (security_invoker = true) as
select
  l.org_id,
  l.entry_key || case when r.reversal then ':void' else '' end as entry_key,
  case when r.reversal then l.voided_on else l.entry_date end as entry_date,
  l.source,
  l.source_id,
  l.source_no,
  case when r.reversal then 'Voided: ' || l.description else l.description end as description,
  coalesce(l.acct, s.id, b.id, c.id, d.id) as account_id,
  (case when r.reversal then l.credit else l.debit end)::numeric(14,2) as debit,
  (case when r.reversal then l.debit else l.credit end)::numeric(14,2) as credit
from (
  -- ---- invoice: posted, or voided after it was posted -------------------------------
  -- Mirrors finance_invoice_totals: subtotal is sum(amount), sst is
  -- sum(sst_amount), total is the two added. Every invoice credits the one
  -- account marked default_for = 'sales'.
  select
    i.org_id,
    'invoice:' || i.id::text as entry_key,
    i.invoice_date as entry_date,
    'invoice'::text as source,
    i.id as source_id,
    i.invoice_no as source_no,
    concat_ws(' ', 'Invoice', i.invoice_no, 'to ' || ct.name) as description,
    case when i.status = 'void' then (i.voided_at at time zone 'UTC')::date end as voided_on,
    v.acct, v.sys, v.bank, v.cat, v.dflt, v.debit, v.credit
  from public.finance_invoices i
  left join public.finance_contacts ct on ct.org_id = i.org_id and ct.id = i.customer_id
  cross join lateral (
    select coalesce(sum(il.amount), 0) as subtotal, coalesce(sum(il.sst_amount), 0) as sst
    from public.finance_invoice_lines il
    where il.org_id = i.org_id and il.invoice_id = i.id
  ) t
  cross join lateral (values
    (null::uuid, 'receivable'::text, null::uuid, null::uuid, null::text, (t.subtotal + t.sst)::numeric, 0::numeric),
    (null::uuid, null::text, null::uuid, null::uuid, 'sales'::text, 0::numeric, t.subtotal::numeric),
    (null::uuid, 'sst_payable'::text, null::uuid, null::uuid, null::text, 0::numeric, t.sst::numeric)
  ) as v(acct, sys, bank, cat, dflt, debit, credit)
  where i.status = 'posted' or (i.status = 'void' and i.voided_at is not null)

  union all

  -- ---- credit note: issued, or voided after it was issued ----------------------------
  -- Mirrors finance_invoice_totals, which takes only issued credit notes off
  -- what an invoice owes. A credit note is one amount, not lines, so its SST
  -- is the invoice's SST in proportion: amount * invoice SST / invoice total,
  -- rounded to the sen. The Sales line is the amount less that share, found
  -- by subtraction, so the two debits add back to the amount exactly whatever
  -- the rounding did. The share is never more than the amount (an invoice's
  -- SST is never more than its total); least() says so again. The invoice's
  -- lines are there, unchanged, whether the invoice is posted or has since
  -- been voided, so a voided credit note's two entries are the same numbers.
  select
    n.org_id,
    'credit_note:' || n.id::text,
    n.credit_date,
    'credit_note'::text,
    n.id,
    n.credit_note_no,
    concat_ws(' ', 'Credit note', n.credit_note_no, 'on ' || i.invoice_no),
    case when n.status = 'void' then (n.voided_at at time zone 'UTC')::date end,
    v.acct, v.sys, v.bank, v.cat, v.dflt, v.debit, v.credit
  from public.finance_credit_notes n
  left join public.finance_invoices i on i.org_id = n.org_id and i.id = n.invoice_id
  cross join lateral (
    select
      coalesce(sum(il.amount), 0) + coalesce(sum(il.sst_amount), 0) as total,
      coalesce(sum(il.sst_amount), 0) as sst
    from public.finance_invoice_lines il
    where il.org_id = n.org_id and il.invoice_id = n.invoice_id
  ) t
  cross join lateral (
    select least(coalesce(round(n.amount * t.sst / nullif(t.total, 0), 2), 0), n.amount) as sst_share
  ) sh
  cross join lateral (values
    (null::uuid, null::text, null::uuid, null::uuid, 'sales'::text, (n.amount - sh.sst_share)::numeric, 0::numeric),
    (null::uuid, 'sst_payable'::text, null::uuid, null::uuid, null::text, sh.sst_share::numeric, 0::numeric),
    (null::uuid, 'receivable'::text, null::uuid, null::uuid, null::text, 0::numeric, n.amount::numeric)
  ) as v(acct, sys, bank, cat, dflt, debit, credit)
  where n.status = 'issued' or (n.status = 'void' and n.voided_at is not null)

  union all

  -- ---- money in and money out: posted, or voided after it was posted; not a side of a transfer
  -- 'posted' is the one status that means the money has moved: it is what
  -- supplier_bill_totals, finance_invoice_totals, finance_expense_totals and
  -- finance_account_balances count. Drafts, payments waiting for approval,
  -- scheduled and rejected ones are out, and stay out when they are deleted.
  -- A void payment is in twice, once each way (see the top of this view).
  --
  -- What it is follows finance_cash_receipts and finance_payment_vouchers:
  --   money in                          source 'payment_in'
  --   money out against invoices or
  --     credit notes (finance_refunds)  source 'refund'
  --   every other money out             source 'payment_out'
  --
  -- The bank or cash account takes the whole amount on one side.
  --
  -- Money in, and a refund: the other side is at most two lines, as before.
  --   * to_category, on the payment's own category: the part of the payment
  --     that settles no document, when the payment has a category.
  --   * the rest, on Accounts Receivable.
  --
  -- Money out that is not a refund: the other side is at most three lines,
  -- by what the money settles.
  --   * to_category, as above: a payment voucher for a category has no split,
  --     so this is its whole amount.
  --   * to_expenses, on Accrued Expenses: what its split gives to expenses,
  --     which is what finance_expense_totals counts as paid.
  --   * the rest, on Accounts Payable: what its split gives to supplier
  --     bills, which is what supplier_bill_totals counts as paid, and any
  --     part that settles nothing on a payment with no category, as money
  --     paid on account, since there is no other account it could honestly
  --     go to.
  -- The three are to_category, to_expenses and the amount less both, so they
  -- add to the bank line by construction. to_expenses is held to no more
  -- than the amount less to_category, so the third is never below zero and
  -- never drops out as a line with no amount: the entry balances whatever
  -- the split is.
  --
  -- One payment pays one kind of document (FIN06 in
  -- private.finance_allocation_guard) and its split is never more than its
  -- amount (FIN03), so in practice a payment for expenses is one line on
  -- Accrued Expenses, a payment for bills one line on Accounts Payable, and
  -- to_expenses is exactly the sum of its expense allocations. The parts are
  -- still summed per kind from the split, not taken from "what kind is
  -- this", so a payment written by hand against both would post each part
  -- to its own account.
  --
  -- The functions the app records money with never make a payment that both
  -- settles documents and carries a category (FIN15 in
  -- finance_save_cash_receipt, finance_post_cash_receipt and
  -- finance_record_voucher), and they make its amount exactly its split. No
  -- table constraint says either, though: the guards only hold the split to
  -- no more than the amount, and call the part above it "money out that
  -- settles no document" (20261028100000, items 7 to 10). So a payment
  -- written by hand can be above its split, and its category then takes the
  -- part above the split, as that guard's wording has it.
  select
    t.org_id,
    p.source || ':' || t.id::text,
    t.txn_date,
    p.source,
    t.id,
    t.number,
    concat_ws(' ',
      case p.source when 'payment_in' then 'Receipt' when 'refund' then 'Refund' else 'Payment' end,
      t.number,
      case when t.direction = 'in' then 'from ' else 'to ' end || coalesce(ct.name, t.party_name)),
    case when t.status = 'void' then (t.voided_at at time zone 'UTC')::date end,
    v.acct, v.sys, v.bank, v.cat, v.dflt, v.debit, v.credit
  from public.finance_transactions t
  left join public.finance_contacts ct on ct.org_id = t.org_id and ct.id = t.contact_id
  cross join lateral (
    select
      coalesce(sum(a.amount), 0) as allocated,
      coalesce(sum(a.amount) filter (where a.expense_id is not null), 0) as expenses,
      count(a.invoice_id) + count(a.credit_note_id) as sales_documents
    from public.finance_allocations a
    where a.org_id = t.org_id and a.transaction_id = t.id
  ) k
  cross join lateral (
    select
      case
        when t.direction = 'in' then 'payment_in'
        when k.sales_documents > 0 then 'refund'
        else 'payment_out'
      end as source,
      case when t.category_id is not null then greatest(t.amount - k.allocated, 0) else 0 end as to_category
  ) p
  cross join lateral (
    -- Only money out that is not a refund has a part for expenses.
    select
      case when p.source = 'payment_out' then least(k.expenses, t.amount - p.to_category) else 0 end as to_expenses
  ) q
  cross join lateral (values
    (null::uuid, null::text, t.account_id, null::uuid, null::text,
      (case when t.direction = 'in' then t.amount else 0 end)::numeric,
      (case when t.direction = 'out' then t.amount else 0 end)::numeric),
    (null::uuid, case when p.source = 'payment_out' then 'payable' else 'receivable' end, null::uuid, null::uuid, null::text,
      (case when t.direction = 'out' then t.amount - p.to_category - q.to_expenses else 0 end)::numeric,
      (case when t.direction = 'in' then t.amount - p.to_category else 0 end)::numeric),
    (null::uuid, 'accrued_expenses'::text, null::uuid, null::uuid, null::text,
      q.to_expenses::numeric,
      0::numeric),
    (null::uuid, null::text, null::uuid, t.category_id, null::text,
      (case when t.direction = 'out' then p.to_category else 0 end)::numeric,
      (case when t.direction = 'in' then p.to_category else 0 end)::numeric)
  ) as v(acct, sys, bank, cat, dflt, debit, credit)
  where t.transfer_id is null
    and (t.status = 'posted' or (t.status = 'void' and t.voided_at is not null and t.number is not null))

  union all

  -- ---- supplier bill: posted, or voided after it was posted --------------------------
  -- Mirrors supplier_bill_totals: total is sum(amount + sst_amount). SST on a
  -- purchase is part of the cost, so the whole total goes to the bill's
  -- category. category_id is read from the table: that view's columns were
  -- fixed before the column existed.
  select
    sb.org_id,
    'bill:' || sb.id::text,
    sb.bill_date,
    'bill'::text,
    sb.id,
    sb.bill_no,
    concat_ws(' ', 'Bill', sb.bill_no, 'from ' || ct.name),
    case when sb.status = 'void' then (sb.voided_at at time zone 'UTC')::date end,
    v.acct, v.sys, v.bank, v.cat, v.dflt, v.debit, v.credit
  from public.supplier_bills sb
  left join public.finance_contacts ct on ct.org_id = sb.org_id and ct.id = sb.supplier_id
  cross join lateral (
    select coalesce(sum(bl.amount + bl.sst_amount), 0) as total
    from public.supplier_bill_lines bl
    where bl.org_id = sb.org_id and bl.bill_id = sb.id
  ) t
  cross join lateral (values
    (null::uuid, null::text, null::uuid, sb.category_id, null::text, t.total::numeric, 0::numeric),
    (null::uuid, 'payable'::text, null::uuid, null::uuid, null::text, 0::numeric, t.total::numeric)
  ) as v(acct, sys, bank, cat, dflt, debit, credit)
  where sb.status = 'posted' or (sb.status = 'void' and sb.voided_at is not null)

  union all

  -- ---- supplier credit note: issued, or voided after it was issued -----------------
  -- Mirrors finance_supplier_credit_note_totals. The bill's category is read
  -- from the table, as the bill's own entry does.
  select
    n.org_id,
    'supplier_credit_note:' || n.id::text,
    n.credit_date,
    'supplier_credit_note'::text,
    n.id,
    n.credit_note_no,
    concat_ws(' ', 'Supplier credit note', n.credit_note_no, 'on ' || sb.bill_no, 'from ' || ct.name),
    case when n.status = 'void' then (n.voided_at at time zone 'UTC')::date end,
    v.acct, v.sys, v.bank, v.cat, v.dflt, v.debit, v.credit
  from public.finance_supplier_credit_notes n
  left join public.supplier_bills sb on sb.org_id = n.org_id and sb.id = n.bill_id
  left join public.finance_contacts ct on ct.org_id = sb.org_id and ct.id = sb.supplier_id
  cross join lateral (values
    (null::uuid, 'payable'::text, null::uuid, null::uuid, null::text, n.amount::numeric, 0::numeric),
    (null::uuid, null::text, null::uuid, sb.category_id, null::text, 0::numeric, n.amount::numeric)
  ) as v(acct, sys, bank, cat, dflt, debit, credit)
  where n.status = 'issued' or (n.status = 'void' and n.voided_at is not null)

  union all

  -- ---- expense: approved -------------------------------------------------------------
  -- Mirrors finance_expense_totals: an expense counts once approved (it then
  -- reads 'approved' or 'paid'); pending and rejected ones are out. amount is
  -- what is to be paid, SST included, and all of it is the cost. It is owed
  -- on Accrued Expenses, not Accounts Payable; paying it is a payment out
  -- against it, above, which takes it off Accrued Expenses. An expense has no
  -- void, so it is never reversed.
  select
    e.org_id,
    'expense:' || e.id::text,
    e.expense_date,
    'expense'::text,
    e.id,
    null::text,
    concat_ws(' ', 'Expense', 'to ' || coalesce(ct.name, e.vendor_name)),
    null::date,
    v.acct, v.sys, v.bank, v.cat, v.dflt, v.debit, v.credit
  from public.finance_expenses e
  left join public.finance_contacts ct on ct.org_id = e.org_id and ct.id = e.vendor_id
  cross join lateral (values
    (null::uuid, null::text, null::uuid, e.category_id, null::text, e.amount::numeric, 0::numeric),
    (null::uuid, 'accrued_expenses'::text, null::uuid, null::uuid, null::text, 0::numeric, e.amount::numeric)
  ) as v(acct, sys, bank, cat, dflt, debit, credit)
  where e.status = 'approved'

  union all

  -- ---- transfer between accounts: both sides posted, or both voided after that -----
  -- Two finance_transactions rows that share a transfer_id, money out of one
  -- account and money in to another (20261031090000;
  -- finance_bank_transactions calls both 'transfer'). One entry, read from
  -- the paying side: its date, its number and its amount on both lines, and,
  -- when the transfer has been voided, its voided_at, so a voided transfer
  -- is one reversal as it was one entry.
  -- private.finance_transfer_pair_check holds the two sides to the same
  -- amount, date, number and status, and one UPDATE voids both, so the
  -- receiving side would say the same; taking one amount for both lines is
  -- what makes this balance without leaning on that.
  select
    o.org_id,
    'transfer:' || o.transfer_id::text,
    o.txn_date,
    'transfer'::text,
    o.transfer_id,
    o.number,
    concat_ws(' ', 'Transfer', o.number, 'from ' || fa.name, 'to ' || ta.name),
    case when o.status = 'void' then (o.voided_at at time zone 'UTC')::date end,
    v.acct, v.sys, v.bank, v.cat, v.dflt, v.debit, v.credit
  from public.finance_transactions o
  join public.finance_transactions i
    on i.org_id = o.org_id and i.transfer_id = o.transfer_id and i.direction = 'in'
  left join public.finance_accounts fa on fa.org_id = o.org_id and fa.id = o.account_id
  left join public.finance_accounts ta on ta.org_id = i.org_id and ta.id = i.account_id
  cross join lateral (values
    (null::uuid, null::text, i.account_id, null::uuid, null::text, o.amount::numeric, 0::numeric),
    (null::uuid, null::text, o.account_id, null::uuid, null::text, 0::numeric, o.amount::numeric)
  ) as v(acct, sys, bank, cat, dflt, debit, credit)
  where o.transfer_id is not null and o.direction = 'out'
    and ((o.status = 'posted' and i.status = 'posted')
         or (o.status = 'void' and i.status = 'void' and o.voided_at is not null and o.number is not null))

  union all

  -- ---- opening balance of a bank or cash account: not zero ---------------------------
  -- Mirrors finance_account_balances, which adds opening_balance to every
  -- account's balance, archived ones included. A positive balance is money
  -- the business had: debit the account, credit Opening Balance Equity. A
  -- negative one (an overdraft) is the other way round.
  select
    a.org_id,
    'opening:' || a.id::text,
    a.opening_date,
    'opening'::text,
    a.id,
    null::text,
    'Opening balance of ' || a.name,
    null::date,
    v.acct, v.sys, v.bank, v.cat, v.dflt, v.debit, v.credit
  from public.finance_accounts a
  cross join lateral (values
    (null::uuid, null::text, a.id, null::uuid, null::text,
      greatest(a.opening_balance, 0)::numeric, greatest(-a.opening_balance, 0)::numeric),
    (null::uuid, 'opening_equity'::text, null::uuid, null::uuid, null::text,
      greatest(-a.opening_balance, 0)::numeric, greatest(a.opening_balance, 0)::numeric)
  ) as v(acct, sys, bank, cat, dflt, debit, credit)
  where a.opening_balance <> 0 and a.opening_balance <> 'NaN'

  union all

  -- ---- contra entry: posted, or voided after it was posted ---------------------------
  -- 20261119100000. A contra entry sets off what a contact owes on invoices
  -- against what is owed to them on bills, with no money moving: Accounts
  -- Payable goes down (debit) and Accounts Receivable goes down (credit) by
  -- the same amount. Mirrors finance_invoice_totals and supplier_bill_totals,
  -- which take posted contra lines off each document's balance; the guard on
  -- contra entries posts one only when its invoice lines and its bill lines
  -- each add up to its amount, so the entry's one amount is what both views
  -- took off. No line names a bank or cash account, so the Cash Flow and
  -- every bank balance are untouched. A voided one is reversed on the day it
  -- was voided by the outer query, as every other void.
  select
    k.org_id,
    'contra:' || k.id::text,
    k.contra_date,
    'contra'::text,
    k.id,
    k.contra_no,
    concat_ws(' ', 'Contra', k.contra_no, 'with ' || ct.name),
    case when k.status = 'void' then (k.voided_at at time zone 'UTC')::date end,
    v.acct, v.sys, v.bank, v.cat, v.dflt, v.debit, v.credit
  from public.finance_contras k
  left join public.finance_contacts ct on ct.org_id = k.org_id and ct.id = k.contact_id
  cross join lateral (values
    (null::uuid, 'payable'::text, null::uuid, null::uuid, null::text, k.amount::numeric, 0::numeric),
    (null::uuid, 'receivable'::text, null::uuid, null::uuid, null::text, 0::numeric, k.amount::numeric)
  ) as v(acct, sys, bank, cat, dflt, debit, credit)
  where k.status = 'posted' or (k.status = 'void' and k.voided_at is not null)

  union all

  -- ---- manual journal: posted ---------------------------------------------------------
  -- As entered. The guard on journals refused to post it unless its debits
  -- equalled its credits, and a posted journal's lines cannot change. A
  -- journal has no void: it is reversed by a second journal, which is an
  -- entry of its own here.
  select
    jl.org_id,
    'journal:' || j.id::text,
    j.journal_date,
    'journal'::text,
    j.id,
    j.journal_no,
    j.description,
    null::date,
    jl.account_id, null::text, null::uuid, null::uuid, null::text, jl.debit::numeric, jl.credit::numeric
  from public.finance_journal_lines jl
  join public.finance_journals j on j.org_id = jl.org_id and j.id = jl.journal_id
  where j.status = 'posted'
) l(org_id, entry_key, entry_date, source, source_id, source_no, description, voided_on,
    acct, sys, bank, cat, dflt, debit, credit)
-- Each line once as it is, and once more, sides swapped, if its document was voided.
cross join lateral (values (false), (true)) as r(reversal)
left join public.finance_ledger_accounts s on s.org_id = l.org_id and s.system_key = l.sys
left join public.finance_ledger_accounts b on b.org_id = l.org_id and b.bank_account_id = l.bank
left join public.finance_ledger_accounts c on c.org_id = l.org_id and c.category_id = l.cat
left join public.finance_ledger_accounts d on d.org_id = l.org_id and d.default_for = l.dflt
where (not r.reversal or l.voided_on is not null)
  -- A line with no amount is left out: an invoice with no SST has no SST line.
  and (l.debit > 0 or l.credit > 0);

-- "create or replace" keeps the grants; said again so this file can be read
-- without the others.
revoke all on public.finance_ledger_lines from anon, authenticated, service_role;
grant select on public.finance_ledger_lines to authenticated;

-- ---- functions ----------------------------------------------------------------------
-- All run as the caller, so RLS decides who may write and to which workspace.

-- Creates a draft supplier credit note, or replaces a draft. Returns its id.
create or replace function public.finance_save_supplier_credit_note(target_org uuid, note jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  nid uuid := nullif(note->>'id', '')::uuid;
  n integer;
begin
  if nid is null then
    insert into public.finance_supplier_credit_notes
      (org_id, bill_id, credit_date, reason, amount, supplier_ref, notes, status)
    values (
      target_org,
      (note->>'bill_id')::uuid,
      coalesce((note->>'credit_date')::date, current_date),
      coalesce(nullif(note->>'reason', ''), 'other'),
      (note->>'amount')::numeric,
      nullif(note->>'supplier_ref', ''),
      nullif(note->>'notes', ''),
      'draft'
    )
    returning id into nid;
  else
    update public.finance_supplier_credit_notes
       set bill_id = (note->>'bill_id')::uuid,
           credit_date = coalesce((note->>'credit_date')::date, current_date),
           reason = coalesce(nullif(note->>'reason', ''), 'other'),
           amount = (note->>'amount')::numeric,
           supplier_ref = nullif(note->>'supplier_ref', ''),
           notes = nullif(note->>'notes', ''),
           updated_at = now()
     where org_id = target_org and id = nid;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'the supplier credit note no longer exists' using errcode = 'FIN11';
    end if;
  end if;
  return nid;
end $$;

-- Issues a draft and returns its number. From this moment it is in the books
-- and is applied to its own bill, up to what that bill still owes (its total,
-- less payments and credit already against it, counting payments not yet
-- posted as the guard on payments does). What is left is open on the supplier.
-- The number is taken here, so a failed issue does not use one up.
create or replace function public.finance_issue_supplier_credit_note(target_org uuid, target_note uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c record;
  no text;
  room numeric;
  put numeric;
begin
  select status, credit_note_no, bill_id, amount into c from public.finance_supplier_credit_notes
  where org_id = target_org and id = target_note for update;
  if not found then
    raise exception 'the supplier credit note no longer exists' using errcode = 'FIN11';
  end if;
  if c.status <> 'draft' then
    raise exception 'the supplier credit note is already issued' using errcode = 'FIN01';
  end if;

  no := coalesce(c.credit_note_no, public.finance_next_number(target_org, 'supplier_credit_note'));
  -- The guard locks the bill here, so the figures below stay put until this ends.
  update public.finance_supplier_credit_notes
     set status = 'issued', credit_note_no = no, issued_at = now(), updated_at = now()
   where org_id = target_org and id = target_note;

  select coalesce((select sum(bl.amount + bl.sst_amount) from public.supplier_bill_lines bl
                    where bl.org_id = target_org and bl.bill_id = c.bill_id), 0)
       - coalesce((select sum(a.amount) from public.finance_allocations a
                    join public.finance_transactions x on x.org_id = a.org_id and x.id = a.transaction_id
                    where a.org_id = target_org and a.bill_id = c.bill_id
                      and x.status in ('draft','pending_approval','scheduled','posted')), 0)
       - coalesce((select sum(k.amount) from public.finance_supplier_credit_applications k
                    where k.org_id = target_org and k.bill_id = c.bill_id), 0)
       - coalesce((select sum(cl.amount) from public.finance_contra_lines cl
                    join public.finance_contras ce on ce.org_id = cl.org_id and ce.id = cl.contra_id
                    where cl.org_id = target_org and cl.bill_id = c.bill_id and ce.status = 'posted'), 0)
    into room;
  put := least(c.amount, room);
  if put > 0 then
    insert into public.finance_supplier_credit_applications (org_id, credit_note_id, bill_id, amount)
    values (target_org, target_note, c.bill_id, put);
  end if;
  return no;
end $$;

revoke all on function public.finance_save_supplier_credit_note(uuid, jsonb) from public, anon, service_role;
revoke all on function public.finance_issue_supplier_credit_note(uuid, uuid) from public, anon, service_role;
grant execute on function public.finance_save_supplier_credit_note(uuid, jsonb) to authenticated;
grant execute on function public.finance_issue_supplier_credit_note(uuid, uuid) to authenticated;

-- ---- nothing was left out -----------------------------------------------------------
-- The triggers are on and sit where the header says, and service_role holds
-- nothing on the new relations. Otherwise everything rolls back.
do $$
declare
  names text;
  left_over text;
begin
  select string_agg(g.tgname, ',' order by g.tgname) into names
    from pg_catalog.pg_trigger g
   where g.tgrelid = 'public.finance_supplier_credit_notes'::regclass and not g.tgisinternal
     and g.tgenabled = 'O' and (g.tgtype & 2) = 2;
  if names <> 'finance_supplier_credit_note_guard,finance_supplier_credit_note_sign_off,finance_void_stamp' then
    raise exception 'the BEFORE triggers on finance_supplier_credit_notes are not as this file needs: %', names;
  end if;

  select string_agg(g.tgname, ',' order by g.tgname) into names
    from pg_catalog.pg_trigger g
   where g.tgrelid = 'public.finance_allocations'::regclass and not g.tgisinternal
     and g.tgenabled = 'O' and (g.tgtype & 2) = 2;
  if names !~ '^(.*,)?finance_allocation_guard,finance_allocation_guard_credit,(finance_allocation_less_contra,)?finance_allocation_still(,.*)?$' then
    raise exception 'the BEFORE triggers on finance_allocations are not in the order this file needs: %', names;
  end if;

  select string_agg(g.tgname, ',' order by g.tgname) into names
    from pg_catalog.pg_trigger g
   where g.tgrelid = 'public.supplier_bills'::regclass and not g.tgisinternal
     and g.tgenabled = 'O' and (g.tgtype & 2) = 2;
  if names !~ '^(.*,)?finance_bill_guard,(.*,)?finance_bill_sign_off,(.*,)?finance_bill_void_credit,finance_void_stamp$' then
    raise exception 'the BEFORE triggers on supplier_bills are not in the order this file needs: %', names;
  end if;

  select string_agg(c.relname, ',' order by c.relname) into left_over
    from pg_catalog.pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
     and (c.relname like 'finance\_%' or c.relname like 'supplier\_bill%')
     and exists (select 1 from aclexplode(c.relacl) a where a.grantee = 'service_role'::regrole);
  if left_over is not null then
    raise exception 'service_role still holds a privilege on: %', left_over;
  end if;
end $$;
