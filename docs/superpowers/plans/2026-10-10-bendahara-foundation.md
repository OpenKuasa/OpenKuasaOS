# Bendahara Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage 1 of 7 of the Bendahara CRUD spec: the shared records every later stage needs (contacts that can be customer and supplier, accounts, categories, document numbering), the finance write path, and Customers & Suppliers and Products working on the workspace's own data.

**Architecture:** One migration adds the shared tables and a numbering function. Writes follow the Jebat pattern: one Zod schema plus one async function per write in `src/lib/finance/`, called by server actions in `src/app/(app)/finance/actions.ts` that guard, parse and revalidate. Each screen file is an async server component that loads data and hands a client view its rows and, for writers only, its actions.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing Next code, per `AGENTS.md`), React 19, Supabase Postgres with RLS, Zod 4, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-10-bendahara-crud-design.md`. This plan covers build-order item 1 only. Stages 2 to 7 each get their own plan after the stage before is merged.

## Global Constraints

- New tables are prefixed `finance_`, carry `org_id`, use composite `(org_id, id)` foreign keys, `numeric(14,2)` ringgit, `created_at` and `updated_at`.
- Every table: select for `private.is_org_member(org_id)`, writes for `private.is_org_writer(org_id)`, the restrictive `mfa_required` policy, `revoke all … from anon, authenticated` then explicit grants to `authenticated`.
- `org_id` always comes from the server-side context, never from client input.
- One Zod schema per write; messages are sentences a person can act on.
- Forms are cards closed by default; delete is confirmed in the page, never `window.confirm`.
- No purple, violet, indigo or fuchsia anywhere in the UI. No Kuasa names in `src/`.
- Viewers and the demo workspace get no buttons or menus; server actions check again.
- With no Supabase environment the screen shows sample data with no actions.
- pnpm only. 2-space indent, single quotes, semicolons, named exports (screen files keep their default export because `src/screens/registry.ts` imports it).
- Branch `feat-084-bendahara-crud`; PR title equals the branch name; no issue keyword unless `gh issue list` shows a real tracking issue. Re-check `git branch -r` for a number clash before pushing. Do not push or merge until asked.
- Do not touch `payments_out`, `supplier_bill_totals`, `supplier_bills` or `src/lib/finance/purchases.ts`; they belong to stage 2.
- A client component never imports from a file that imports `@/lib/supabase/server`. `src/lib/finance/contacts.ts`, `products.ts`, `result.ts` and `format.ts` must stay free of server-only imports because the client views import types and constants from them.
- The hosted database is shared with production. A migration is dry-run inside a rolled-back transaction first, and applied only with the owner's go-ahead.

## Review Focus

1. A contact saved as neither customer nor supplier: the form refuses with "Tick Customer, Supplier or both." and the database check refuses too. (Task 2 schema test, Task 1 database test.)
2. Deleting a supplier that has bills: refused with "This contact is used on bills or other documents. Archive it instead." and the row stays. (Task 2 test.)
3. Two people taking a document number at the same moment: both get a number and the numbers differ. (Task 1 database test.)
4. Archiving a supplier with open bills: the supplier leaves the default list but its bills still show on Supplier Bills, because that view joins contacts without filtering on `active`. (Task 2 test asserts archived contacts keep their payable in `contactsView`.)
5. A product saved with an SKU another product already has: "Another product already uses that SKU." Two products with no SKU are both allowed. (Task 3 test.)

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261012170000_bendahara_foundation.sql` | Contacts change, accounts, categories, sequences, `finance_next_number`, default categories |
| `tests/bendahara-foundation.rls.test.ts` | Database tests for the migration |
| `tests/bendahara-purchases.test.ts` | Updated for `is_supplier` |
| `src/lib/finance/result.ts` | `FinanceWriteContext`, `FinResult`, `writeFailed`, Postgres codes |
| `src/lib/finance/contacts.ts` | Contact type, schemas, reads, writes, `contactsView` |
| `src/lib/finance/products.ts` | Product type, schemas, reads, writes, `productsView` |
| `tests/finance-contacts.test.ts`, `tests/finance-products.test.ts` | Unit tests |
| `src/app/(app)/finance/actions.ts` | Server actions |
| `src/lib/finance/format.ts` | `rm`, `rmShort`: money formatting safe to import in the browser |
| `src/components/finance/use-finance-action.ts` | Pending and error state for one action |
| `src/components/finance/row-menu.tsx` | The "⋯" menu |
| `src/components/finance/confirm-row.tsx` | In-table confirmation row |
| `src/components/finance/contacts-view.tsx` | Customers & Suppliers client view |
| `src/components/finance/products-view.tsx` | Products client view |
| `src/screens/finance/customers-suppliers.tsx` | Server loader (replaces the mock-up) |
| `src/screens/finance/products.tsx` | Server loader (replaces the mock-up) |
| `src/config/live-screens.ts` | Adds the two screens |

---

### Task 1: Migration and database tests

**Files:**
- Create: `supabase/migrations/20261012170000_bendahara_foundation.sql`
- Create: `tests/bendahara-foundation.rls.test.ts`
- Modify: `tests/bendahara-purchases.test.ts` (two places that use `type`)

**Interfaces:**
- Produces: tables `finance_accounts`, `finance_categories`, `finance_sequences`; columns `finance_contacts.is_customer`, `is_supplier`, `tin` (column `type` removed); function `public.finance_next_number(target_org uuid, doc text) returns text`.

- [ ] **Step 1: Check the timestamp is still free**

Run: `ls supabase/migrations | tail -3`
Expected: the newest file sorts before `20261012170000`. If not, use a later timestamp everywhere this plan names the file.

- [ ] **Step 2: Write the failing database test**

Create `tests/bendahara-foundation.rls.test.ts`:

```ts
import { beforeAll, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';

const testWithSupabase = hasSupabaseEnv ? test : test.skip;

if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function client(): SupabaseClient {
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function anonUserWithOrg(orgName: string) {
  const c = client();
  const { error: authErr } = await c.auth.signInAnonymously();
  expect(authErr, authErr?.message).toBeNull();
  const { data: orgId, error } = await c.rpc('create_org_for_current_user', { org_name: orgName });
  expect(error, error?.message).toBeNull();
  return { c, orgId: orgId as string };
}

let a: Awaited<ReturnType<typeof anonUserWithOrg>>;
let b: Awaited<ReturnType<typeof anonUserWithOrg>>;

beforeAll(async () => {
  if (!hasSupabaseEnv) return;
  a = await anonUserWithOrg('Foundation A Sdn Bhd');
  b = await anonUserWithOrg('Foundation B Sdn Bhd');
});

testWithSupabase('a contact can be customer and supplier at once', async () => {
  const { data, error } = await a.c
    .from('finance_contacts')
    .insert({ org_id: a.orgId, name: 'Both Sdn Bhd', is_customer: true, is_supplier: true, tin: 'C1234567890' })
    .select('is_customer, is_supplier, tin')
    .single();
  expect(error, error?.message).toBeNull();
  expect(data).toEqual({ is_customer: true, is_supplier: true, tin: 'C1234567890' });
});

testWithSupabase('a contact that is neither customer nor supplier is refused', async () => {
  const { error } = await a.c
    .from('finance_contacts')
    .insert({ org_id: a.orgId, name: 'Nobody', is_customer: false, is_supplier: false });
  expect(error?.code).toBe('23514');
});

testWithSupabase('a new workspace starts with the default categories', async () => {
  const { data, error } = await a.c
    .from('finance_categories')
    .select('name, kind')
    .eq('org_id', a.orgId);
  expect(error, error?.message).toBeNull();
  const expense = (data ?? []).filter((c) => c.kind === 'expense').map((c) => c.name).sort();
  expect(expense).toEqual(['Marketing', 'Rent', 'Salaries', 'Services', 'Supplies', 'Travel', 'Utilities']);
  expect((data ?? []).filter((c) => c.kind === 'income').map((c) => c.name).sort()).toEqual(['Other income', 'Sales']);
});

testWithSupabase('the same category name twice in one workspace is refused, whatever the capitals', async () => {
  const { error } = await a.c.from('finance_categories').insert({ org_id: a.orgId, name: 'rent', kind: 'expense' });
  expect(error?.code).toBe('23505');
});

testWithSupabase('accounts, categories and sequences are invisible and unwritable across workspaces', async () => {
  const { data: account, error } = await a.c
    .from('finance_accounts')
    .insert({ org_id: a.orgId, name: 'Main Bank', kind: 'bank', bank_name: 'Maybank' })
    .select('id')
    .single();
  expect(error, error?.message).toBeNull();

  for (const table of ['finance_accounts', 'finance_categories', 'finance_sequences']) {
    const { data } = await b.c.from(table).select('id').eq('org_id', a.orgId);
    expect(data ?? [], table).toEqual([]);
  }
  const write = await b.c.from('finance_accounts').insert({ org_id: a.orgId, name: 'Intruder', kind: 'cash' });
  expect(write.error?.code).toBe('42501');
  const { data: changed } = await b.c.from('finance_accounts').update({ name: 'Hacked' }).eq('id', account!.id).select('id');
  expect(changed ?? []).toEqual([]);
});

testWithSupabase('document numbers count up per type with the default prefix', async () => {
  const first = await a.c.rpc('finance_next_number', { target_org: a.orgId, doc: 'invoice' });
  const second = await a.c.rpc('finance_next_number', { target_org: a.orgId, doc: 'invoice' });
  const quote = await a.c.rpc('finance_next_number', { target_org: a.orgId, doc: 'quotation' });
  expect(first.error, first.error?.message).toBeNull();
  expect(first.data).toBe('INV-0001');
  expect(second.data).toBe('INV-0002');
  expect(quote.data).toBe('QT-0001');
});

testWithSupabase('two requests at the same moment never get the same number', async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => a.c.rpc('finance_next_number', { target_org: a.orgId, doc: 'receipt' })),
  );
  const numbers = results.map((r) => r.data as string);
  expect(results.every((r) => r.error === null)).toBe(true);
  expect(new Set(numbers).size).toBe(8);
});

testWithSupabase('a number cannot be taken for another workspace, or for an unknown document type', async () => {
  const other = await b.c.rpc('finance_next_number', { target_org: a.orgId, doc: 'invoice' });
  expect(other.error?.code).toBe('42501');
  const unknown = await a.c.rpc('finance_next_number', { target_org: a.orgId, doc: 'payslip' });
  expect(unknown.error).not.toBeNull();
});

testWithSupabase('a demo viewer cannot take a number or add an account', async () => {
  const c = client();
  const { error: authErr } = await c.auth.signInAnonymously();
  expect(authErr, authErr?.message).toBeNull();
  const { data: demoId, error } = await c.rpc('join_demo_org');
  expect(error, error?.message).toBeNull();
  const number = await c.rpc('finance_next_number', { target_org: demoId, doc: 'invoice' });
  expect(number.error?.code).toBe('42501');
  const write = await c.from('finance_accounts').insert({ org_id: demoId, name: 'Viewer', kind: 'cash' });
  expect(write.error?.code).toBe('42501');
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm exec vitest run tests/bendahara-foundation.rls.test.ts`
Expected: FAIL. The first test fails with "Could not find the 'is_customer' column".

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261012170000_bendahara_foundation.sql`:

```sql
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

  return p || lpad(n::text, w, '0');
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
```

- [ ] **Step 5: Update the existing purchases test for the contacts change**

In `tests/bendahara-purchases.test.ts`, replace the supplier insert in `beforeAll`:

```ts
  supplierA = await insertOne(a.c, 'finance_contacts', {
    org_id: a.orgId,
    is_supplier: true,
    name: 'Supplier of A',
  });
