-- Bendahara Purchases, phase 1 (issue #41): contacts, products, supplier bills
-- with lines, and payments out.
--
-- Every child row carries org_id and references its parent by (org_id, id).
-- Foreign key checks bypass RLS, so a plain `references parent(id)` would let
-- one org link to another org's rows (and then block or cascade from that org's
-- deletes). The composite key makes a cross-org link impossible.
--
-- Money is numeric(14,2). Unit prices keep 4 decimals because suppliers quote
-- per-piece prices below one sen; line amounts round to 2.
-- Bill balance and Overdue are derived in supplier_bill_totals, never stored.
--
-- Contacts and products are prefixed finance_ so they are not mistaken for
-- Kasturi's crm_contacts: these are the parties and items on finance documents.

create table public.finance_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  type text not null check (type in ('customer','supplier')),
  name text not null,
  email text,
  phone text,
  ssm_no text,
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

create table public.finance_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  sku text,
  name text not null,
  type text not null default 'product' check (type in ('product','service')),
  category text,
  uom text not null default 'unit',
  price numeric(14,2) not null default 0 check (price >= 0),
  cost numeric(14,4) not null default 0 check (cost >= 0),
  sst_rate numeric(5,2) not null default 0 check (sst_rate between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, sku)
);

-- status is what a person sets; Pending, Paid and Overdue are derived from
-- payments and due_date in supplier_bill_totals.
create table public.supplier_bills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  bill_no text not null,
  supplier_ref text,
  supplier_id uuid not null,
  bill_date date not null default current_date,
  due_date date not null,
  status text not null default 'draft' check (status in ('draft','posted','void')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, bill_no),
  check (due_date >= bill_date),
  foreign key (org_id, supplier_id) references public.finance_contacts(org_id, id)
);
create index supplier_bills_supplier_idx on public.supplier_bills(org_id, supplier_id);

create table public.supplier_bill_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  bill_id uuid not null,
  product_id uuid,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  uom text,
  pack_size text,
  unit_price numeric(14,4) not null check (unit_price >= 0),
  sst_rate numeric(5,2) not null default 0 check (sst_rate between 0 and 100),
  amount numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  sst_amount numeric(14,2) generated always as (round(quantity * unit_price * sst_rate / 100, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, bill_id) references public.supplier_bills(org_id, id) on delete cascade,
  foreign key (org_id, product_id) references public.finance_products(org_id, id)
);
create index supplier_bill_lines_bill_idx on public.supplier_bill_lines(org_id, bill_id);
create index supplier_bill_lines_product_idx on public.supplier_bill_lines(org_id, product_id);

-- ponytail: overpayment (paid > bill total) is not blocked here; the payment
-- form validates it. Add a constraint trigger if payments get a second writer.
create table public.payments_out (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  payment_no text not null,
  bill_id uuid not null,
  paid_on date not null default current_date,
  method text not null check (method in ('bank_transfer','fpx','cash','cheque')),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'paid' check (status in ('pending','scheduled','paid')),
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, payment_no),
  foreign key (org_id, bill_id) references public.supplier_bills(org_id, id)
);
create index payments_out_bill_idx on public.payments_out(org_id, bill_id);

-- security_invoker makes the view run as the caller, so the tables' RLS
-- applies to it. Only payments with status 'paid' reduce the balance.
-- ponytail: Overdue uses the database's current_date (UTC), so it flips at
-- 08:00 in Malaysia; use the org's timezone once orgs store one.
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
  select sum(amount) as paid
  from public.payments_out
  where org_id = b.org_id and bill_id = b.id and status = 'paid'
) p on true;

-- RLS: members read, writers (any role but viewer) write. The restrictive
-- mfa_required policy is the same second-factor check every other table has.
do $$
declare t text;
begin
  foreach t in array array['finance_contacts','finance_products','supplier_bills','supplier_bill_lines','payments_out'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_org_member(org_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_org_writer(org_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.is_org_writer(org_id))', t || '_delete', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated '
      || 'using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
    -- Grant exactly what the policies cover; default privileges vary by project.
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on public.supplier_bill_totals from anon, authenticated;
grant select on public.supplier_bill_totals to authenticated;