```

and in the test "a demo viewer reads the seeded bills but cannot write" replace `.eq('type', 'supplier')` with:

```ts
    .eq('is_supplier', true)
```

Run: `grep -n "type: 'supplier'\|'type'" tests/bendahara-purchases.test.ts`
Expected: no output. If any other line still uses the `type` column, change it the same way.

- [ ] **Step 6: Dry-run the migration on the hosted database**

Using the `openkuasa-supabase` MCP `execute_sql`, send `begin;`, then the whole migration file, then this block, then `rollback;`:

```sql
do $$
declare r text;
begin
  select format('contacts=%s customers=%s suppliers=%s neither=%s | categories_per_org=%s | policies=%s restrictive=%s',
    (select count(*) from public.finance_contacts),
    (select count(*) from public.finance_contacts where is_customer),
    (select count(*) from public.finance_contacts where is_supplier),
    (select count(*) from public.finance_contacts where not is_customer and not is_supplier),
    (select min(n) || '..' || max(n) from (select count(*) n from public.finance_categories group by org_id) s),
    (select count(*) from pg_policies where schemaname = 'public' and tablename in ('finance_accounts','finance_categories','finance_sequences')),
    (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE' and tablename in ('finance_accounts','finance_categories','finance_sequences')))
  into r;
  raise exception 'DRYRUN OK, rolling back: %', r;
end $$;
```

Expected: an error whose message starts `DRYRUN OK, rolling back:` with `neither=0`, `categories_per_org=9..9`, `policies=15 restrictive=3`. Then confirm nothing was left:

```sql
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('finance_accounts','finance_categories','finance_sequences');
```

Expected: `0`.

- [ ] **Step 7: Apply the migration, with the owner's go-ahead**

Stop and ask the owner before this step. Then apply the file with the MCP `apply_migration`, name `bendahara_foundation`.

- [ ] **Step 8: Run the database tests**

Run: `pnpm exec vitest run tests/bendahara-foundation.rls.test.ts tests/bendahara-purchases.test.ts`
Expected: PASS, all tests in both files.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261012170000_bendahara_foundation.sql tests/bendahara-foundation.rls.test.ts tests/bendahara-purchases.test.ts
git commit -m "feat: finance accounts, categories and document numbering; contacts can be customer and supplier"
```

---

### Task 2: Contacts data layer

**Files:**
- Create: `src/lib/finance/result.ts`
- Create: `src/lib/finance/contacts.ts`
- Test: `tests/finance-contacts.test.ts`

**Interfaces:**
- Produces, from `result.ts`:
  - `type FinanceWriteContext = { client: SupabaseClient; orgId: string }`
  - `type FinResult<T> = { ok: true; data: T } | { ok: false; error: string }`
  - `PG_UNIQUE = '23505'`, `PG_FOREIGN_KEY = '23503'`, `PG_CHECK = '23514'`
  - `writeFailed(fnName: string, error: unknown): { ok: false; error: string }`
  - `pgCode(error: unknown): string | undefined`
- Produces, from `contacts.ts`:
  - `type FinanceContact`, `CONTACT_MESSAGES`, `CONTACT_NAME_MAX`
  - `createContactInput`, `updateContactInput`, `setContactActiveInput`, `deleteContactInput`
  - `listContacts(ctx): Promise<FinanceContact[]>`
  - `listBillBalances(ctx): Promise<BillBalance[]>`
  - `createContact`, `updateContact`, `setContactActive`, `deleteContact` — each `(ctx, input) => Promise<FinResult<…>>`
  - `contactsView(contacts: FinanceContact[], bills: BillBalance[]): ContactsViewData`

- [ ] **Step 1: Write the failing tests**

Create `tests/finance-contacts.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceWriteContext } from '@/lib/finance/result';
import {
  type FinanceContact,
  contactsView,
  createContact,
  createContactInput,
  deleteContact,
  setContactActive,
  updateContact,
  updateContactInput,
} from '@/lib/finance/contacts';

const ID = '11111111-1111-4111-8111-111111111111';

type Call = { table: string; op: string; values?: Record<string, unknown>; filters: Record<string, unknown> };

/** A stand-in Supabase client that records the request and answers with a canned result. */
function fakeClient(answer: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: '', filters: {} };
      calls.push(call);
      const builder = {
        insert(values: Record<string, unknown>) { call.op = 'insert'; call.values = values; return builder; },
        update(values: Record<string, unknown>) { call.op = 'update'; call.values = values; return builder; },
        delete() { call.op = 'delete'; return builder; },
        eq(column: string, value: unknown) { call.filters[column] = value; return builder; },
        select() { return builder; },
        single: async () => answer,
        maybeSingle: async () => answer,
      };
      return builder;
    },
  };
  return { ctx: { client: client as never, orgId: 'org-1' } satisfies FinanceWriteContext, calls };
}

const contact: FinanceContact = {
  id: ID, name: 'Lim Hardware Sdn Bhd', is_customer: false, is_supplier: true,
  email: 'sales@limhardware.com.my', phone: null, ssm_no: null, tin: null,
  payment_terms_days: 30, active: true,
};

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => { logged = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { logged.mockRestore(); });

const first = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, value: unknown) =>
  schema.safeParse(value).error?.issues[0]?.message;

describe('contact schemas', () => {
  const valid = { name: 'Aisyah Trading', is_customer: true, is_supplier: false };

  it('asks for a name', () => {
    expect(first(createContactInput, { ...valid, name: '   ' })).toBe('Enter the contact’s name.');
  });
  it('refuses a contact that is neither customer nor supplier', () => {
    expect(first(createContactInput, { ...valid, is_customer: false })).toBe('Tick Customer, Supplier or both.');
    expect(first(updateContactInput, { id: ID, is_customer: false, is_supplier: false })).toBe('Tick Customer, Supplier or both.');
  });
  it('refuses an email that is not an email, and accepts an empty one', () => {
    expect(first(createContactInput, { ...valid, email: 'not-an-email' })).toBe('Enter a valid email address, or leave it empty.');
    expect(createContactInput.parse({ ...valid, email: '' }).email).toBeNull();
  });
  it('turns empty text into null and trims the rest', () => {
    const parsed = createContactInput.parse({ ...valid, name: '  Aisyah Trading ', phone: '', ssm_no: ' 201901012345 ', tin: '' });
    expect(parsed).toMatchObject({ name: 'Aisyah Trading', phone: null, ssm_no: '201901012345', tin: null, payment_terms_days: 30 });
  });
  it('keeps payment terms between 0 and 365 whole days', () => {
    expect(first(createContactInput, { ...valid, payment_terms_days: -1 })).toBe('Payment terms must be between 0 and 365 days.');
    expect(first(createContactInput, { ...valid, payment_terms_days: 400 })).toBe('Payment terms must be between 0 and 365 days.');
    expect(first(createContactInput, { ...valid, payment_terms_days: 7.5 })).toBe('Payment terms must be between 0 and 365 days.');
  });
});

describe('contact writes', () => {
  it('creates in the caller’s workspace, never one named by the input', async () => {
    const { ctx, calls } = fakeClient({ data: contact, error: null });
    const result = await createContact(ctx, { name: 'Lim Hardware Sdn Bhd', is_customer: false, is_supplier: true, org_id: 'other' } as never);
    expect(result).toEqual({ ok: true, data: contact });
    expect(calls[0]).toMatchObject({ table: 'finance_contacts', op: 'insert' });
    expect(calls[0].values).toMatchObject({ org_id: 'org-1', is_supplier: true });
  });
  it('updates only the fields sent, scoped to the workspace, and stamps updated_at', async () => {
    const { ctx, calls } = fakeClient({ data: contact, error: null });
    await updateContact(ctx, { id: ID, phone: '+60 3-7956 1234' });
    expect(calls[0].filters).toEqual({ id: ID, org_id: 'org-1' });
    expect(Object.keys(calls[0].values!).sort()).toEqual(['phone', 'updated_at']);
  });
  it('says so when there is nothing to update', async () => {
    const { ctx } = fakeClient({ data: contact, error: null });
    expect(await updateContact(ctx, { id: ID })).toEqual({ ok: false, error: 'Nothing to update.' });
  });
  it('says the contact is gone when no row comes back', async () => {
    const { ctx } = fakeClient({ data: null, error: null });
    expect(await updateContact(ctx, { id: ID, name: 'New name' })).toEqual({ ok: false, error: 'That contact no longer exists.' });
    expect(await setContactActive(ctx, { id: ID, active: false })).toEqual({ ok: false, error: 'That contact no longer exists.' });
    expect(await deleteContact(ctx, { id: ID })).toEqual({ ok: false, error: 'That contact no longer exists.' });
  });
  it('explains a delete refused because documents use the contact', async () => {
    const { ctx } = fakeClient({ data: null, error: { code: '23503' } });
    expect(await deleteContact(ctx, { id: ID })).toEqual({
      ok: false,
      error: 'This contact is used on bills or other documents. Archive it instead.',
    });
  });
  it('explains the database refusing a contact with no role', async () => {
    const { ctx } = fakeClient({ data: null, error: { code: '23514' } });
    expect(await updateContact(ctx, { id: ID, name: 'X' })).toEqual({ ok: false, error: 'Tick Customer, Supplier or both.' });
  });
  it('hides any other database error behind a general message and logs it', async () => {
    const { ctx } = fakeClient({ data: null, error: { code: 'XX000', message: 'boom' } });
    expect(await createContact(ctx, { name: 'A', is_customer: true, is_supplier: false })).toEqual({
      ok: false,
      error: 'That change could not be saved. Please try again.',
    });
    expect(logged).toHaveBeenCalled();
  });
});

describe('contactsView', () => {
  const customer: FinanceContact = { ...contact, id: 'c1', name: 'Aisyah Trading', is_customer: true, is_supplier: false };
  const archived: FinanceContact = { ...contact, id: 's2', name: 'Old Supplier', active: false };
  const bills = [
    { supplier_id: ID, balance: 2243.6, display_status: 'pending' },
    { supplier_id: ID, balance: 100, display_status: 'overdue' },
    { supplier_id: ID, balance: 780.4, display_status: 'draft' },
    { supplier_id: ID, balance: 0, display_status: 'paid' },
    { supplier_id: 's2', balance: 50, display_status: 'pending' },
  ];

  it('counts active customers and suppliers, and sums open payables only', () => {
    const view = contactsView([contact, customer, archived], bills);
    expect(view.stats).toEqual({ customers: 1, suppliers: 1, receivable: 0, payable: 2393.6 });
  });
  it('gives each contact its payable, including an archived one', () => {
    const view = contactsView([contact, customer, archived], bills);
    const byId = Object.fromEntries(view.rows.map((r) => [r.id, r.payable]));
    expect(byId).toEqual({ [ID]: 2343.6, c1: 0, s2: 50 });
  });
  it('lists the largest balances first and leaves out zero balances', () => {
    const view = contactsView([contact, customer, archived], bills);
    expect(view.topBalances).toEqual([
      { label: 'Lim Hardware Sdn Bhd', balance: 2343.6 },
      { label: 'Old Supplier', balance: 50 },
    ]);
  });
  it('sorts rows by name', () => {
    const view = contactsView([contact, customer, archived], []);
    expect(view.rows.map((r) => r.name)).toEqual(['Aisyah Trading', 'Lim Hardware Sdn Bhd', 'Old Supplier']);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run tests/finance-contacts.test.ts`
Expected: FAIL with "Failed to resolve import '@/lib/finance/result'".

- [ ] **Step 3: Write `src/lib/finance/result.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

/** Who is writing: the caller's own client (so RLS applies) and their workspace. */
export type FinanceWriteContext = { client: SupabaseClient; orgId: string };

export type FinResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const PG_UNIQUE = '23505';
export const PG_FOREIGN_KEY = '23503';
export const PG_CHECK = '23514';

export const WRITE_FAILED = 'That change could not be saved. Please try again.';

export function pgCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/** Logs the database error for triage; the person only ever sees the general message. */
export function writeFailed(fnName: string, error: unknown): { ok: false; error: string } {
  console.error(`[finance] ${fnName} failed:`, error);
  return { ok: false, error: WRITE_FAILED };
}
```

- [ ] **Step 4: Write `src/lib/finance/contacts.ts`**

```ts
/**
 * Finance contacts: the customers and suppliers on invoices, bills and
 * payments. One Zod schema and one function per write; org_id always comes
 * from the FinanceWriteContext, never from the input.
 */
import { z } from 'zod';
import {
  type FinResult,
  type FinanceWriteContext,
  PG_CHECK,
  PG_FOREIGN_KEY,
  pgCode,
  writeFailed,
} from './result';

export type FinanceContact = {
  id: string;
  name: string;
  is_customer: boolean;
  is_supplier: boolean;
  email: string | null;
  phone: string | null;
  ssm_no: string | null;
  tin: string | null;
  payment_terms_days: number;
  active: boolean;
};

export const CONTACT_COLUMNS =
  'id,name,is_customer,is_supplier,email,phone,ssm_no,tin,payment_terms_days,active';

export const CONTACT_NAME_MAX = 160;
/** Contacts loaded for the screen; the footer says so when there are more. */
export const CONTACT_LIMIT = 1000;

export const CONTACT_MESSAGES = {
  name: 'Enter the contact’s name.',
  nameTooLong: `Keep the name to ${CONTACT_NAME_MAX} characters or fewer.`,
  role: 'Tick Customer, Supplier or both.',
  email: 'Enter a valid email address, or leave it empty.',
  tooLong: 'That is too long. Keep it to 80 characters or fewer.',
  terms: 'Payment terms must be between 0 and 365 days.',
  gone: 'That contact no longer exists.',
  inUse: 'This contact is used on bills or other documents. Archive it instead.',
} as const;

const M = CONTACT_MESSAGES;

const name = z.string({ error: M.name }).trim().min(1, M.name).max(CONTACT_NAME_MAX, M.nameTooLong);
/** Optional text: trimmed, and an empty box is stored as null. */
const text = z
  .string({ error: M.tooLong })
  .trim()
  .max(80, M.tooLong)
  .transform((v) => (v === '' ? null : v))
  .nullable();
const email = z
  .string({ error: M.email })
  .trim()
  .max(160, M.email)
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), M.email)
  .transform((v) => (v === '' ? null : v))
  .nullable();
const terms = z.number({ error: M.terms }).int(M.terms).min(0, M.terms).max(365, M.terms);
const id = z.string({ error: M.gone }).uuid(M.gone);

export const createContactInput = z
  .object({
    name,
    is_customer: z.boolean({ error: M.role }),
    is_supplier: z.boolean({ error: M.role }),
    email: email.default(null),
    phone: text.default(null),
    ssm_no: text.default(null),
    tin: text.default(null),
    payment_terms_days: terms.default(30),
  })
  .refine((v) => v.is_customer || v.is_supplier, { message: M.role, path: ['is_customer'] });

export const updateContactInput = z
  .object({
    id,
    name: name.optional(),
    is_customer: z.boolean({ error: M.role }).optional(),
    is_supplier: z.boolean({ error: M.role }).optional(),
    email: email.optional(),
    phone: text.optional(),
    ssm_no: text.optional(),
    tin: text.optional(),
    payment_terms_days: terms.optional(),
  })
  // The two ticks travel together, so the rule can be checked before the database does.
  .refine((v) => (v.is_customer === undefined) === (v.is_supplier === undefined), {
    message: M.role,
    path: ['is_customer'],
  })
  .refine((v) => v.is_customer === undefined || v.is_customer || v.is_supplier, {
    message: M.role,
    path: ['is_customer'],
  });

export const setContactActiveInput = z.object({ id, active: z.boolean() });
export const deleteContactInput = z.object({ id });

function contactWriteFailed(fnName: string, error: unknown): { ok: false; error: string } {
  const code = pgCode(error);
  if (code === PG_FOREIGN_KEY) return { ok: false, error: M.inUse };
  if (code === PG_CHECK) return { ok: false, error: M.role };
  return writeFailed(fnName, error);
}

export async function listContacts(ctx: FinanceWriteContext): Promise<FinanceContact[]> {
  const { data, error } = await ctx.client
    .from('finance_contacts')
    .select(CONTACT_COLUMNS)
    .eq('org_id', ctx.orgId)
    .order('name', { ascending: true })
    .range(0, CONTACT_LIMIT - 1);
  if (error) throw error;
  return (data ?? []) as unknown as FinanceContact[];
}

export type BillBalance = { supplier_id: string; balance: number; display_status: string };

/** What is still owed on each supplier bill, for the Payable figures. */
export async function listBillBalances(ctx: FinanceWriteContext): Promise<BillBalance[]> {
  const { data, error } = await ctx.client
    .from('supplier_bill_totals')
    .select('supplier_id, balance, display_status')
    .eq('org_id', ctx.orgId)
    .in('display_status', ['pending', 'overdue']);
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, balance: Number(row.balance) })) as BillBalance[];
}

export async function createContact(
  ctx: FinanceWriteContext,
  input: z.input<typeof createContactInput>,
): Promise<FinResult<FinanceContact>> {
  const values = createContactInput.parse(input);
  const { data, error } = await ctx.client
    .from('finance_contacts')
    .insert({ ...values, org_id: ctx.orgId })
    .select(CONTACT_COLUMNS)
    .single();
  if (error || !data) return contactWriteFailed('createContact', error);
  return { ok: true, data: data as unknown as FinanceContact };
}

export async function updateContact(
  ctx: FinanceWriteContext,
  input: z.input<typeof updateContactInput>,
): Promise<FinResult<FinanceContact>> {
  const { id: contactId, ...fields } = updateContactInput.parse(input);
  if (Object.values(fields).every((v) => v === undefined)) {
    return { ok: false, error: 'Nothing to update.' };
  }
  const { data, error } = await ctx.client
    .from('finance_contacts')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('org_id', ctx.orgId)
    .select(CONTACT_COLUMNS)
    .maybeSingle();
  if (error) return contactWriteFailed('updateContact', error);
  if (!data) return { ok: false, error: M.gone };
  return { ok: true, data: data as unknown as FinanceContact };
}

/** Archive a contact (it leaves the pickers but keeps its documents), or bring it back. */
export async function setContactActive(
  ctx: FinanceWriteContext,
  input: z.input<typeof setContactActiveInput>,
): Promise<FinResult<FinanceContact>> {
  const { id: contactId, active } = setContactActiveInput.parse(input);
  const { data, error } = await ctx.client
    .from('finance_contacts')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('org_id', ctx.orgId)
    .select(CONTACT_COLUMNS)
    .maybeSingle();
  if (error) return contactWriteFailed('setContactActive', error);
  if (!data) return { ok: false, error: M.gone };
  return { ok: true, data: data as unknown as FinanceContact };
}

export async function deleteContact(
  ctx: FinanceWriteContext,
  input: z.input<typeof deleteContactInput>,
): Promise<FinResult<{ id: string }>> {
  const { id: contactId } = deleteContactInput.parse(input);
  const { data, error } = await ctx.client
    .from('finance_contacts')
    .delete()
    .eq('id', contactId)
    .eq('org_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return contactWriteFailed('deleteContact', error);
  if (!data) return { ok: false, error: M.gone };
  return { ok: true, data: { id: data.id } };
}

/* ---- what the screen shows ------------------------------------------- */

export type ContactRow = FinanceContact & { payable: number };

export type ContactsViewData = {
  stats: { customers: number; suppliers: number; receivable: number; payable: number };
  topBalances: { label: string; balance: number }[];
  rows: ContactRow[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Receivable stays 0 until invoices exist (the sales stage). Payable counts
 * bills that are pending or overdue; an archived supplier still owes what it owes.
 */
export function contactsView(contacts: FinanceContact[], bills: BillBalance[]): ContactsViewData {
  const owed = new Map<string, number>();
  for (const bill of bills) {
    if (bill.display_status !== 'pending' && bill.display_status !== 'overdue') continue;
    owed.set(bill.supplier_id, (owed.get(bill.supplier_id) ?? 0) + bill.balance);
  }
  const rows = [...contacts]
    .sort((x, y) => x.name.localeCompare(y.name))
    .map((c) => ({ ...c, payable: round2(owed.get(c.id) ?? 0) }));
  const active = rows.filter((c) => c.active);
  return {
    stats: {
      customers: active.filter((c) => c.is_customer).length,
      suppliers: active.filter((c) => c.is_supplier).length,
      receivable: 0,
      payable: round2(rows.reduce((sum, c) => sum + c.payable, 0)),
    },
    topBalances: rows
      .filter((c) => c.payable > 0)
      .sort((x, y) => y.payable - x.payable)
      .slice(0, 5)
      .map((c) => ({ label: c.name, balance: c.payable })),
    rows,
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run tests/finance-contacts.test.ts`
Expected: PASS.

Note on the stats test: `payable` is 2393.6 because the archived supplier's RM 50 is included (Review Focus 4).

- [ ] **Step 6: Type-check and commit**

Run: `pnpm exec tsc --noEmit`
Expected: no output.

```bash
git add src/lib/finance/result.ts src/lib/finance/contacts.ts tests/finance-contacts.test.ts
git commit -m "feat: finance contacts data layer with schemas, writes and the screen's figures"
```

---

### Task 3: Products data layer

**Files:**
- Create: `src/lib/finance/products.ts`
- Test: `tests/finance-products.test.ts`

**Interfaces:**
- Consumes: `FinanceWriteContext`, `FinResult`, `PG_UNIQUE`, `PG_FOREIGN_KEY`, `pgCode`, `writeFailed` from `@/lib/finance/result`.
- Produces: `type FinanceProduct`, `PRODUCT_MESSAGES`, `createProductInput`, `updateProductInput`, `setProductActiveInput`, `deleteProductInput`, `listProducts(ctx)`, `createProduct`, `updateProduct`, `setProductActive`, `deleteProduct`, `productsView(products): ProductsViewData`.

- [ ] **Step 1: Write the failing tests**

Create `tests/finance-products.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceWriteContext } from '@/lib/finance/result';
import {
  type FinanceProduct,
  createProduct,
  createProductInput,
  deleteProduct,
  productsView,
  updateProduct,
} from '@/lib/finance/products';

const ID = '22222222-2222-4222-8222-222222222222';

type Call = { table: string; op: string; values?: Record<string, unknown>; filters: Record<string, unknown> };

function fakeClient(answer: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: '', filters: {} };
      calls.push(call);
      const builder = {
        insert(values: Record<string, unknown>) { call.op = 'insert'; call.values = values; return builder; },
        update(values: Record<string, unknown>) { call.op = 'update'; call.values = values; return builder; },
        delete() { call.op = 'delete'; return builder; },
        eq(column: string, value: unknown) { call.filters[column] = value; return builder; },
        select() { return builder; },
        single: async () => answer,
        maybeSingle: async () => answer,
      };
      return builder;
    },
  };
  return { ctx: { client: client as never, orgId: 'org-1' } satisfies FinanceWriteContext, calls };
}

const product: FinanceProduct = {
  id: ID, sku: 'PRD-010', name: 'Printer Ink', type: 'product', category: 'Office supplies',
  uom: 'cartridge', price: 85, cost: 52, sst_rate: 6, active: true,
};

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => { logged = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { logged.mockRestore(); });

const first = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, value: unknown) =>
  schema.safeParse(value).error?.issues[0]?.message;

describe('product schemas', () => {
  const valid = { name: 'Printer Ink', type: 'product', price: 85 };

  it('asks for a name', () => {
    expect(first(createProductInput, { ...valid, name: '' })).toBe('Enter the item’s name.');
  });
  it('refuses a negative price or cost', () => {
    expect(first(createProductInput, { ...valid, price: -1 })).toBe('Enter a price of 0 or more.');
    expect(first(createProductInput, { ...valid, cost: -0.5 })).toBe('Enter a cost of 0 or more.');
  });
  it('keeps the SST rate between 0 and 100', () => {
    expect(first(createProductInput, { ...valid, sst_rate: 101 })).toBe('Enter an SST rate between 0 and 100.');
  });
  it('fills the defaults and turns an empty SKU into null', () => {
    expect(createProductInput.parse({ ...valid, sku: '  ' })).toMatchObject({
      sku: null, category: null, uom: 'unit', cost: 0, sst_rate: 0, type: 'product',
    });
  });
  it('rounds a price to two decimals', () => {
    expect(createProductInput.parse({ ...valid, price: 14.506 }).price).toBe(14.51);
  });
});

describe('product writes', () => {
  it('creates in the caller’s workspace', async () => {
    const { ctx, calls } = fakeClient({ data: product, error: null });
    expect(await createProduct(ctx, { name: 'Printer Ink', type: 'product', price: 85 })).toEqual({ ok: true, data: product });
    expect(calls[0]).toMatchObject({ table: 'finance_products', op: 'insert' });
    expect(calls[0].values).toMatchObject({ org_id: 'org-1', name: 'Printer Ink' });
  });
  it('explains an SKU that is already used', async () => {
    const { ctx } = fakeClient({ data: null, error: { code: '23505' } });
    expect(await createProduct(ctx, { name: 'Ink', type: 'product', price: 1, sku: 'PRD-010' })).toEqual({
      ok: false, error: 'Another product already uses that SKU.',
    });
    expect(await updateProduct(ctx, { id: ID, sku: 'PRD-010' })).toEqual({
      ok: false, error: 'Another product already uses that SKU.',
    });
  });
  it('explains a delete refused because documents use the item', async () => {
    const { ctx } = fakeClient({ data: null, error: { code: '23503' } });
    expect(await deleteProduct(ctx, { id: ID })).toEqual({
      ok: false, error: 'This item is used on bills or other documents. Archive it instead.',
    });
  });
  it('says the item is gone when no row comes back', async () => {
    const { ctx } = fakeClient({ data: null, error: null });
    expect(await updateProduct(ctx, { id: ID, name: 'New' })).toEqual({ ok: false, error: 'That item no longer exists.' });
    expect(await deleteProduct(ctx, { id: ID })).toEqual({ ok: false, error: 'That item no longer exists.' });
  });
});

describe('productsView', () => {
  const service: FinanceProduct = { ...product, id: 's1', sku: null, name: 'Consultation', type: 'service', category: 'Professional', price: 250, sst_rate: 6 };
  const untaxed: FinanceProduct = { ...product, id: 'p2', sku: null, name: 'Receipt Roll', category: null, price: 6, sst_rate: 0 };
  const archived: FinanceProduct = { ...product, id: 'p3', name: 'Old Item', price: 1000, active: false };

  it('counts and averages active items only', () => {
    const view = productsView([product, service, untaxed, archived]);
    expect(view.stats).toEqual({ items: 3, services: 1, taxable: 2, averagePrice: 113.67 });
  });
  it('counts active items per category, largest first, with a name for none', () => {
    const view = productsView([product, service, untaxed, { ...product, id: 'p4', name: 'Paper' }]);
    expect(view.byCategory).toEqual([
      { label: 'Office supplies', items: 2 },
      { label: 'Professional', items: 1 },
      { label: 'Uncategorised', items: 1 },
    ]);
  });
  it('handles no items', () => {
    expect(productsView([]).stats).toEqual({ items: 0, services: 0, taxable: 0, averagePrice: 0 });
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run tests/finance-products.test.ts`
Expected: FAIL with "Failed to resolve import '@/lib/finance/products'".

- [ ] **Step 3: Write `src/lib/finance/products.ts`**

```ts
/**
 * Finance products and services: what goes on an invoice or bill line. One Zod
 * schema and one function per write; org_id comes from the context.
 */
import { z } from 'zod';
import {
  type FinResult,
  type FinanceWriteContext,
  PG_FOREIGN_KEY,
  PG_UNIQUE,
  pgCode,
  writeFailed,
} from './result';

export type ProductType = 'product' | 'service';

export type FinanceProduct = {
  id: string;
  sku: string | null;
  name: string;
  type: ProductType;
  category: string | null;
  uom: string;
  price: number;
  cost: number;
  sst_rate: number;
  active: boolean;
};

export const PRODUCT_COLUMNS = 'id,sku,name,type,category,uom,price,cost,sst_rate,active';
export const PRODUCT_NAME_MAX = 160;
export const PRODUCT_LIMIT = 1000;

export const PRODUCT_MESSAGES = {
  name: 'Enter the item’s name.',
  nameTooLong: `Keep the name to ${PRODUCT_NAME_MAX} characters or fewer.`,
  type: 'Choose Product or Service.',
  tooLong: 'That is too long. Keep it to 60 characters or fewer.',
  price: 'Enter a price of 0 or more.',
  cost: 'Enter a cost of 0 or more.',
  sst: 'Enter an SST rate between 0 and 100.',
  skuTaken: 'Another product already uses that SKU.',
  gone: 'That item no longer exists.',
  inUse: 'This item is used on bills or other documents. Archive it instead.',
} as const;

const M = PRODUCT_MESSAGES;
const MAX_MONEY = 999_999_999_999.99;

const name = z.string({ error: M.name }).trim().min(1, M.name).max(PRODUCT_NAME_MAX, M.nameTooLong);
const text = z
  .string({ error: M.tooLong })
  .trim()
  .max(60, M.tooLong)
  .transform((v) => (v === '' ? null : v))
  .nullable();
const type = z.enum(['product', 'service'], { error: M.type });
const money = (message: string) =>
  z
    .number({ error: message })
    .min(0, message)
    .max(MAX_MONEY, message)
    .transform((v) => Math.round(v * 100) / 100);
const sst = z.number({ error: M.sst }).min(0, M.sst).max(100, M.sst);
const uom = z
  .string({ error: M.tooLong })
  .trim()
  .max(60, M.tooLong)
  .transform((v) => (v === '' ? 'unit' : v));
const id = z.string({ error: M.gone }).uuid(M.gone);

export const createProductInput = z.object({
  name,
  type,
  sku: text.default(null),
  category: text.default(null),
  uom: uom.default('unit'),
  price: money(M.price),
  cost: money(M.cost).default(0),
  sst_rate: sst.default(0),
});

export const updateProductInput = z.object({
  id,
  name: name.optional(),
  type: type.optional(),
  sku: text.optional(),
  category: text.optional(),
  uom: uom.optional(),
  price: money(M.price).optional(),
  cost: money(M.cost).optional(),
  sst_rate: sst.optional(),
});

export const setProductActiveInput = z.object({ id, active: z.boolean() });
export const deleteProductInput = z.object({ id });

function productWriteFailed(fnName: string, error: unknown): { ok: false; error: string } {
  const code = pgCode(error);
  if (code === PG_UNIQUE) return { ok: false, error: M.skuTaken };
  if (code === PG_FOREIGN_KEY) return { ok: false, error: M.inUse };
  return writeFailed(fnName, error);
}

/** numeric columns arrive as strings from PostgREST. */
function toProduct(row: Record<string, unknown>): FinanceProduct {
  return {
    ...(row as unknown as FinanceProduct),
    price: Number(row.price),
    cost: Number(row.cost),
    sst_rate: Number(row.sst_rate),
  };
}

export async function listProducts(ctx: FinanceWriteContext): Promise<FinanceProduct[]> {
  const { data, error } = await ctx.client
    .from('finance_products')
    .select(PRODUCT_COLUMNS)
    .eq('org_id', ctx.orgId)
    .order('name', { ascending: true })
    .range(0, PRODUCT_LIMIT - 1);
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toProduct);
}

export async function createProduct(
  ctx: FinanceWriteContext,
  input: z.input<typeof createProductInput>,
): Promise<FinResult<FinanceProduct>> {
  const values = createProductInput.parse(input);
  const { data, error } = await ctx.client
    .from('finance_products')
    .insert({ ...values, org_id: ctx.orgId })
    .select(PRODUCT_COLUMNS)
    .single();
  if (error || !data) return productWriteFailed('createProduct', error);
  return { ok: true, data: toProduct(data as unknown as Record<string, unknown>) };
}

export async function updateProduct(
  ctx: FinanceWriteContext,
  input: z.input<typeof updateProductInput>,
): Promise<FinResult<FinanceProduct>> {
  const { id: productId, ...fields } = updateProductInput.parse(input);
  if (Object.values(fields).every((v) => v === undefined)) {
    return { ok: false, error: 'Nothing to update.' };
  }
  const { data, error } = await ctx.client
    .from('finance_products')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('org_id', ctx.orgId)
    .select(PRODUCT_COLUMNS)
    .maybeSingle();
  if (error) return productWriteFailed('updateProduct', error);
  if (!data) return { ok: false, error: M.gone };
  return { ok: true, data: toProduct(data as unknown as Record<string, unknown>) };
}

export async function setProductActive(
  ctx: FinanceWriteContext,
  input: z.input<typeof setProductActiveInput>,
): Promise<FinResult<FinanceProduct>> {
  const { id: productId, active } = setProductActiveInput.parse(input);
  const { data, error } = await ctx.client
    .from('finance_products')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('org_id', ctx.orgId)
    .select(PRODUCT_COLUMNS)
    .maybeSingle();
  if (error) return productWriteFailed('setProductActive', error);
  if (!data) return { ok: false, error: M.gone };
  return { ok: true, data: toProduct(data as unknown as Record<string, unknown>) };
}

export async function deleteProduct(
  ctx: FinanceWriteContext,
  input: z.input<typeof deleteProductInput>,
): Promise<FinResult<{ id: string }>> {
  const { id: productId } = deleteProductInput.parse(input);
  const { data, error } = await ctx.client
    .from('finance_products')
    .delete()
    .eq('id', productId)
    .eq('org_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return productWriteFailed('deleteProduct', error);
  if (!data) return { ok: false, error: M.gone };
  return { ok: true, data: { id: data.id } };
}

/* ---- what the screen shows ------------------------------------------- */

export type ProductsViewData = {
  stats: { items: number; services: number; taxable: number; averagePrice: number };
  byCategory: { label: string; items: number }[];
  rows: FinanceProduct[];
};

/** Stock and revenue are not tracked yet, so the mock-up's stock and revenue figures are not shown. */
export function productsView(products: FinanceProduct[]): ProductsViewData {
  const rows = [...products].sort((x, y) => x.name.localeCompare(y.name));
  const active = rows.filter((p) => p.active);
  const counts = new Map<string, number>();
  for (const p of active) {
    const label = p.category ?? 'Uncategorised';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const total = active.reduce((sum, p) => sum + p.price, 0);
  return {
    stats: {
      items: active.length,
      services: active.filter((p) => p.type === 'service').length,
      taxable: active.filter((p) => p.sst_rate > 0).length,
      averagePrice: active.length ? Math.round((total / active.length) * 100) / 100 : 0,
    },
    byCategory: [...counts.entries()]
      .map(([label, items]) => ({ label, items }))
      .sort((x, y) => y.items - x.items || x.label.localeCompare(y.label)),
    rows,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/finance-products.test.ts`
Expected: PASS. (Average: (85 + 250 + 6) / 3 = 113.67.)

- [ ] **Step 5: Type-check and commit**

Run: `pnpm exec tsc --noEmit`
Expected: no output.

```bash
git add src/lib/finance/products.ts tests/finance-products.test.ts
git commit -m "feat: finance products data layer with schemas, writes and the screen's figures"
```

---

### Task 4: Server actions

**Files:**
- Create: `src/app/(app)/finance/actions.ts`

**Interfaces:**
- Consumes: everything Tasks 2 and 3 produce; `getViewer` from `@/lib/auth/viewer`; `can` from `@/lib/auth/permissions`; `createClient` from `@/lib/supabase/server`.
- Produces: `createContactAction`, `updateContactAction`, `setContactActiveAction`, `deleteContactAction`, `createProductAction`, `updateProductAction`, `setProductActiveAction`, `deleteProductAction`. Each is `(input: unknown) => Promise<FinResult<…>>`.

- [ ] **Step 1: Write the file**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import type { ZodType } from 'zod';
import { can } from '@/lib/auth/permissions';
import { getViewer } from '@/lib/auth/viewer';
import {
  createContact,
  createContactInput,
  deleteContact,
  deleteContactInput,
  setContactActive,
  setContactActiveInput,
  updateContact,
  updateContactInput,
} from '@/lib/finance/contacts';
import {
  createProduct,
  createProductInput,
  deleteProduct,
  deleteProductInput,
  setProductActive,
  setProductActiveInput,
  updateProduct,
  updateProductInput,
} from '@/lib/finance/products';
import type { FinResult, FinanceWriteContext } from '@/lib/finance/result';
import { createClient } from '@/lib/supabase/server';

const FORBIDDEN: FinResult<never> = { ok: false, error: 'You do not have permission to make changes here.' };

/** A write context, or null when the viewer may not change this workspace's data. */
async function writeCtx(): Promise<FinanceWriteContext | null> {
  const viewer = await getViewer();
  if (viewer.isDemo || !can(viewer.role, 'edit-data')) return null;
  return { client: await createClient(), orgId: viewer.orgId };
}

/**
 * Guard → parse → write → refresh. A rejected input answers with the schema's
 * own message, which is written for the person filling the form in.
 */
async function run<I, O>(
  paths: string[],
  schema: ZodType<I>,
  input: unknown,
  fn: (ctx: FinanceWriteContext, parsed: I) => Promise<FinResult<O>>,
): Promise<FinResult<O>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That input was not valid.' };
  }
  const result = await fn(ctx, parsed.data);
  if (result.ok) for (const path of paths) revalidatePath(path);
  return result;
}

// Supplier names and balances show on the bills and payments screens too.
const CONTACT_PATHS = ['/finance/customers-suppliers', '/finance/supplier-bills', '/finance/payments-out'];
const PRODUCT_PATHS = ['/finance/products'];

export async function createContactAction(input: unknown) {
  return run(CONTACT_PATHS, createContactInput, input, createContact);
}
export async function updateContactAction(input: unknown) {
  return run(CONTACT_PATHS, updateContactInput, input, updateContact);
}
export async function setContactActiveAction(input: unknown) {
  return run(CONTACT_PATHS, setContactActiveInput, input, setContactActive);
}
export async function deleteContactAction(input: unknown) {
  return run(CONTACT_PATHS, deleteContactInput, input, deleteContact);
}

export async function createProductAction(input: unknown) {
  return run(PRODUCT_PATHS, createProductInput, input, createProduct);
}
export async function updateProductAction(input: unknown) {
  return run(PRODUCT_PATHS, updateProductInput, input, updateProduct);
}
export async function setProductActiveAction(input: unknown) {
  return run(PRODUCT_PATHS, setProductActiveInput, input, setProductActive);
}
export async function deleteProductAction(input: unknown) {
  return run(PRODUCT_PATHS, deleteProductInput, input, deleteProduct);
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no output. If `schema: ZodType<I>` rejects a schema whose input and output types differ (the transforms), change the parameter to `schema: ZodType<I, unknown>`; do not loosen it to `any`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/finance/actions.ts"
git commit -m "feat: finance server actions for contacts and products"
```

---

### Task 5: Shared client parts

**Files:**
- Create: `src/lib/finance/format.ts`
- Create: `src/components/finance/use-finance-action.ts`
- Create: `src/components/finance/row-menu.tsx`
- Create: `src/components/finance/confirm-row.tsx`
- Test: `tests/finance-format.test.ts`

**Interfaces:**
- Consumes: `FinResult` from `@/lib/finance/result`.
- Produces:
  - `rm(n: number): string` ("RM 1,240.00") and `rmShort(n: number): string` ("RM 12.7k") from `@/lib/finance/format`
  - `useFinanceAction(): { pending: boolean; error: string | null; run: <T>(call: () => Promise<FinResult<T>>, onDone?: (data: T) => void) => void; fail: (message: string) => void; clear: () => void }`
  - `RowMenu({ label, items }: { label: string; items: RowMenuItem[] })` with `type RowMenuItem = { label: string; icon: LucideIcon; onSelect: () => void; destructive?: boolean }`
  - `ConfirmRow({ colSpan, label, children, confirmLabel, pendingLabel, pending, error, onConfirm, onCancel })`

- [ ] **Step 0: Money formatting the browser can import**

`src/lib/finance/purchases.ts` exports `rm` and `rmShort`, but it also imports the server-side Supabase client, so a client component must not import from it. Stage 2 rewrites that file and will switch it to this one; until then the two small functions exist in both places.

Create `tests/finance-format.test.ts`:

```ts
import { expect, it } from 'vitest';
import { rm, rmShort } from '@/lib/finance/format';

it('formats ringgit with two decimals and thousands separators', () => {
  expect(rm(1240)).toBe('RM 1,240.00');
  expect(rm(0)).toBe('RM 0.00');
  expect(rm(14.5)).toBe('RM 14.50');
});

it('shortens large amounts for KPI cards', () => {
  expect(rmShort(2600)).toBe('RM 2,600');
  expect(rmShort(12700)).toBe('RM 12.7k');
  expect(rmShort(0)).toBe('RM 0');
});
```

Run: `pnpm exec vitest run tests/finance-format.test.ts`
Expected: FAIL with "Failed to resolve import '@/lib/finance/format'".

Create `src/lib/finance/format.ts`:

```ts
/** RM 1,240.00 */
export function rm(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Short money for KPI cards: RM 2,600 / RM 12.7k. */
export function rmShort(n: number) {
  return n >= 10_000
    ? `RM ${(n / 1000).toFixed(1)}k`
    : `RM ${Math.round(n).toLocaleString('en-MY')}`;
}
```

Run: `pnpm exec vitest run tests/finance-format.test.ts`
Expected: PASS.

- [ ] **Step 1: Write `use-finance-action.ts`**

```ts
'use client';

import { useCallback, useState, useTransition } from 'react';
import type { FinResult } from '@/lib/finance/result';

const FALLBACK_ERROR = 'That change could not be saved. Please try again.';

/**
 * Pending and error state for one finance action. An old message is hidden
 * while the next attempt runs, and a thrown error (the network dropped)
 * becomes the same general message as a refused write.
 */
export function useFinanceAction() {
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  const run = useCallback(
    <T,>(call: () => Promise<FinResult<T>>, onDone?: (data: T) => void) => {
      start(async () => {
        try {
          const result = await call();
          if (result.ok) {
            setFailure(null);
            onDone?.(result.data);
          } else {
            setFailure(result.error || FALLBACK_ERROR);
          }
        } catch {
          setFailure(FALLBACK_ERROR);
        }
      });
    },
    [],
  );

  return {
    pending,
    error: pending ? null : failure,
    run,
    fail: setFailure,
    clear: useCallback(() => setFailure(null), []),
  };
}
```

- [ ] **Step 2: Write `row-menu.tsx`**

```tsx
'use client';

import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type RowMenuItem = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
};

/** The "⋯" menu at the end of a table row. `label` names the row for screen readers. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${label}`}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            variant={item.destructive ? 'destructive' : undefined}
            onSelect={item.onSelect}
          >
            <item.icon />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Write `confirm-row.tsx`**

```tsx
'use client';

import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';

/** Replaces a table row while asking whether to really go ahead. Never a browser dialog. */
export function ConfirmRow({
  colSpan,
  label,
  children,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  colSpan: number;
  /** Names the question for screen readers, e.g. "Delete Lim Hardware". */
  label: string;
  /** The question itself. */
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <TableRow className="bg-destructive/5 hover:bg-destructive/5">
      <TableCell colSpan={colSpan}>
        <div
          role="group"
          aria-label={label}
          // Stays in view when the table has been scrolled sideways on a phone.
          className="sticky left-2 flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-3 py-1 whitespace-normal md:max-w-none"
        >
          <p className="min-w-48 flex-1 text-sm">{children}</p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="button" variant="destructive" size="sm" onClick={onConfirm} disabled={pending}>
            <Trash2 className="size-4" />
            {pending ? pendingLabel : confirmLabel}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending} autoFocus>
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 4: Type-check, lint and commit**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors. If `DropdownMenuItem` has no `variant` prop in `src/components/ui/dropdown-menu.tsx`, open that file and use the prop name it defines for the destructive style (`src/components/reach/lead-forms-view.tsx` line ~725 shows the working usage).

```bash
git add src/lib/finance/format.ts tests/finance-format.test.ts src/components/finance/use-finance-action.ts src/components/finance/row-menu.tsx src/components/finance/confirm-row.tsx
git commit -m "feat: shared finance client parts: action state, row menu and confirm row"
```

---

### Task 6: Customers & Suppliers goes live

**Files:**
- Create: `src/components/finance/contacts-view.tsx`
- Replace: `src/screens/finance/customers-suppliers.tsx`

**Interfaces:**
- Consumes: `ContactsViewData`, `ContactRow`, `FinanceContact`, `CONTACT_NAME_MAX`, `CONTACT_LIMIT`, `contactsView`, `listContacts`, `listBillBalances` from `@/lib/finance/contacts`; the four contact actions from Task 4; `useFinanceAction`, `RowMenu`, `ConfirmRow` from Task 5; `rm`, `rmShort` from `@/lib/finance/format`.
- Produces: `ContactsView({ view, actions })`, `type ContactActions`.

- [ ] **Step 1: Write the client view**

Create `src/components/finance/contacts-view.tsx`:

```tsx
'use client';

import { type FormEvent, useId, useState } from 'react';
import { Archive, ArchiveRestore, BarChart3, Pencil, PieChart, Plus, Search, Trash2, Users } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { BarGroup, DonutStat, type Series, type Slice } from '@/components/charts';
import { ConfirmRow } from '@/components/finance/confirm-row';
import { RowMenu } from '@/components/finance/row-menu';
import { useFinanceAction } from '@/components/finance/use-finance-action';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { NoMatchesRow } from '@/components/screen/table-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LiveDot } from '@/components/ui/live-dot';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CONTACT_LIMIT,
  CONTACT_NAME_MAX,
  type ContactRow,
  type ContactsViewData,
  type FinanceContact,
} from '@/lib/finance/contacts';
import { rm, rmShort } from '@/lib/finance/format';
import type { FinResult } from '@/lib/finance/result';
import { cn } from '@/lib/utils';

export type ContactActions = {
  create: (input: unknown) => Promise<FinResult<FinanceContact>>;
  update: (input: unknown) => Promise<FinResult<FinanceContact>>;
  setActive: (input: unknown) => Promise<FinResult<FinanceContact>>;
  remove: (input: unknown) => Promise<FinResult<{ id: string }>>;
};

const BALANCE_SERIES: Series[] = [{ key: 'balance', label: 'Open balance (RM)', color: 'var(--chart-1)' }];

type Filter = 'active' | 'customers' | 'suppliers' | 'archived';

function matches(row: ContactRow, filter: Filter) {
  if (filter === 'archived') return !row.active;
  if (!row.active) return false;
  if (filter === 'customers') return row.is_customer;
  if (filter === 'suppliers') return row.is_supplier;
  return true;
}

function roleLabel(c: { is_customer: boolean; is_supplier: boolean }) {
  if (c.is_customer && c.is_supplier) return 'Customer & supplier';
  return c.is_customer ? 'Customer' : 'Supplier';
}

export function ContactsView({ view, actions }: { view: ContactsViewData; actions?: ContactActions }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  // One thing open at a time: the add card, the edit card, or a delete question.
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [deleting, setDeleting] = useState<ContactRow | null>(null);
  const rowAction = useFinanceAction();
  const deleteAction = useFinanceAction();

  const q = query.trim().toLowerCase();
  const rows = view.rows.filter(
    (c) =>
      matches(c, filter) &&
      `${c.name} ${c.email ?? ''} ${c.ssm_no ?? ''} ${c.tin ?? ''}`.toLowerCase().includes(q),
  );
  const columns = actions ? 8 : 7;
  const exposure: Slice[] = [
    { key: 'receivable', label: 'Receivable', value: view.stats.receivable, color: 'var(--chart-1)' },
    { key: 'payable', label: 'Payable', value: view.stats.payable, color: 'var(--chart-4)' },
  ];

  const openAdd = () => {
    setEditing(null);
    setDeleting(null);
    setAdding(true);
  };
  const openEdit = (contact: ContactRow) => {
    setAdding(false);
    setDeleting(null);
    setEditing(contact);
  };
  const openDelete = (contact: ContactRow) => {
    setAdding(false);
    setEditing(null);
    deleteAction.clear();
    setDeleting(contact);
  };

  return (
    <ScreenContainer>
      <PageHeader
        title="Customers & Suppliers"
        subtitle="Your contacts for billing & procurement, Saudara."
        actions={
          <Button size="sm" onClick={actions ? openAdd : undefined} aria-expanded={actions ? adding : undefined}>
            <Plus className="size-4" />
            Add Contact
          </Button>
        }
      />

      <BentoGrid>
        {actions && (adding || editing) ? (
          <ContactFormCard
            // A different contact gets a fresh form.
            key={editing?.id ?? 'new'}
            editing={editing}
            actions={actions}
            onClose={() => {
              setAdding(false);
              setEditing(null);
            }}
          />
        ) : null}

        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat label="Customers" value={String(view.stats.customers)} onPrimary />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Suppliers" value={String(view.stats.suppliers)} />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Receivable" value={rmShort(view.stats.receivable)} delta="from invoices" deltaTone="flat" />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Payable" value={rmShort(view.stats.payable)} delta="open bills" deltaTone="flat" />
        </BentoCard>

        <BentoCard
          title="Largest open balances"
          subtitle="Suppliers you owe · RM"
          icon={BarChart3}
          className="col-span-2 md:col-span-8"
        >
          {view.topBalances.length ? (
            <BarGroup data={view.topBalances} series={BALANCE_SERIES} horizontal height={240} />
          ) : (
            <p className="grid h-60 place-items-center text-sm text-muted-foreground">No open balances.</p>
          )}
        </BentoCard>
        <BentoCard
          title="Open exposure"
          subtitle="Receivable vs payable"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={exposure}
            height={240}
            centerValue={rmShort(view.stats.receivable + view.stats.payable)}
            centerLabel="open"
          />
        </BentoCard>

        <BentoCard
          title="All contacts"
          subtitle="Customers and suppliers in this workspace"
          icon={Users}
          flush
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search contacts by name, email, SSM or TIN"
                placeholder="Search contacts…"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="w-44" aria-label="Show">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">All active</SelectItem>
                <SelectItem value="customers">Customers</SelectItem>
                <SelectItem value="suppliers">Suppliers</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            {rowAction.error ? (
              <p role="alert" className="text-sm text-destructive">
                {rowAction.error}
              </p>
            ) : null}
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>SSM No.</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                  <TableHead>Status</TableHead>
                  {actions ? <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 &&
                  (view.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                        No contacts yet.{actions ? ' Add your first customer or supplier.' : ''}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <NoMatchesRow colSpan={columns} />
                  ))}
                {rows.map((c) =>
                  actions && deleting?.id === c.id ? (
                    <ConfirmRow
                      key={c.id}
                      colSpan={columns}
                      label={`Delete ${c.name}`}
                      confirmLabel="Delete contact"
                      pendingLabel="Deleting…"
                      pending={deleteAction.pending}
                      error={deleteAction.error}
                      onConfirm={() => deleteAction.run(() => actions.remove({ id: c.id }), () => setDeleting(null))}
                      onCancel={() => setDeleting(null)}
                    >
                      Delete <span className="font-medium">{c.name}</span>? This cannot be undone. A contact
                      that is on a bill or other document cannot be deleted; archive it instead.
                    </ConfirmRow>
                  ) : (
                    <TableRow key={c.id} className={cn(!c.active && 'opacity-60')}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {c.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="whitespace-nowrap font-medium">{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="whitespace-nowrap">{roleLabel(c)}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{c.email ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {c.ssm_no ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{c.phone ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {c.is_supplier ? rm(c.payable) : '—'}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <LiveDot active={c.active} />
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              c.active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {c.active ? 'Active' : 'Archived'}
                          </span>
                        </span>
                      </TableCell>
                      {actions ? (
                        <TableCell>
                          <RowMenu
                            label={c.name}
                            items={[
                              { label: 'Edit', icon: Pencil, onSelect: () => openEdit(c) },
                              c.active
                                ? {
                                    label: 'Archive',
                                    icon: Archive,
                                    onSelect: () => rowAction.run(() => actions.setActive({ id: c.id, active: false })),
                                  }
                                : {
                                    label: 'Restore',
                                    icon: ArchiveRestore,
                                    onSelect: () => rowAction.run(() => actions.setActive({ id: c.id, active: true })),
                                  },
                              { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => openDelete(c) },
                            ]}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4 py-3 text-sm text-muted-foreground">
            Showing {rows.length} of {view.rows.length} contacts
            {view.rows.length >= CONTACT_LIMIT ? ` (the first ${CONTACT_LIMIT} by name)` : ''}
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}

function ContactFormCard({
  editing,
  actions,
  onClose,
}: {
  /** The contact being edited; null to add a new one. */
  editing: ContactRow | null;
  actions: ContactActions;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(editing?.name ?? '');
  const [isCustomer, setIsCustomer] = useState(editing?.is_customer ?? true);
  const [isSupplier, setIsSupplier] = useState(editing?.is_supplier ?? false);
  const [email, setEmail] = useState(editing?.email ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [ssm, setSsm] = useState(editing?.ssm_no ?? '');
  const [tin, setTin] = useState(editing?.tin ?? '');
  const [terms, setTerms] = useState(String(editing?.payment_terms_days ?? 30));
  const save = useFinanceAction();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    // Handled here rather than as a form action, so a refused form keeps what was typed.
    event.preventDefault();
    const days = Number(terms);
    if (terms.trim() === '' || !Number.isFinite(days)) {
      save.fail('Payment terms must be between 0 and 365 days.');
      return;
    }
    const fields = {
      name,
      is_customer: isCustomer,
      is_supplier: isSupplier,
      email,
      phone,
      ssm_no: ssm,
      tin,
      payment_terms_days: days,
    };
    save.run(
      () => (editing ? actions.update({ id: editing.id, ...fields }) : actions.create(fields)),
      onClose,
    );
  };

  return (
    <BentoCard
      title={editing ? 'Edit contact' : 'Add contact'}
      subtitle={editing ? `Changing ${editing.name}` : 'A customer, a supplier, or both'}
      icon={editing ? Users : Plus}
      className="col-span-2 md:col-span-12"
    >
      <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-12">
        <div className="space-y-1.5 md:col-span-5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={CONTACT_NAME_MAX}
            placeholder="Lim Hardware Sdn Bhd"
            autoComplete="off"
            autoFocus
            required
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <fieldset className="space-y-1.5 md:col-span-3">
          <legend className="text-sm font-medium leading-none">This contact is a</legend>
          <div className="flex h-9 items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={isCustomer}
                onChange={(e) => setIsCustomer(e.target.checked)}
              />
              Customer
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={isSupplier}
                onChange={(e) => setIsSupplier(e.target.checked)}
              />
              Supplier
            </label>
          </div>
        </fieldset>
        <div className="space-y-1.5 md:col-span-4">
          <Label htmlFor={`${id}-email`}>Email</Label>
          <Input
            id={`${id}-email`}
            type="email"
            value={email}
            placeholder="accounts@example.my"
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-phone`}>Phone</Label>
          <Input
            id={`${id}-phone`}
            type="tel"
            value={phone}
            placeholder="+60 12-345 6789"
            autoComplete="off"
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-ssm`}>SSM No.</Label>
          <Input id={`${id}-ssm`} value={ssm} placeholder="201901012345" autoComplete="off" onChange={(e) => setSsm(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-tin`}>Tax number (TIN)</Label>
          <Input id={`${id}-tin`} value={tin} placeholder="C1234567890" autoComplete="off" onChange={(e) => setTin(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-terms`}>Payment terms (days)</Label>
          <Input
            id={`${id}-terms`}
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            step={1}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-12">
          <Button type="submit" size="sm" disabled={save.pending}>
            {save.pending ? 'Saving…' : editing ? 'Save changes' : 'Add contact'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          {save.error ? (
            <p role="alert" className="text-sm text-destructive">
              {save.error}
            </p>
          ) : null}
        </div>
      </form>
    </BentoCard>
  );
}
```

- [ ] **Step 2: Replace the screen with a server loader**

Replace the whole of `src/screens/finance/customers-suppliers.tsx`:

```tsx
import {
  createContactAction,
  deleteContactAction,
  setContactActiveAction,
  updateContactAction,
} from '@/app/(app)/finance/actions';
import { type ContactActions, ContactsView } from '@/components/finance/contacts-view';
import { can } from '@/lib/auth/permissions';
import { getViewer, hasSupabaseEnv } from '@/lib/auth/viewer';
import {
  type BillBalance,
  type FinanceContact,
  contactsView,
  listBillBalances,
  listContacts,
} from '@/lib/finance/contacts';
import { createClient } from '@/lib/supabase/server';

/* ---- sample data (Rimba Ventures Sdn Bhd), shown when there is no database ---- */

const sample = (
  id: string,
  name: string,
  role: 'customer' | 'supplier',
  email: string,
  phone: string,
  ssm_no: string,
  active = true,
): FinanceContact => ({
  id,
  name,
  is_customer: role === 'customer',
  is_supplier: role === 'supplier',
  email,
  phone,
  ssm_no,
  tin: null,
  payment_terms_days: 30,
  active,
});

const SAMPLE_CONTACTS: FinanceContact[] = [
  sample('1', 'Aisyah Trading', 'customer', 'accounts@aisyahtrading.my', '+60 12-345 6789', '201901012345'),
  sample('2', 'Lim Hardware', 'supplier', 'sales@limhardware.com.my', '+60 3-7956 1234', '198701004567'),
  sample('3', 'Zaki Enterprise', 'customer', 'zaki@zakient.my', '+60 13-221 4455', '202001098765'),
  sample('4', 'Nusantara Logistics', 'supplier', 'orders@nusantara.my', '+60 3-5121 8800', '201501076543'),
  sample('5', 'Nurul Boutique', 'customer', 'hello@nurulboutique.my', '+60 11-2345 6781', '202201054321'),
  sample('6', 'Langkawi Fresh', 'supplier', 'billing@langkawifresh.my', '+60 4-966 5566', '201801033221'),
  sample('7', 'Seri Mutiara Enterprise', 'customer', 'admin@serimutiara.my', '+60 19-887 6543', '201701011223', false),
];

const SAMPLE_BILLS: BillBalance[] = [
  { supplier_id: '2', balance: 2300, display_status: 'pending' },
  { supplier_id: '4', balance: 540, display_status: 'pending' },
  { supplier_id: '6', balance: 95, display_status: 'overdue' },
];

const ACTIONS: ContactActions = {
  create: createContactAction,
  update: updateContactAction,
  setActive: setContactActiveAction,
  remove: deleteContactAction,
};

export default async function CustomersSuppliersScreen() {
  if (!hasSupabaseEnv()) {
    return <ContactsView view={contactsView(SAMPLE_CONTACTS, SAMPLE_BILLS)} />;
  }
  const viewer = await getViewer();
  const ctx = { client: await createClient(), orgId: viewer.orgId };
  const [contacts, bills] = await Promise.all([listContacts(ctx), listBillBalances(ctx)]);
  const canEdit = !viewer.isDemo && can(viewer.role, 'edit-data');
  return <ContactsView view={contactsView(contacts, bills)} actions={canEdit ? ACTIONS : undefined} />;
}
```

- [ ] **Step 3: Regenerate routes and check**

Run: `pnpm gen:routes && pnpm exec tsc --noEmit && pnpm lint`
Expected: `gen:routes` reports nothing to change for this screen (the registry key and default export are unchanged); no type or lint errors. If `viewer.orgId` is not on the `Viewer` type, open `src/lib/auth/viewer.ts` and use the field it defines for the workspace id (`src/app/(app)/reach/actions.ts` `writeCtx` shows the working usage).

- [ ] **Step 4: Check it in a browser**

Run `pnpm dev` (free the port afterwards with `lsof -ti :3000 | xargs kill`; never `pkill -f "next dev"`). Signed in as the smoke account, open `/finance/customers-suppliers` and confirm, in this order:
1. The form card is not shown until "Add Contact" is pressed.
2. Saving with both ticks cleared shows "Tick Customer, Supplier or both." and keeps what was typed.
3. Adding "Plan Test Supplier" with Supplier ticked adds a row and closes the card.
4. Edit changes the phone; Archive moves it out of "All active" and into "Archived"; Restore brings it back.
5. Delete asks in the row, and Cancel leaves the contact; Delete removes it.
6. At 390 px wide the table scrolls sideways and the page does not.
7. Dark mode has no purple.

Remove any test contact you created.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/contacts-view.tsx src/screens/finance/customers-suppliers.tsx
git commit -m "feat: Customers & Suppliers reads and writes the workspace's own contacts"
```

---

### Task 7: Products goes live

**Files:**
- Create: `src/components/finance/products-view.tsx`
- Replace: `src/screens/finance/products.tsx`

**Interfaces:**
- Consumes: `ProductsViewData`, `FinanceProduct`, `ProductType`, `PRODUCT_NAME_MAX`, `PRODUCT_LIMIT`, `productsView`, `listProducts` from `@/lib/finance/products`; the four product actions from Task 4; `useFinanceAction`, `RowMenu`, `ConfirmRow`; `rm` from `@/lib/finance/format`.
- Produces: `ProductsView({ view, actions })`, `type ProductActions`.

- [ ] **Step 1: Write the client view**

Create `src/components/finance/products-view.tsx`:

```tsx
'use client';

import { type FormEvent, useId, useState } from 'react';
import { Archive, ArchiveRestore, BarChart3, Boxes, Pencil, PieChart, Plus, Search, Trash2 } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { BarGroup, DonutStat, type Series, type Slice } from '@/components/charts';
import { ConfirmRow } from '@/components/finance/confirm-row';
import { RowMenu } from '@/components/finance/row-menu';
import { useFinanceAction } from '@/components/finance/use-finance-action';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { NoMatchesRow } from '@/components/screen/table-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  PRODUCT_LIMIT,
  PRODUCT_NAME_MAX,
  type FinanceProduct,
  type ProductType,
  type ProductsViewData,
} from '@/lib/finance/products';
import { rm } from '@/lib/finance/format';
import type { FinResult } from '@/lib/finance/result';
import { cn } from '@/lib/utils';

export type ProductActions = {
  create: (input: unknown) => Promise<FinResult<FinanceProduct>>;
  update: (input: unknown) => Promise<FinResult<FinanceProduct>>;
  setActive: (input: unknown) => Promise<FinResult<FinanceProduct>>;
  remove: (input: unknown) => Promise<FinResult<{ id: string }>>;
};

const CATEGORY_SERIES: Series[] = [{ key: 'items', label: 'Items', color: 'var(--chart-1)' }];

type Filter = 'active' | 'product' | 'service' | 'archived';

function matches(row: FinanceProduct, filter: Filter) {
  if (filter === 'archived') return !row.active;
  if (!row.active) return false;
  return filter === 'active' || row.type === filter;
}

export function ProductsView({ view, actions }: { view: ProductsViewData; actions?: ProductActions }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinanceProduct | null>(null);
  const [deleting, setDeleting] = useState<FinanceProduct | null>(null);
  const rowAction = useFinanceAction();
  const deleteAction = useFinanceAction();

  const q = query.trim().toLowerCase();
  const rows = view.rows.filter(
    (p) => matches(p, filter) && `${p.name} ${p.sku ?? ''} ${p.category ?? ''}`.toLowerCase().includes(q),
  );
  const columns = actions ? 8 : 7;
  const { items, services, taxable, averagePrice } = view.stats;
  const split: Slice[] = [
    { key: 'product', label: 'Products', value: items - services, color: 'var(--chart-1)' },
    { key: 'service', label: 'Services', value: services, color: 'var(--chart-2)' },
  ];

  return (
    <ScreenContainer>
      <PageHeader
        title="Products & Services"
        subtitle="What you sell and buy, Saudara."
        actions={
          <Button
            size="sm"
            aria-expanded={actions ? adding : undefined}
            onClick={
              actions
                ? () => {
                    setEditing(null);
                    setDeleting(null);
                    setAdding(true);
                  }
                : undefined
            }
          >
            <Plus className="size-4" />
            Add Item
          </Button>
        }
      />

      <BentoGrid>
        {actions && (adding || editing) ? (
          <ProductFormCard
            key={editing?.id ?? 'new'}
            editing={editing}
            actions={actions}
            onClose={() => {
              setAdding(false);
              setEditing(null);
            }}
          />
        ) : null}

        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat label="Items" value={String(items)} onPrimary />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Avg price" value={rm(averagePrice)} />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Taxable items" value={String(taxable)} delta="with SST" deltaTone="flat" />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Services" value={String(services)} />
        </BentoCard>

        <BentoCard
          title="Items by category"
          subtitle="Active items"
          icon={BarChart3}
          className="col-span-2 md:col-span-8"
        >
          {view.byCategory.length ? (
            <BarGroup data={view.byCategory.slice(0, 6)} series={CATEGORY_SERIES} horizontal height={240} />
          ) : (
            <p className="grid h-60 place-items-center text-sm text-muted-foreground">No items yet.</p>
          )}
        </BentoCard>
        <BentoCard
          title="Products vs services"
          subtitle="Active items"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat data={split} height={240} centerValue={String(items)} centerLabel="items" />
        </BentoCard>

        <BentoCard
          title="All items"
          subtitle="Products and services in this workspace"
          icon={Boxes}
          flush
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search items by name, SKU or category"
                placeholder="Search items…"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="w-40" aria-label="Show">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">All active</SelectItem>
                <SelectItem value="product">Products</SelectItem>
                <SelectItem value="service">Services</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            {rowAction.error ? (
              <p role="alert" className="text-sm text-destructive">
                {rowAction.error}
              </p>
            ) : null}
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>SST</TableHead>
                  <TableHead>Status</TableHead>
                  {actions ? <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 &&
                  (view.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                        No items yet.{actions ? ' Add your first product or service.' : ''}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <NoMatchesRow colSpan={columns} />
                  ))}
                {rows.map((p) =>
                  actions && deleting?.id === p.id ? (
                    <ConfirmRow
                      key={p.id}
                      colSpan={columns}
                      label={`Delete ${p.name}`}
                      confirmLabel="Delete item"
                      pendingLabel="Deleting…"
                      pending={deleteAction.pending}
                      error={deleteAction.error}
                      onConfirm={() => deleteAction.run(() => actions.remove({ id: p.id }), () => setDeleting(null))}
                      onCancel={() => setDeleting(null)}
                    >
                      Delete <span className="font-medium">{p.name}</span>? This cannot be undone. An item
                      that is on a bill or other document cannot be deleted; archive it instead.
                    </ConfirmRow>
                  ) : (
                    <TableRow key={p.id} className={cn(!p.active && 'opacity-60')}>
                      <TableCell className="whitespace-nowrap font-medium">{p.name}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {p.sku ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{p.type === 'service' ? 'Service' : 'Product'}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{p.category ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {rm(p.price)}
                        <span className="ml-1 text-xs text-muted-foreground">/ {p.uom}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{p.sst_rate > 0 ? `SST ${p.sst_rate}%` : 'None'}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            p.active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {p.active ? 'Active' : 'Archived'}
                        </span>
                      </TableCell>
                      {actions ? (
                        <TableCell>
                          <RowMenu
                            label={p.name}
                            items={[
                              {
                                label: 'Edit',
                                icon: Pencil,
                                onSelect: () => {
                                  setAdding(false);
                                  setDeleting(null);
                                  setEditing(p);
                                },
                              },
                              p.active
                                ? {
                                    label: 'Archive',
                                    icon: Archive,
                                    onSelect: () => rowAction.run(() => actions.setActive({ id: p.id, active: false })),
                                  }
                                : {
                                    label: 'Restore',
                                    icon: ArchiveRestore,
                                    onSelect: () => rowAction.run(() => actions.setActive({ id: p.id, active: true })),
                                  },
                              {
                                label: 'Delete',
                                icon: Trash2,
                                destructive: true,
                                onSelect: () => {
                                  setAdding(false);
                                  setEditing(null);
                                  deleteAction.clear();
                                  setDeleting(p);
                                },
                              },
                            ]}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4 py-3 text-sm text-muted-foreground">
            Showing {rows.length} of {view.rows.length} items
            {view.rows.length >= PRODUCT_LIMIT ? ` (the first ${PRODUCT_LIMIT} by name)` : ''}
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}

/** A typed amount as a number, or null when it is empty or not a number. */
function amount(value: string): number | null {
  const n = Number(value);
  return value.trim() === '' || !Number.isFinite(n) ? null : n;
}

function ProductFormCard({
  editing,
  actions,
  onClose,
}: {
  editing: FinanceProduct | null;
  actions: ProductActions;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<ProductType>(editing?.type ?? 'product');
  const [sku, setSku] = useState(editing?.sku ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [uom, setUom] = useState(editing?.uom ?? 'unit');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [cost, setCost] = useState(editing ? String(editing.cost) : '');
  const [sst, setSst] = useState(editing ? String(editing.sst_rate) : '0');
  const save = useFinanceAction();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const priceValue = amount(price);
    if (priceValue === null) {
      save.fail('Enter a price of 0 or more.');
      return;
    }
    const costValue = cost.trim() === '' ? 0 : amount(cost);
    if (costValue === null) {
      save.fail('Enter a cost of 0 or more.');
      return;
    }
    const sstValue = sst.trim() === '' ? 0 : amount(sst);
    if (sstValue === null) {
      save.fail('Enter an SST rate between 0 and 100.');
      return;
    }
    const fields = { name, type, sku, category, uom, price: priceValue, cost: costValue, sst_rate: sstValue };
    save.run(
      () => (editing ? actions.update({ id: editing.id, ...fields }) : actions.create(fields)),
      onClose,
    );
  };

  return (
    <BentoCard
      title={editing ? 'Edit item' : 'Add item'}
      subtitle={editing ? `Changing ${editing.name}` : 'A product or a service'}
      icon={editing ? Boxes : Plus}
      className="col-span-2 md:col-span-12"
    >
      <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-12">
        <div className="space-y-1.5 md:col-span-5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={PRODUCT_NAME_MAX}
            placeholder="A4 Paper (Ream)"
            autoComplete="off"
            autoFocus
            required
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={`${id}-type`}>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as ProductType)}>
            <SelectTrigger id={`${id}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="product">Product</SelectItem>
              <SelectItem value="service">Service</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={`${id}-sku`}>SKU</Label>
          <Input id={`${id}-sku`} value={sku} placeholder="PRD-011" autoComplete="off" className="font-mono" onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-category`}>Category</Label>
          <Input id={`${id}-category`} value={category} placeholder="Office supplies" autoComplete="off" onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-price`}>Selling price (RM)</Label>
          <Input id={`${id}-price`} type="number" inputMode="decimal" min={0} step="0.01" value={price} placeholder="0.00" required onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-cost`}>Cost (RM)</Label>
          <Input id={`${id}-cost`} type="number" inputMode="decimal" min={0} step="0.01" value={cost} placeholder="0.00" onChange={(e) => setCost(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-sst`}>SST rate (%)</Label>
          <Input id={`${id}-sst`} type="number" inputMode="decimal" min={0} max={100} step="0.01" value={sst} onChange={(e) => setSst(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-uom`}>Unit</Label>
          <Input id={`${id}-uom`} value={uom} placeholder="unit" autoComplete="off" onChange={(e) => setUom(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-12">
          <Button type="submit" size="sm" disabled={save.pending}>
            {save.pending ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          {save.error ? (
            <p role="alert" className="text-sm text-destructive">
              {save.error}
            </p>
          ) : null}
        </div>
      </form>
    </BentoCard>
  );
}
```

- [ ] **Step 2: Replace the screen with a server loader**

First read the current title and subtitle so they are kept:

Run: `grep -n "title=\|subtitle=" src/screens/finance/products.tsx | head -4`

If they differ from "Products & Services" / "What you sell and buy, Saudara.", use the existing strings in `products-view.tsx`'s `PageHeader`.

Replace the whole of `src/screens/finance/products.tsx`:

```tsx
import {
  createProductAction,
  deleteProductAction,
  setProductActiveAction,
  updateProductAction,
} from '@/app/(app)/finance/actions';
import { type ProductActions, ProductsView } from '@/components/finance/products-view';
import { can } from '@/lib/auth/permissions';
import { getViewer, hasSupabaseEnv } from '@/lib/auth/viewer';
import { type FinanceProduct, listProducts, productsView } from '@/lib/finance/products';
import { createClient } from '@/lib/supabase/server';

/* ---- sample data (Rimba Ventures Sdn Bhd), shown when there is no database ---- */

const sample = (
  id: string,
  name: string,
  sku: string,
  type: 'product' | 'service',
  category: string,
  price: number,
  sst_rate: number,
  active = true,
): FinanceProduct => ({ id, name, sku, type, category, uom: type === 'service' ? 'job' : 'unit', price, cost: 0, sst_rate, active });

const SAMPLE_PRODUCTS: FinanceProduct[] = [
  sample('1', 'Consultation — 1hr', 'SRV-001', 'service', 'Professional', 250, 6),
  sample('2', 'Website Package', 'SRV-002', 'service', 'Professional', 3500, 6),
  sample('3', 'Monthly Bookkeeping', 'SRV-003', 'service', 'Professional', 600, 6),
  sample('4', 'Printer Ink', 'PRD-010', 'product', 'Office supplies', 85, 6),
  sample('5', 'A4 Paper (Ream)', 'PRD-011', 'product', 'Office supplies', 14.5, 6),
  sample('6', 'Thermal Receipt Roll', 'PRD-012', 'product', 'Consumables', 6, 0),
  sample('7', 'Logo Design', 'SRV-004', 'service', 'Professional', 450, 6, false),
];

const ACTIONS: ProductActions = {
  create: createProductAction,
  update: updateProductAction,
  setActive: setProductActiveAction,
  remove: deleteProductAction,
};

export default async function ProductsScreen() {
  if (!hasSupabaseEnv()) {
    return <ProductsView view={productsView(SAMPLE_PRODUCTS)} />;
  }
  const viewer = await getViewer();
  const ctx = { client: await createClient(), orgId: viewer.orgId };
  const products = await listProducts(ctx);
  const canEdit = !viewer.isDemo && can(viewer.role, 'edit-data');
  return <ProductsView view={productsView(products)} actions={canEdit ? ACTIONS : undefined} />;
}
```

- [ ] **Step 3: Regenerate routes and check**

Run: `pnpm gen:routes && pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Check it in a browser**

With `pnpm dev`, signed in as the smoke account, open `/finance/products` and confirm:
1. The form card is closed until "Add Item" is pressed.
2. Saving with an empty price shows "Enter a price of 0 or more." and keeps what was typed.
3. Adding "Plan Test Item", SKU `PLAN-1`, price 12.50 adds a row showing "RM 12.50 / unit".
4. Adding a second item with SKU `PLAN-1` shows "Another product already uses that SKU."
5. Edit, Archive, Restore and Delete behave as on Customers & Suppliers.
6. 390 px width and dark mode are fine; no purple.

Remove the test items. Stop the dev server with `lsof -ti :3000 | xargs kill`.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/products-view.tsx src/screens/finance/products.tsx
git commit -m "feat: Products reads and writes the workspace's own items"
```

---

### Task 8: Mark the screens live, document, and verify the branch

**Files:**
- Modify: `src/config/live-screens.ts`
- Create: `docs/bendahara-backend.md`

**Interfaces:**
- Consumes: the `LIVE_SCREENS` set.

- [ ] **Step 1: Add the two screens to the live list**

In `src/config/live-screens.ts`, replace the Bendahara block:

```ts
  // Bendahara: these two read the workspace's own bills and payments. There is
  // no form to add them yet.
  'finance/supplier-bills',
  'finance/payments-out',
```

with:

```ts
  // Bendahara. Supplier Bills and Payments Out read the workspace's own data
  // but have no form to add to them yet.
  'finance/customers-suppliers',
  'finance/products',
  'finance/supplier-bills',
  'finance/payments-out',
```

- [ ] **Step 2: Run the guard tests**

Run: `pnpm exec vitest run tests/live-screens.test.ts tests/screen-routes.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the backend note**

Create `docs/bendahara-backend.md`:

```markdown
# Bendahara backend

How the finance screens read and write. Design:
`docs/superpowers/specs/2026-10-10-bendahara-crud-design.md`.

## Write path

Each write is one Zod schema and one function in `src/lib/finance/`, taking a
`FinanceWriteContext` (`{ client, orgId }`) and returning a `FinResult`. The
server actions in `src/app/(app)/finance/actions.ts` check the viewer may edit,
parse the input with that schema, call the function and revalidate the screens
that show the data. `org_id` never comes from the browser.

A screen file under `src/screens/finance/` is an async server component: it
loads the rows, builds the figures with a pure `…View` function, and passes the
client view its actions only when the viewer can edit. With no Supabase
environment it shows sample data and no actions.

## Tables

All finance tables carry `org_id`, use composite `(org_id, id)` foreign keys,
and have member-read, writer-write RLS with the restrictive `mfa_required`
policy.

| Table | Holds |
|---|---|
| `finance_contacts` | Customers and suppliers. `is_customer` and `is_supplier` can both be true. |
| `finance_products` | Products and services for document lines. |
| `finance_accounts` | Bank and cash accounts. No screen yet. |
| `finance_categories` | Expense and income categories. Every workspace starts with nine. No screen yet. |
| `finance_sequences` | The next document number per type. |
| `supplier_bills`, `supplier_bill_lines`, `payments_out` | Purchases, read-only so far. |

## Document numbers

`select public.finance_next_number(org, 'invoice')` returns the next number
(`INV-0001`) and moves the counter on. It locks the workspace's row for that
type, so simultaneous callers never get the same number. Types: `invoice`,
`quotation`, `credit_note`, `bill`, `receipt`, `voucher`. Call it from inside
the database function that posts a document, so a failed post does not use up a
number.

## Known limits

- Contacts and products load the first 1,000 by name; search is in the browser.
- Receivable is 0 until invoices exist.
- Stock and revenue per item are not tracked.
- A contact's Payable counts bills that are pending or overdue.
```

- [ ] **Step 4: Run everything**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`
Expected: no type or lint errors; every test passes (the count grows by the tests added in Tasks 1 to 3); the build completes.

- [ ] **Step 5: Check for banned colours and names in the diff**

Run: `git diff origin/main...HEAD -- src | grep -n -i -E "^\+.*(purple|violet|fuchsia|indigo|kuasa\.ai)"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/config/live-screens.ts docs/bendahara-backend.md
git commit -m "docs: describe the finance write path; mark Customers & Suppliers and Products as live"
```

- [ ] **Step 7: Hand back**

Do not push or open a pull request. Report: what was built, the test count, what was checked in a browser, and that the migration is already applied to the hosted database. The owner decides when to push, merge and smoke-test on production.

---

## Self-review notes

- Spec coverage for stage 1: contacts change (Task 1), accounts, categories, numbering (Task 1), shared form parts (Task 5), Customers & Suppliers live (Tasks 2, 4, 6), Products live (Tasks 3, 4, 7). Accounts and categories get tables here and screens in stages 6 and 5, as the spec places them.
- The mock-ups' "Statements" and "Filter" buttons on Customers & Suppliers, and the stock column and revenue chart on Products, are not carried over: nothing in the spec backs them. Export is added with the document screens in stage 2.
- Sparklines and deltas are dropped from live KPI cards, as Supplier Bills already does: there is no history to draw.
