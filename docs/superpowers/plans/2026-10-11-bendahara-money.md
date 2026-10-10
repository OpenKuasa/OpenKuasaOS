# Bendahara Money Table Implementation Plan (stage 2a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage 2a of the Bendahara CRUD spec: one table for every movement of money, the database rules that lock a posted document, the existing bill payments moved into it, and the data layer the bill and payment forms will call. The two live screens keep working, read-only, on the new tables.

**Architecture:** Two migrations. The first is additive: it creates `finance_transactions` and `finance_allocations`, copies `payments_out` into them, repoints the `supplier_bill_totals` view, and adds guard triggers and the database functions that save, post and pay in one transaction. Production keeps running the old code against it. The second, applied after this code is deployed, drops `payments_out`. TypeScript follows stage 1: one Zod schema and one function per write in `src/lib/finance/`, returning `FinResult`.

**Tech Stack:** Supabase Postgres (RLS, plpgsql), Zod 4, Vitest, Next.js 16, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-10-bendahara-crud-design.md`, build-order item 2. This plan is the first half (database and data layer). The second half (the bill form with line items, the payment form, CSV export, "View all", the error page) gets its own plan after this merges. Backend notes: `docs/bendahara-backend.md`.

## Global Constraints

- New tables are prefixed `finance_`, carry `org_id`, use composite `(org_id, id)` foreign keys, `numeric(14,2)` ringgit, `created_at` and `updated_at`.
- Every table: select for `private.is_org_member(org_id)`, writes for `private.is_org_writer(org_id)`, the restrictive `mfa_required` policy, `revoke all … from anon, authenticated` then explicit grants to `authenticated`. Views are `security_invoker = true` with select granted to `authenticated` only.
- Database functions callable by the app are `security invoker` with `set search_path = ''` and every name schema-qualified; execute is revoked from `public` and `anon`.
- `org_id` always comes from the server-side context, never from client input.
- One Zod schema per write; messages are sentences a person can act on. Every schema's transforms must be idempotent (parsing its own output returns the same value), because the server action parses and the write function parses again.
- A posted document cannot be edited or deleted, only voided. A draft has no number; the number is given when it is posted.
- pnpm only. 2-space indent, single quotes, semicolons, named exports.
- `src/lib/finance/*.ts` files that client components import from (`contacts.ts`, `products.ts`, `result.ts`, `format.ts`, and the new `bills.ts`, `money.ts`) must not import `@/lib/supabase/server` or `next/*`.
- No purple, violet, indigo or fuchsia. No Kuasa names in `src/`.
- Branch `feat-089-bendahara-money`; PR title equals the branch name; re-check `git branch -r` for a number clash before pushing. Do not push or merge until asked.
- The hosted database is shared with production. Implementers never call a database tool. The controller dry-runs each migration inside a rolled-back transaction and applies it only with the owner's go-ahead.
- **Order is fixed:** apply migration 1 → merge and deploy this branch → apply migration 2. Production's current code reads `payments_out`; dropping it before the deploy breaks Payments Out.

## Decisions this plan makes (flag to the owner at handoff)

1. **Every workspace gets two accounts, "Main Bank" and "Cash in hand".** A payment must leave an account, and the screen that manages accounts (Banking) is stage 6. Existing payments are attached to Main Bank, or Cash in hand when the method was cash.
2. **Approval is not enforced yet.** The table has the approval columns and statuses, but any editor's bill payment posts directly, as today. The owner/admin approval rule arrives with Payment Vouchers and Expenses in stage 5.
3. **A paid payment is voided, not deleted.** The spec lists "delete" for Payments Out and also says posted documents are locked. This plan reads those together: a scheduled payment can be edited or deleted; a paid one can only be voided, which frees the bill's balance.
4. **One payment pays bills from one supplier.** It can be split across several of that supplier's bills.
5. **A payment cannot exceed what is still owed on a bill,** counting scheduled payments too, so a bill cannot be scheduled twice.
6. **Existing numbers are kept.** Old payments keep `PAY-0119`; new ones are `PV-0001`. Each workspace's bill counter starts after its highest existing `BILL-` number.

## Review Focus

1. Two people paying the same bill in full at the same moment: exactly one succeeds; the other is told the amount is more than is owed. (Task 1 database test.)
2. Deleting a workspace that has posted bills and payments still works: the guards step aside when the workspace itself is going. (Controller's dry run, Task 1 step 7.)
3. A scheduled payment counts against what can still be paid, and voiding or deleting it frees that amount. (Task 1 database test.)
4. A bill that already has payments cannot be voided; after the payments are voided it can. (Task 1 database test.)
5. Existing data that breaks the new rules (a payment against a draft bill, an overpaid test bill) does not stop the migration: the guards are created after the copy. (Controller's dry run.)

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261013100000_bendahara_money.sql` | Default accounts, transactions, allocations, data copy, views, guards, functions |
| `supabase/migrations/20261013100100_bendahara_drop_payments_out.sql` | Drops `payments_out`; applied after deploy |
| `tests/bendahara-purchases.test.ts` | Replaced: bills, payments and guards against the hosted database |
| `tests/bendahara-foundation.rls.test.ts` | Adds viewer-cannot-write on categories and sequences |
| `src/lib/finance/bills.ts` | Bill schemas, reads, writes |
| `src/lib/finance/money.ts` | Payment schemas, reads, writes; accounts read |
| `tests/finance-bills.test.ts`, `tests/finance-money.test.ts` | Unit tests |
| `tests/finance-schemas.test.ts` | Every finance schema parses its own output unchanged |
| `src/lib/finance/purchases.ts` | Reads payments from the new view; money formatting from `format.ts` |
| `src/lib/finance/contacts.ts` | Message for unticking Supplier on a contact with bills |
| `docs/bendahara-backend.md` | Money model, guards, functions, error codes |

## Database error codes

Raised by the guards and functions with these SQLSTATEs; the data layer turns each into a sentence.

| Code | Meaning |
|---|---|
| `FIN01` | The bill is posted or void and cannot be changed or deleted |
| `FIN02` | The bill has payments, so it cannot be voided |
| `FIN03` | The allocations add up to more than the payment |
| `FIN04` | A payment can only go against a posted bill |
| `FIN05` | The amount is more than is still owed on the bill |
| `FIN06` | The bills on one payment belong to different suppliers, or none was found |
| `FIN07` | The contact has bills, so Supplier cannot be unticked |
| `FIN09` | The payment is posted or void and cannot be changed or deleted |
| `FIN10` | The bill has no lines, or its lines total nothing |
| `FIN11` | The bill or payment no longer exists |

---

### Task 1: Migrations and database tests

**Files:**
- Create: `supabase/migrations/20261013100000_bendahara_money.sql`
- Create: `supabase/migrations/20261013100100_bendahara_drop_payments_out.sql`
- Replace: `tests/bendahara-purchases.test.ts`
- Modify: `tests/bendahara-foundation.rls.test.ts` (one test extended)

**Interfaces:**
- Produces tables `finance_transactions`, `finance_allocations`; views `supplier_bill_totals` (now with `posted_at`; `paid` from allocations) and `finance_payments_out`; columns `supplier_bills.posted_at`, nullable `supplier_bills.bill_no`.
- Produces functions:
  - `public.finance_save_bill(target_org uuid, bill jsonb, lines jsonb) returns uuid`
  - `public.finance_post_bill(target_org uuid, target_bill uuid) returns text`
  - `public.finance_record_payment_out(target_org uuid, payment jsonb, allocations jsonb) returns uuid`
  - `public.finance_mark_payment_paid(target_org uuid, target_txn uuid, paid_on date) returns text`

**The implementer writes the files and commits. It does not run steps 7 to 9; those are the controller's.**

- [ ] **Step 1: Check the timestamps are free**

Run: `ls supabase/migrations | tail -3`
Expected: the newest file sorts before `20261013100000`. If not, use later timestamps everywhere this plan names the two files.

- [ ] **Step 2: Replace the purchases database test**

Replace the whole of `tests/bendahara-purchases.test.ts`:

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

type Org = { c: SupabaseClient; orgId: string; bank: string; cash: string; supplier: string };

async function anonUserWithOrg(orgName: string): Promise<Org> {
  const c = client();
  const { error: authErr } = await c.auth.signInAnonymously();
  expect(authErr, authErr?.message).toBeNull();
  const { data: orgId, error } = await c.rpc('create_org_for_current_user', { org_name: orgName });
  expect(error, error?.message).toBeNull();
  const { data: accounts } = await c.from('finance_accounts').select('id, name').eq('org_id', orgId);
  const bank = accounts?.find((a) => a.name === 'Main Bank')?.id as string;
  const cash = accounts?.find((a) => a.name === 'Cash in hand')?.id as string;
  const { data: supplier, error: supplierErr } = await c
    .from('finance_contacts')
    .insert({ org_id: orgId, name: `Supplier of ${orgName}`, is_supplier: true })
    .select('id')
    .single();
  expect(supplierErr, supplierErr?.message).toBeNull();
  return { c, orgId: orgId as string, bank, cash, supplier: supplier!.id as string };
}

function daysFromToday(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const GLOVES = { description: 'Gloves', quantity: 10, unit_price: 12.5, sst_rate: 6 }; // 125.00 + 7.50 SST = 132.50

async function saveBill(o: Org, lines: object[] = [GLOVES], extra: object = {}) {
  return o.c.rpc('finance_save_bill', {
    target_org: o.orgId,
    bill: { supplier_id: o.supplier, bill_date: daysFromToday(0), due_date: daysFromToday(30), ...extra },
    lines,
  });
}

/** A posted bill of RM 132.50. */
async function postedBill(o: Org) {
  const saved = await saveBill(o);
  expect(saved.error, saved.error?.message).toBeNull();
  const posted = await o.c.rpc('finance_post_bill', { target_org: o.orgId, target_bill: saved.data });
  expect(posted.error, posted.error?.message).toBeNull();
  return { id: saved.data as string, billNo: posted.data as string };
}

function pay(o: Org, allocations: { bill_id: string; amount: number }[], status: 'posted' | 'scheduled' = 'posted') {
  return o.c.rpc('finance_record_payment_out', {
    target_org: o.orgId,
    payment: { account_id: o.bank, txn_date: daysFromToday(0), method: 'fpx', status },
    allocations,
  });
}

async function totals(c: SupabaseClient, billId: string) {
  const { data, error } = await c
    .from('supplier_bill_totals')
    .select('bill_no, total, paid, balance, display_status')
    .eq('id', billId)
    .single();
  expect(error, error?.message).toBeNull();
  return data!;
}

let a: Org;
let b: Org;

beforeAll(async () => {
  if (!hasSupabaseEnv) return;
  a = await anonUserWithOrg('Purchases A Sdn Bhd');
  b = await anonUserWithOrg('Purchases B Sdn Bhd');
});

testWithSupabase('a new workspace has a bank account and a cash account', () => {
  expect(a.bank).toBeTruthy();
  expect(a.cash).toBeTruthy();
});

testWithSupabase('a draft bill has no number, and saving it again replaces its lines', async () => {
  const saved = await saveBill(a);
  expect(saved.error, saved.error?.message).toBeNull();
  expect(await totals(a.c, saved.data)).toEqual({
    bill_no: null, total: 132.5, paid: 0, balance: 132.5, display_status: 'draft',
  });

  const again = await a.c.rpc('finance_save_bill', {
    target_org: a.orgId,
    bill: { id: saved.data, supplier_id: a.supplier, bill_date: daysFromToday(0), due_date: daysFromToday(14), notes: 'Changed' },
    lines: [{ description: 'Masks', quantity: 2, unit_price: 5 }],
  });
  expect(again.error, again.error?.message).toBeNull();
  expect(again.data).toBe(saved.data);
  expect(await totals(a.c, saved.data)).toMatchObject({ total: 10, display_status: 'draft' });
  const { data: lines } = await a.c.from('supplier_bill_lines').select('description').eq('bill_id', saved.data);
  expect(lines).toEqual([{ description: 'Masks' }]);

  const { error } = await a.c.from('supplier_bills').delete().eq('id', saved.data);
  expect(error, error?.message).toBeNull();
});

testWithSupabase('a bill needs a line before it can be saved or posted', async () => {
  const none = await saveBill(a, []);
  expect(none.error?.code).toBe('FIN10');
  const free = await saveBill(a, [{ description: 'Sample', quantity: 1, unit_price: 0 }]);
  expect(free.error, free.error?.message).toBeNull();
  const posted = await a.c.rpc('finance_post_bill', { target_org: a.orgId, target_bill: free.data });
  expect(posted.error?.code).toBe('FIN10');
});

testWithSupabase('posting gives the bill the next number and it becomes payable', async () => {
  const first = await postedBill(a);
  const second = await postedBill(a);
  expect(first.billNo).toBe('BILL-0001');
  expect(second.billNo).toBe('BILL-0002');
  expect(await totals(a.c, first.id)).toEqual({
    bill_no: 'BILL-0001', total: 132.5, paid: 0, balance: 132.5, display_status: 'pending',
  });
});

testWithSupabase('a posted bill cannot be edited, re-saved, given lines or deleted', async () => {
  const bill = await postedBill(a);
  const edit = await a.c.from('supplier_bills').update({ notes: 'Sneaky' }).eq('id', bill.id);
  expect(edit.error?.code).toBe('FIN01');
  const resave = await a.c.rpc('finance_save_bill', {
    target_org: a.orgId,
    bill: { id: bill.id, supplier_id: a.supplier, bill_date: daysFromToday(0), due_date: daysFromToday(30) },
    lines: [GLOVES],
  });
  expect(resave.error?.code).toBe('FIN01');
  const line = await a.c
    .from('supplier_bill_lines')
    .insert({ org_id: a.orgId, bill_id: bill.id, description: 'Extra', quantity: 1, unit_price: 1 });
  expect(line.error?.code).toBe('FIN01');
  const remove = await a.c.from('supplier_bills').delete().eq('id', bill.id);
  expect(remove.error?.code).toBe('FIN01');
  const again = await a.c.rpc('finance_post_bill', { target_org: a.orgId, target_bill: bill.id });
  expect(again.error?.code).toBe('FIN01');
});

testWithSupabase('a paid payment reduces the balance; a scheduled one does not until it is marked paid', async () => {
  const bill = await postedBill(a);
  const paid = await pay(a, [{ bill_id: bill.id, amount: 100 }]);
  expect(paid.error, paid.error?.message).toBeNull();
  const scheduled = await pay(a, [{ bill_id: bill.id, amount: 32.5 }], 'scheduled');
  expect(scheduled.error, scheduled.error?.message).toBeNull();
  expect(await totals(a.c, bill.id)).toMatchObject({ paid: 100, balance: 32.5, display_status: 'pending' });

  const { data: rows } = await a.c
    .from('finance_payments_out')
    .select('number, amount, status, bill_no, supplier_name, account_name')
    .eq('bill_id', bill.id)
    .order('amount', { ascending: false });
  expect(rows).toEqual([
    { number: expect.stringMatching(/^PV-\d{4}$/), amount: 100, status: 'posted', bill_no: bill.billNo, supplier_name: 'Supplier of Purchases A Sdn Bhd', account_name: 'Main Bank' },
    { number: null, amount: 32.5, status: 'scheduled', bill_no: bill.billNo, supplier_name: 'Supplier of Purchases A Sdn Bhd', account_name: 'Main Bank' },
  ]);

  const marked = await a.c.rpc('finance_mark_payment_paid', {
    target_org: a.orgId, target_txn: scheduled.data, paid_on: daysFromToday(0),
  });
  expect(marked.error, marked.error?.message).toBeNull();
  expect(marked.data).toMatch(/^PV-\d{4}$/);
  expect(await totals(a.c, bill.id)).toMatchObject({ paid: 132.5, balance: 0, display_status: 'paid' });
});

testWithSupabase('a payment cannot be more than is still owed, counting scheduled payments', async () => {
  const bill = await postedBill(a);
  const over = await pay(a, [{ bill_id: bill.id, amount: 132.51 }]);
  expect(over.error?.code).toBe('FIN05');
  const scheduled = await pay(a, [{ bill_id: bill.id, amount: 100 }], 'scheduled');
  expect(scheduled.error, scheduled.error?.message).toBeNull();
  const second = await pay(a, [{ bill_id: bill.id, amount: 50 }]);
  expect(second.error?.code).toBe('FIN05');

  // Deleting the scheduled payment frees the amount.
  const removed = await a.c.from('finance_transactions').delete().eq('id', scheduled.data);
  expect(removed.error, removed.error?.message).toBeNull();
  const now = await pay(a, [{ bill_id: bill.id, amount: 50 }]);
  expect(now.error, now.error?.message).toBeNull();
});

testWithSupabase('two full payments at the same moment: only one goes through', async () => {
  const bill = await postedBill(a);
  const results = await Promise.all([
    pay(a, [{ bill_id: bill.id, amount: 132.5 }]),
    pay(a, [{ bill_id: bill.id, amount: 132.5 }]),
  ]);
  expect(results.filter((r) => r.error === null)).toHaveLength(1);
  expect(results.find((r) => r.error)?.error?.code).toBe('FIN05');
  expect(await totals(a.c, bill.id)).toMatchObject({ paid: 132.5, balance: 0, display_status: 'paid' });
});

testWithSupabase('a payment cannot go against a draft bill', async () => {
  const draft = await saveBill(a);
  const result = await pay(a, [{ bill_id: draft.data, amount: 10 }]);
  expect(result.error?.code).toBe('FIN04');
});

testWithSupabase('a paid payment cannot be edited or deleted, only voided; voiding frees the bill', async () => {
  const bill = await postedBill(a);
  const paid = await pay(a, [{ bill_id: bill.id, amount: 132.5 }]);
  const edit = await a.c.from('finance_transactions').update({ amount: 1 }).eq('id', paid.data);
  expect(edit.error?.code).toBe('FIN09');
  const remove = await a.c.from('finance_transactions').delete().eq('id', paid.data);
  expect(remove.error?.code).toBe('FIN09');
  const split = await a.c.from('finance_allocations').update({ amount: 1 }).eq('transaction_id', paid.data);
  expect(split.error?.code).toBe('FIN09');

  // A bill with payments cannot be voided.
  const voidBill = await a.c.from('supplier_bills').update({ status: 'void' }).eq('id', bill.id);
  expect(voidBill.error?.code).toBe('FIN02');

  const voidPayment = await a.c.from('finance_transactions').update({ status: 'void' }).eq('id', paid.data);
  expect(voidPayment.error, voidPayment.error?.message).toBeNull();
  expect(await totals(a.c, bill.id)).toMatchObject({ paid: 0, balance: 132.5, display_status: 'pending' });

  const voidAgain = await a.c.from('supplier_bills').update({ status: 'void' }).eq('id', bill.id);
  expect(voidAgain.error, voidAgain.error?.message).toBeNull();
  expect(await totals(a.c, bill.id)).toMatchObject({ display_status: 'void' });
});

testWithSupabase('one payment can cover two bills from one supplier, but not two suppliers', async () => {
  const first = await postedBill(a);
  const second = await postedBill(a);
  const both = await pay(a, [{ bill_id: first.id, amount: 132.5 }, { bill_id: second.id, amount: 32.5 }]);
  expect(both.error, both.error?.message).toBeNull();
  const { data: txn } = await a.c.from('finance_transactions').select('amount, contact_id, direction').eq('id', both.data).single();
  expect(txn).toEqual({ amount: 165, contact_id: a.supplier, direction: 'out' });
  expect(await totals(a.c, second.id)).toMatchObject({ paid: 32.5, balance: 100 });

  const { data: other } = await a.c
    .from('finance_contacts')
    .insert({ org_id: a.orgId, name: 'Another supplier', is_supplier: true })
    .select('id')
    .single();
  const theirs = await saveBill({ ...a, supplier: other!.id });
  await a.c.rpc('finance_post_bill', { target_org: a.orgId, target_bill: theirs.data });
  const mixed = await pay(a, [{ bill_id: second.id, amount: 10 }, { bill_id: theirs.data, amount: 10 }]);
  expect(mixed.error?.code).toBe('FIN06');
});

testWithSupabase('another workspace cannot see or touch bills, payments or allocations', async () => {
  const bill = await postedBill(a);
  const paid = await pay(a, [{ bill_id: bill.id, amount: 10 }]);

  for (const table of ['supplier_bills', 'supplier_bill_lines', 'finance_transactions', 'finance_allocations', 'supplier_bill_totals', 'finance_payments_out']) {
    const { data } = await b.c.from(table).select('org_id').eq('org_id', a.orgId);
    expect(data ?? [], table).toEqual([]);
  }

  const save = await b.c.rpc('finance_save_bill', {
    target_org: a.orgId,
    bill: { supplier_id: a.supplier, bill_date: daysFromToday(0), due_date: daysFromToday(30) },
    lines: [GLOVES],
  });
  expect(save.error?.code).toBe('42501');
  const post = await b.c.rpc('finance_post_bill', { target_org: a.orgId, target_bill: bill.id });
  expect(post.error).not.toBeNull();
  // B's own workspace, A's bill: the bill is not found there.
  const theirs = await pay(b, [{ bill_id: bill.id, amount: 10 }]);
  expect(theirs.error?.code).toBe('FIN06');
  const { data: changed } = await b.c.from('finance_transactions').update({ status: 'void' }).eq('id', paid.data).select('id');
  expect(changed ?? []).toEqual([]);
});

testWithSupabase('a supplier with bills cannot be deleted or stop being a supplier', async () => {
  await postedBill(a);
  const remove = await a.c.from('finance_contacts').delete().eq('id', a.supplier);
  expect(remove.error?.code).toBe('23503');
  const untick = await a.c.from('finance_contacts').update({ is_supplier: false, is_customer: true }).eq('id', a.supplier);
  expect(untick.error?.code).toBe('FIN07');
});

testWithSupabase('a demo viewer reads the seeded bills and payments but cannot write', async () => {
  const c = client();
  const { error: authErr } = await c.auth.signInAnonymously();
  expect(authErr, authErr?.message).toBeNull();
  const { data: demoId, error } = await c.rpc('join_demo_org');
  expect(error, error?.message).toBeNull();

  const { data: bills } = await c.from('supplier_bill_totals').select('id, supplier_id').eq('org_id', demoId);
  expect((bills ?? []).length).toBeGreaterThan(0);
  const { data: payments } = await c.from('finance_payments_out').select('number').eq('org_id', demoId);
  expect((payments ?? []).length).toBeGreaterThan(0);

  const write = await c.rpc('finance_save_bill', {
    target_org: demoId,
    bill: { supplier_id: bills![0].supplier_id, bill_date: daysFromToday(0), due_date: daysFromToday(30) },
    lines: [GLOVES],
  });
  expect(write.error?.code).toBe('42501');
  const post = await c.rpc('finance_post_bill', { target_org: demoId, target_bill: bills![0].id });
  expect(post.error).not.toBeNull();
});
```

- [ ] **Step 3: Extend the foundation viewer test**

In `tests/bendahara-foundation.rls.test.ts`, in the test 'a demo viewer cannot take a number or add an account', add before its closing `});`:

```ts
  const category = await c.from('finance_categories').insert({ org_id: demoId, name: 'Viewer', kind: 'expense' });
  expect(category.error?.code).toBe('42501');
  const sequence = await c.from('finance_sequences').insert({ org_id: demoId, doc_type: 'quotation', prefix: 'X-' });
  expect(sequence.error?.code).toBe('42501');
```

- [ ] **Step 4: See the purchases test fail**

Run: `pnpm exec vitest run tests/bendahara-purchases.test.ts`
Expected: FAIL. The second test fails because `finance_save_bill` does not exist (PGRST202). The first may pass or fail depending on whether accounts exist; either is fine.

- [ ] **Step 5: Write migration 1**

Create `supabase/migrations/20261013100000_bendahara_money.sql`:

```sql
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
```

- [ ] **Step 6: Write migration 2**

Create `supabase/migrations/20261013100100_bendahara_drop_payments_out.sql`:

```sql
-- Bendahara money, part 2 of 2. Apply only after the code that reads
-- finance_payments_out is deployed: the previous code read payments_out.
-- Its rows were copied into finance_transactions and finance_allocations by
-- part 1.
drop table public.payments_out;
```

- [ ] **Step 7 (controller): Dry-run both migrations on the hosted database**

With the `openkuasa-supabase` MCP `execute_sql`, send in one call: `begin;`, then this block, then all of migration 1, then the checks, then `rollback;`.

Before the migration:

```sql
create temp table before_totals on commit drop as
select id, paid, balance, display_status from public.supplier_bill_totals;
```

After the migration:

```sql
drop table public.payments_out;

do $$
declare
  r text;
  doomed uuid;
begin
  -- A workspace with a posted bill and a posted payment can still be deleted.
  select b.org_id into doomed
  from public.supplier_bills b
  join public.finance_allocations a on a.org_id = b.org_id and a.bill_id = b.id
  join public.finance_transactions t on t.org_id = a.org_id and t.id = a.transaction_id
  join public.orgs o on o.id = b.org_id
  where b.status = 'posted' and t.status = 'posted' and o.slug is distinct from 'rimba-ventures-demo'
  limit 1;
  if doomed is not null then
    delete from public.orgs where id = doomed;
  end if;

  select format(
    'transactions=%s allocations=%s | totals changed=%s | accounts per org=%s | policies=%s restrictive=%s | bill sequences=%s | org delete=%s',
    (select count(*) from public.finance_transactions),
    (select count(*) from public.finance_allocations),
    (select count(*) from before_totals x join public.supplier_bill_totals n on n.id = x.id
       where (n.paid, n.balance, n.display_status) is distinct from (x.paid, x.balance, x.display_status)),
    (select min(n) || '..' || max(n) from (select count(*) n from public.finance_accounts group by org_id) s),
    (select count(*) from pg_policies where schemaname = 'public' and tablename in ('finance_transactions','finance_allocations')),
    (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE' and tablename in ('finance_transactions','finance_allocations')),
    (select count(*) from public.finance_sequences where doc_type = 'bill'),
    case when doomed is null then 'no candidate' else 'ok' end)
  into r;
  raise exception 'DRYRUN OK, rolling back: %', r;
end $$;
```

Expected: an error starting `DRYRUN OK, rolling back:` with `transactions` and `allocations` both equal to the number of `payments_out` rows before (run `select count(*) from public.payments_out;` first), `totals changed=0`, `accounts per org=2..2`, `policies=10 restrictive=2`, and `org delete=ok` or `no candidate`. Then confirm nothing was left: `select to_regclass('public.finance_transactions') is null;` → `true`.

If `totals changed` is not 0, stop: the copy or the view is wrong.

- [ ] **Step 8 (controller): Apply migration 1, with the owner's go-ahead**

Stop and ask the owner first. Apply `20261013100000_bendahara_money.sql` with `apply_migration`, name `bendahara_money`. Do **not** apply migration 2 yet.

- [ ] **Step 9 (controller): Run the database tests**

Run: `pnpm exec vitest run tests/bendahara-purchases.test.ts tests/bendahara-foundation.rls.test.ts`
Expected: PASS, every test in both files.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20261013100000_bendahara_money.sql supabase/migrations/20261013100100_bendahara_drop_payments_out.sql tests/bendahara-purchases.test.ts tests/bendahara-foundation.rls.test.ts
git commit -m "feat: one money table for finance, with posted bills and payments locked in the database"
```

---

### Task 2: Bills data layer

**Files:**
- Create: `src/lib/finance/bills.ts`
- Test: `tests/finance-bills.test.ts`

**Interfaces:**
- Consumes: `FinanceWriteContext`, `FinResult`, `PG_UNIQUE`, `PG_FOREIGN_KEY`, `pgCode`, `writeFailed` from `@/lib/finance/result`.
- Produces: `BILL_MESSAGES`, `BILL_LINES_MAX`, types `BillListRow`, `BillDetail`, `BillLine`; schemas `saveBillInput`, `billIdInput`; functions `listBills(ctx)`, `getBill(ctx, id)`, `saveBill(ctx, input)`, `postBill(ctx, input)`, `voidBill(ctx, input)`, `deleteBill(ctx, input)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/finance-bills.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceWriteContext } from '@/lib/finance/result';
import { deleteBill, postBill, saveBill, saveBillInput, voidBill } from '@/lib/finance/bills';

const ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER = '44444444-4444-4444-8444-444444444444';

type Call = { kind: 'rpc' | 'table'; name: string; op?: string; args?: Record<string, unknown>; values?: Record<string, unknown>; filters: Record<string, unknown> };

/** Records rpc and table requests and answers each with the same canned result. */
function fakeClient(answer: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ kind: 'rpc', name, args, filters: {} });
      return answer;
    },
    from(name: string) {
      const call: Call = { kind: 'table', name, filters: {} };
      calls.push(call);
      const builder = {
        update(values: Record<string, unknown>) { call.op = 'update'; call.values = values; return builder; },
        delete() { call.op = 'delete'; return builder; },
        eq(column: string, value: unknown) { call.filters[column] = value; return builder; },
        select() { return builder; },
        maybeSingle: async () => answer,
      };
      return builder;
    },
  };
  return { ctx: { client: client as never, orgId: 'org-1' } satisfies FinanceWriteContext, calls };
}

const line = { description: 'Gloves', quantity: 10, unit_price: 12.5 };
const valid = { supplier_id: SUPPLIER, bill_date: '2026-10-01', due_date: '2026-10-31', lines: [line] };

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => { logged = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { logged.mockRestore(); });

const first = (value: unknown) => saveBillInput.safeParse(value).error?.issues[0]?.message;

describe('saveBillInput', () => {
  it('asks for a supplier', () => {
    expect(first({ ...valid, supplier_id: '' })).toBe('Choose a supplier.');
  });
  it('asks for real dates, with the due date not before the bill date', () => {
    expect(first({ ...valid, bill_date: '01/10/2026' })).toBe('Enter a valid date.');
    expect(first({ ...valid, bill_date: '2026-02-30' })).toBe('Enter a valid date.');
    expect(first({ ...valid, due_date: '2026-09-30' })).toBe('The due date cannot be before the bill date.');
  });
  it('asks for at least one line, and not more than 100', () => {
    expect(first({ ...valid, lines: [] })).toBe('Add at least one line.');
    expect(first({ ...valid, lines: Array.from({ length: 101 }, () => line) })).toBe('A bill can have at most 100 lines.');
  });
  it('checks each line', () => {
    expect(first({ ...valid, lines: [{ ...line, description: '  ' }] })).toBe('Describe each line.');
    expect(first({ ...valid, lines: [{ ...line, quantity: 0 }] })).toBe('Enter a quantity above 0.');
    expect(first({ ...valid, lines: [{ ...line, unit_price: -1 }] })).toBe('Enter a unit price of 0 or more.');
    expect(first({ ...valid, lines: [{ ...line, sst_rate: 101 }] })).toBe('Enter an SST rate between 0 and 100.');
  });
  it('fills the defaults, rounds quantities to 3 and prices to 4 decimals, and empties become null', () => {
    const parsed = saveBillInput.parse({
      ...valid,
      supplier_ref: '  ',
      notes: '',
      lines: [{ description: ' Gloves ', quantity: 1.23456, unit_price: 0.123456, uom: '', product_id: '' }],
    });
    expect(parsed).toMatchObject({ supplier_ref: null, notes: null });
    expect(parsed.lines[0]).toEqual({
      product_id: null, description: 'Gloves', quantity: 1.235, uom: null, pack_size: null, unit_price: 0.1235, sst_rate: 0,
    });
  });
});

describe('bill writes', () => {
  it('saves through the database function, in the caller’s workspace', async () => {
    const { ctx, calls } = fakeClient({ data: ID, error: null });
    expect(await saveBill(ctx, { ...valid, id: ID })).toEqual({ ok: true, data: { id: ID } });
    expect(calls[0]).toMatchObject({ kind: 'rpc', name: 'finance_save_bill' });
    expect(calls[0].args).toMatchObject({
      target_org: 'org-1',
      bill: { id: ID, supplier_id: SUPPLIER, bill_date: '2026-10-01', due_date: '2026-10-31' },
    });
    expect((calls[0].args!.lines as unknown[]).length).toBe(1);
  });
  it('posts and returns the number', async () => {
    const { ctx, calls } = fakeClient({ data: 'BILL-0007', error: null });
    expect(await postBill(ctx, { id: ID })).toEqual({ ok: true, data: { id: ID, bill_no: 'BILL-0007' } });
    expect(calls[0].args).toEqual({ target_org: 'org-1', target_bill: ID });
  });
  it('voids by setting the status, scoped to the workspace', async () => {
    const { ctx, calls } = fakeClient({ data: { id: ID }, error: null });
    expect(await voidBill(ctx, { id: ID })).toEqual({ ok: true, data: { id: ID } });
    expect(calls[0]).toMatchObject({ kind: 'table', name: 'supplier_bills', op: 'update' });
    expect(calls[0].values).toMatchObject({ status: 'void' });
    expect(calls[0].filters).toEqual({ id: ID, org_id: 'org-1' });
  });
  it('turns each database refusal into a sentence', async () => {
    const cases: [string, string][] = [
      ['FIN01', 'This bill is posted and can no longer be changed. Void it instead.'],
      ['FIN02', 'This bill has payments. Void or delete them before voiding it.'],
      ['FIN10', 'A bill needs at least one line with an amount.'],
      ['FIN11', 'That bill no longer exists.'],
      ['23505', 'That bill number is already used.'],
      ['23503', 'The supplier or a product on this bill no longer exists.'],
    ];
    for (const [code, message] of cases) {
      const { ctx } = fakeClient({ data: null, error: { code } });
      expect(await saveBill(ctx, valid), code).toEqual({ ok: false, error: message });
      expect(await postBill(ctx, { id: ID }), code).toEqual({ ok: false, error: message });
      expect(await voidBill(ctx, { id: ID }), code).toEqual({ ok: false, error: message });
      expect(await deleteBill(ctx, { id: ID }), code).toEqual({ ok: false, error: message });
    }
    expect(logged).not.toHaveBeenCalled();
  });
  it('says the bill is gone when void or delete touches no row', async () => {
    const { ctx } = fakeClient({ data: null, error: null });
    expect(await voidBill(ctx, { id: ID })).toEqual({ ok: false, error: 'That bill no longer exists.' });
    expect(await deleteBill(ctx, { id: ID })).toEqual({ ok: false, error: 'That bill no longer exists.' });
  });
  it('hides any other database error behind the general message and logs it', async () => {
    const { ctx } = fakeClient({ data: null, error: { code: 'XX000' } });
    expect(await saveBill(ctx, valid)).toEqual({ ok: false, error: 'That change could not be saved. Please try again.' });
    expect(logged).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run tests/finance-bills.test.ts`
Expected: FAIL with "Failed to resolve import '@/lib/finance/bills'".

- [ ] **Step 3: Write `src/lib/finance/bills.ts`**

```ts
/**
 * Supplier bills. A bill and its lines are saved by one database function, so
 * a failure cannot leave half a bill. Posting gives the bill its number and
 * locks it; after that it can only be voided. org_id comes from the context.
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

export const BILL_LINES_MAX = 100;
/** Bills loaded for a screen, a page at a time. */
export const BILL_PAGE_SIZE = 1000;

export const BILL_MESSAGES = {
  supplier: 'Choose a supplier.',
  date: 'Enter a valid date.',
  dates: 'The due date cannot be before the bill date.',
  lines: 'Add at least one line.',
  tooManyLines: `A bill can have at most ${BILL_LINES_MAX} lines.`,
  description: 'Describe each line.',
  quantity: 'Enter a quantity above 0.',
  price: 'Enter a unit price of 0 or more.',
  sst: 'Enter an SST rate between 0 and 100.',
  tooLong: 'That is too long. Keep it to 200 characters or fewer.',
  gone: 'That bill no longer exists.',
  locked: 'This bill is posted and can no longer be changed. Void it instead.',
  hasPayments: 'This bill has payments. Void or delete them before voiding it.',
  empty: 'A bill needs at least one line with an amount.',
  numberTaken: 'That bill number is already used.',
  missing: 'The supplier or a product on this bill no longer exists.',
} as const;

const M = BILL_MESSAGES;

/** YYYY-MM-DD that is a real calendar date. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const round = (places: number) => (v: number) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

const date = z.string({ error: M.date }).refine(isIsoDate, M.date);
const text = z
  .string({ error: M.tooLong })
  .trim()
  .max(200, M.tooLong)
  .transform((v) => (v === '' ? null : v))
  .nullable();
/** An id, or nothing chosen (an empty string from a select). */
const optionalId = z
  .union([z.string().uuid(), z.literal(''), z.null()])
  .transform((v) => (v === '' ? null : v));

const line = z.object({
  product_id: optionalId.default(null),
  description: z.string({ error: M.description }).trim().min(1, M.description).max(200, M.tooLong),
  quantity: z.number({ error: M.quantity }).gt(0, M.quantity).max(99_999_999, M.quantity).transform(round(3)),
  uom: text.default(null),
  pack_size: text.default(null),
  unit_price: z.number({ error: M.price }).min(0, M.price).max(999_999_999, M.price).transform(round(4)),
  sst_rate: z.number({ error: M.sst }).min(0, M.sst).max(100, M.sst).default(0),
});

export const saveBillInput = z
  .object({
    /** Present to change a draft; absent to create one. */
    id: z.string({ error: M.gone }).uuid(M.gone).optional(),
    supplier_id: z.string({ error: M.supplier }).uuid(M.supplier),
    supplier_ref: text.default(null),
    bill_date: date,
    due_date: date,
    notes: text.default(null),
    lines: z.array(line, { error: M.lines }).min(1, M.lines).max(BILL_LINES_MAX, M.tooManyLines),
  })
  .refine((v) => v.due_date >= v.bill_date, { message: M.dates, path: ['due_date'] });

export const billIdInput = z.object({ id: z.string({ error: M.gone }).uuid(M.gone) });

const REFUSALS: Record<string, string> = {
  FIN01: M.locked,
  FIN02: M.hasPayments,
  FIN10: M.empty,
  FIN11: M.gone,
  [PG_UNIQUE]: M.numberTaken,
  [PG_FOREIGN_KEY]: M.missing,
};

function billWriteFailed(fnName: string, error: unknown): { ok: false; error: string } {
  const refusal = REFUSALS[pgCode(error) ?? ''];
  return refusal ? { ok: false, error: refusal } : writeFailed(fnName, error);
}

/* ---- reads ------------------------------------------------------------ */

export type BillDisplayStatus = 'draft' | 'pending' | 'overdue' | 'paid' | 'void';

export type BillListRow = {
  id: string;
  bill_no: string | null;
  supplier_id: string;
  supplier_name: string;
  bill_date: string;
  due_date: string;
  total: number;
  paid: number;
  balance: number;
  display_status: BillDisplayStatus;
};

export type BillLine = {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  uom: string | null;
  pack_size: string | null;
  unit_price: number;
  sst_rate: number;
  amount: number;
  sst_amount: number;
};

export type BillDetail = BillListRow & { supplier_ref: string | null; notes: string | null; lines: BillLine[] };

const LIST_COLUMNS = 'id,bill_no,supplier_id,supplier_name,bill_date,due_date,total,paid,balance,display_status';

function toListRow(row: Record<string, unknown>): BillListRow {
  return {
    ...(row as unknown as BillListRow),
    total: Number(row.total),
    paid: Number(row.paid),
    balance: Number(row.balance),
  };
}

/** Every bill in the workspace, newest first, read a page at a time. */
export async function listBills(ctx: FinanceWriteContext): Promise<BillListRow[]> {
  const rows: BillListRow[] = [];
  for (let from = 0; ; from += BILL_PAGE_SIZE) {
    const { data, error } = await ctx.client
      .from('supplier_bill_totals')
      .select(LIST_COLUMNS)
      .eq('org_id', ctx.orgId)
      .order('bill_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + BILL_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page.map(toListRow));
    if (page.length < BILL_PAGE_SIZE) return rows;
  }
}

/** One bill with its lines, for the form; null when it is not in this workspace. */
export async function getBill(ctx: FinanceWriteContext, id: string): Promise<BillDetail | null> {
  const { data: bill, error } = await ctx.client
    .from('supplier_bill_totals')
    .select(`${LIST_COLUMNS},supplier_ref,notes`)
    .eq('org_id', ctx.orgId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!bill) return null;
  const { data: lines, error: linesError } = await ctx.client
    .from('supplier_bill_lines')
    .select('id,product_id,description,quantity,uom,pack_size,unit_price,sst_rate,amount,sst_amount')
    .eq('org_id', ctx.orgId)
    .eq('bill_id', id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (linesError) throw linesError;
  const header = bill as unknown as Record<string, unknown>;
  return {
    ...toListRow(header),
    supplier_ref: (header.supplier_ref as string | null) ?? null,
    notes: (header.notes as string | null) ?? null,
    lines: ((lines ?? []) as unknown as Record<string, unknown>[]).map((l) => ({
      ...(l as unknown as BillLine),
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      sst_rate: Number(l.sst_rate),
      amount: Number(l.amount),
      sst_amount: Number(l.sst_amount),
    })),
  };
}

/* ---- writes ----------------------------------------------------------- */

/** Creates a draft bill, or replaces a draft's header and lines. */
export async function saveBill(
  ctx: FinanceWriteContext,
  input: z.input<typeof saveBillInput>,
): Promise<FinResult<{ id: string }>> {
  const { lines, ...bill } = saveBillInput.parse(input);
  const { data, error } = await ctx.client.rpc('finance_save_bill', {
    target_org: ctx.orgId,
    bill,
    lines,
  });
  if (error || !data) return billWriteFailed('saveBill', error);
  return { ok: true, data: { id: data as string } };
}

/** Posts a draft: it gets its number and can no longer be edited. */
export async function postBill(
  ctx: FinanceWriteContext,
  input: z.input<typeof billIdInput>,
): Promise<FinResult<{ id: string; bill_no: string }>> {
  const { id } = billIdInput.parse(input);
  const { data, error } = await ctx.client.rpc('finance_post_bill', {
    target_org: ctx.orgId,
    target_bill: id,
  });
  if (error || !data) return billWriteFailed('postBill', error);
  return { ok: true, data: { id, bill_no: data as string } };
}

/** Voids a posted bill. Refused while it has payments. */
export async function voidBill(
  ctx: FinanceWriteContext,
  input: z.input<typeof billIdInput>,
): Promise<FinResult<{ id: string }>> {
  const { id } = billIdInput.parse(input);
  const { data, error } = await ctx.client
    .from('supplier_bills')
    .update({ status: 'void', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return billWriteFailed('voidBill', error);
  if (!data) return { ok: false, error: M.gone };
  return { ok: true, data: { id: data.id } };
}

/** Deletes a draft bill and its lines. */
export async function deleteBill(
  ctx: FinanceWriteContext,
  input: z.input<typeof billIdInput>,
): Promise<FinResult<{ id: string }>> {
  const { id } = billIdInput.parse(input);
  const { data, error } = await ctx.client
    .from('supplier_bills')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return billWriteFailed('deleteBill', error);
  if (!data) return { ok: false, error: M.gone };
  return { ok: true, data: { id: data.id } };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/finance-bills.test.ts`
Expected: PASS.

Notes for a failing run: in the refusal-loop test, `saveBill` with `{ data: null, error: { code } }` must reach `billWriteFailed`; `voidBill` and `deleteBill` see `error` first, so the "gone" branch is not taken. `1.23456` rounds to `1.235` and `0.123456` to `0.1235`.

- [ ] **Step 5: Type-check and commit**

Run: `pnpm exec tsc --noEmit` then `pnpm lint`
Expected: no errors.

```bash
git add src/lib/finance/bills.ts tests/finance-bills.test.ts
git commit -m "feat: supplier bills data layer: save a draft with its lines, post, void and delete"
```

---

### Task 3: Money data layer

**Files:**
- Create: `src/lib/finance/money.ts`
- Test: `tests/finance-money.test.ts`

**Interfaces:**
- Consumes: the `result.ts` exports; `isIsoDate` from `@/lib/finance/bills`.
- Produces: `PAYMENT_METHODS`, `PAYMENT_METHOD_LABELS`, `MONEY_MESSAGES`, types `PaymentMethod`, `PaymentOutRow`, `FinanceAccount`; schemas `recordPaymentOutInput`, `markPaymentPaidInput`, `paymentIdInput`; functions `listAccounts(ctx)`, `listPaymentsOut(ctx)`, `recordPaymentOut(ctx, input)`, `markPaymentPaid(ctx, input)`, `voidPayment(ctx, input)`, `deleteScheduledPayment(ctx, input)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/finance-money.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceWriteContext } from '@/lib/finance/result';
import {
  deleteScheduledPayment,
  markPaymentPaid,
  recordPaymentOut,
  recordPaymentOutInput,
  voidPayment,
} from '@/lib/finance/money';

const TXN = '55555555-5555-4555-8555-555555555555';
const ACCOUNT = '66666666-6666-4666-8666-666666666666';
const BILL_1 = '77777777-7777-4777-8777-777777777777';
const BILL_2 = '88888888-8888-4888-8888-888888888888';

type Call = { kind: 'rpc' | 'table'; name: string; op?: string; args?: Record<string, unknown>; values?: Record<string, unknown>; filters: Record<string, unknown> };

function fakeClient(answer: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ kind: 'rpc', name, args, filters: {} });
      return answer;
    },
    from(name: string) {
      const call: Call = { kind: 'table', name, filters: {} };
      calls.push(call);
      const builder = {
        update(values: Record<string, unknown>) { call.op = 'update'; call.values = values; return builder; },
        delete() { call.op = 'delete'; return builder; },
        eq(column: string, value: unknown) { call.filters[column] = value; return builder; },
        select() { return builder; },
        maybeSingle: async () => answer,
      };
      return builder;
    },
  };
  return { ctx: { client: client as never, orgId: 'org-1' } satisfies FinanceWriteContext, calls };
}

const valid = {
  account_id: ACCOUNT,
  txn_date: '2026-10-05',
  method: 'fpx',
  allocations: [{ bill_id: BILL_1, amount: 100 }],
};

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => { logged = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { logged.mockRestore(); });

const first = (value: unknown) => recordPaymentOutInput.safeParse(value).error?.issues[0]?.message;

describe('recordPaymentOutInput', () => {
  it('asks for an account, a real date and a known method', () => {
    expect(first({ ...valid, account_id: '' })).toBe('Choose the account the money leaves.');
    expect(first({ ...valid, txn_date: '5 Oct' })).toBe('Enter a valid date.');
    expect(first({ ...valid, method: 'barter' })).toBe('Choose how it was paid.');
  });
  it('asks for at least one bill, each once, each with an amount above 0', () => {
    expect(first({ ...valid, allocations: [] })).toBe('Choose at least one bill to pay.');
    expect(first({ ...valid, allocations: [{ bill_id: BILL_1, amount: 0 }] })).toBe('Enter an amount above 0.');
    expect(first({ ...valid, allocations: [{ bill_id: BILL_1, amount: 1 }, { bill_id: BILL_1, amount: 2 }] }))
      .toBe('Each bill can appear once on a payment.');
  });
  it('rounds amounts to two decimals and defaults to a payment made now', () => {
    const parsed = recordPaymentOutInput.parse({ ...valid, reference: ' ', allocations: [{ bill_id: BILL_1, amount: 32.506 }] });
    expect(parsed).toMatchObject({ scheduled: false, reference: null, notes: null });
    expect(parsed.allocations).toEqual([{ bill_id: BILL_1, amount: 32.51 }]);
  });
});

describe('payment writes', () => {
  it('records through the database function, in the caller’s workspace', async () => {
    const { ctx, calls } = fakeClient({ data: TXN, error: null });
    const result = await recordPaymentOut(ctx, {
      ...valid,
      allocations: [{ bill_id: BILL_1, amount: 100 }, { bill_id: BILL_2, amount: 32.5 }],
    });
    expect(result).toEqual({ ok: true, data: { id: TXN } });
    expect(calls[0]).toMatchObject({ kind: 'rpc', name: 'finance_record_payment_out' });
    expect(calls[0].args).toEqual({
      target_org: 'org-1',
      payment: { account_id: ACCOUNT, txn_date: '2026-10-05', method: 'fpx', reference: null, notes: null, status: 'posted' },
      allocations: [{ bill_id: BILL_1, amount: 100 }, { bill_id: BILL_2, amount: 32.5 }],
    });
  });
  it('sends a scheduled payment as scheduled', async () => {
    const { ctx, calls } = fakeClient({ data: TXN, error: null });
    await recordPaymentOut(ctx, { ...valid, scheduled: true });
    expect((calls[0].args!.payment as { status: string }).status).toBe('scheduled');
  });
  it('marks a scheduled payment paid and returns its number', async () => {
    const { ctx, calls } = fakeClient({ data: 'PV-0003', error: null });
    expect(await markPaymentPaid(ctx, { id: TXN, paid_on: '2026-10-09' })).toEqual({ ok: true, data: { id: TXN, number: 'PV-0003' } });
    expect(calls[0].args).toEqual({ target_org: 'org-1', target_txn: TXN, paid_on: '2026-10-09' });
  });
  it('voids by setting the status and deletes a scheduled payment, both scoped to the workspace', async () => {
    const voided = fakeClient({ data: { id: TXN }, error: null });
    expect(await voidPayment(voided.ctx, { id: TXN })).toEqual({ ok: true, data: { id: TXN } });
    expect(voided.calls[0]).toMatchObject({ name: 'finance_transactions', op: 'update' });
    expect(voided.calls[0].values).toMatchObject({ status: 'void' });
    expect(voided.calls[0].filters).toEqual({ id: TXN, org_id: 'org-1' });

    const removed = fakeClient({ data: { id: TXN }, error: null });
    expect(await deleteScheduledPayment(removed.ctx, { id: TXN })).toEqual({ ok: true, data: { id: TXN } });
    expect(removed.calls[0]).toMatchObject({ name: 'finance_transactions', op: 'delete' });
    expect(removed.calls[0].filters).toEqual({ id: TXN, org_id: 'org-1' });
  });
  it('turns each database refusal into a sentence', async () => {
    const cases: [string, string][] = [
      ['FIN03', 'The amounts against the bills add up to more than the payment.'],
      ['FIN04', 'A payment can only go against a posted bill.'],
      ['FIN05', 'That is more than is still owed on a bill.'],
      ['FIN06', 'One payment can only pay bills from one supplier.'],
      ['FIN09', 'This payment is posted and can no longer be changed. Void it instead.'],
      ['FIN11', 'That payment no longer exists.'],
      ['23503', 'The account or a bill on this payment no longer exists.'],
    ];
    for (const [code, message] of cases) {
      const { ctx } = fakeClient({ data: null, error: { code } });
      expect(await recordPaymentOut(ctx, valid), code).toEqual({ ok: false, error: message });
      expect(await markPaymentPaid(ctx, { id: TXN, paid_on: '2026-10-09' }), code).toEqual({ ok: false, error: message });
      expect(await voidPayment(ctx, { id: TXN }), code).toEqual({ ok: false, error: message });
      expect(await deleteScheduledPayment(ctx, { id: TXN }), code).toEqual({ ok: false, error: message });
    }
    expect(logged).not.toHaveBeenCalled();
  });
  it('says the payment is gone when void or delete touches no row', async () => {
    const { ctx } = fakeClient({ data: null, error: null });
    expect(await voidPayment(ctx, { id: TXN })).toEqual({ ok: false, error: 'That payment no longer exists.' });
    expect(await deleteScheduledPayment(ctx, { id: TXN })).toEqual({ ok: false, error: 'That payment no longer exists.' });
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run tests/finance-money.test.ts`
Expected: FAIL with "Failed to resolve import '@/lib/finance/money'".

- [ ] **Step 3: Write `src/lib/finance/money.ts`**

```ts
/**
 * Money moving in and out. Each movement is one finance_transactions row,
 * split across the documents it pays by finance_allocations. So far the only
 * movement is a payment out against supplier bills. A paid payment is locked
 * and can only be voided; a scheduled one can be changed or deleted.
 */
import { z } from 'zod';
import { isIsoDate } from './bills';
import {
  type FinResult,
  type FinanceWriteContext,
  PG_FOREIGN_KEY,
  pgCode,
  writeFailed,
} from './result';

export const PAYMENT_METHODS = ['bank_transfer', 'fpx', 'duitnow', 'card', 'ewallet', 'cash', 'cheque'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank Transfer',
  fpx: 'FPX',
  duitnow: 'DuitNow',
  card: 'Card',
  ewallet: 'E-Wallet',
  cash: 'Cash',
  cheque: 'Cheque',
};

export const PAYMENT_BILLS_MAX = 50;
export const PAYMENT_PAGE_SIZE = 1000;

export const MONEY_MESSAGES = {
  account: 'Choose the account the money leaves.',
  date: 'Enter a valid date.',
  method: 'Choose how it was paid.',
  bills: 'Choose at least one bill to pay.',
  tooManyBills: `One payment can cover at most ${PAYMENT_BILLS_MAX} bills.`,
  amount: 'Enter an amount above 0.',
  duplicate: 'Each bill can appear once on a payment.',
  tooLong: 'That is too long. Keep it to 200 characters or fewer.',
  gone: 'That payment no longer exists.',
  overSplit: 'The amounts against the bills add up to more than the payment.',
  notPosted: 'A payment can only go against a posted bill.',
  tooMuch: 'That is more than is still owed on a bill.',
  oneSupplier: 'One payment can only pay bills from one supplier.',
  locked: 'This payment is posted and can no longer be changed. Void it instead.',
  missing: 'The account or a bill on this payment no longer exists.',
} as const;

const M = MONEY_MESSAGES;

const date = z.string({ error: M.date }).refine(isIsoDate, M.date);
const text = z
  .string({ error: M.tooLong })
  .trim()
  .max(200, M.tooLong)
  .transform((v) => (v === '' ? null : v))
  .nullable();
const amount = z
  .number({ error: M.amount })
  .gt(0, M.amount)
  .max(999_999_999_999.99, M.amount)
  .transform((v) => Math.round(v * 100) / 100);
const id = z.string({ error: M.gone }).uuid(M.gone);

export const recordPaymentOutInput = z.object({
  account_id: z.string({ error: M.account }).uuid(M.account),
  txn_date: date,
  method: z.enum(PAYMENT_METHODS, { error: M.method }),
  reference: text.default(null),
  notes: text.default(null),
  /** True for a payment to be made later; it does not reduce the bill until marked paid. */
  scheduled: z.boolean().default(false),
  allocations: z
    .array(z.object({ bill_id: z.string({ error: M.bills }).uuid(M.bills), amount }), { error: M.bills })
    .min(1, M.bills)
    .max(PAYMENT_BILLS_MAX, M.tooManyBills)
    .refine((rows) => new Set(rows.map((r) => r.bill_id)).size === rows.length, M.duplicate),
});

export const markPaymentPaidInput = z.object({ id, paid_on: date });
export const paymentIdInput = z.object({ id });

const REFUSALS: Record<string, string> = {
  FIN03: M.overSplit,
  FIN04: M.notPosted,
  FIN05: M.tooMuch,
  FIN06: M.oneSupplier,
  FIN09: M.locked,
  FIN11: M.gone,
  [PG_FOREIGN_KEY]: M.missing,
};

function moneyWriteFailed(fnName: string, error: unknown): { ok: false; error: string } {
  const refusal = REFUSALS[pgCode(error) ?? ''];
  return refusal ? { ok: false, error: refusal } : writeFailed(fnName, error);
}

/* ---- reads ------------------------------------------------------------ */

export type FinanceAccount = { id: string; name: string; kind: 'bank' | 'cash'; bank_name: string | null };

/** The workspace's active accounts, for the "paid from" picker. */
export async function listAccounts(ctx: FinanceWriteContext): Promise<FinanceAccount[]> {
  const { data, error } = await ctx.client
    .from('finance_accounts')
    .select('id,name,kind,bank_name')
    .eq('org_id', ctx.orgId)
    .eq('active', true)
    .order('kind', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as FinanceAccount[];
}

/** One row per bill a payment out pays. A voided payment is included; callers filter. */
export type PaymentOutRow = {
  allocation_id: string;
  transaction_id: string;
  number: string | null;
  txn_date: string;
  method: PaymentMethod;
  amount: number;
  transaction_amount: number;
  status: 'draft' | 'pending_approval' | 'scheduled' | 'posted' | 'rejected' | 'void';
  reference: string | null;
  account_id: string;
  account_name: string;
  bill_id: string;
  bill_no: string | null;
  supplier_name: string;
};

const PAYMENT_COLUMNS =
  'allocation_id,transaction_id,number,txn_date,method,amount,transaction_amount,status,reference,account_id,account_name,bill_id,bill_no,supplier_name';

export async function listPaymentsOut(ctx: FinanceWriteContext): Promise<PaymentOutRow[]> {
  const rows: PaymentOutRow[] = [];
  for (let from = 0; ; from += PAYMENT_PAGE_SIZE) {
    const { data, error } = await ctx.client
      .from('finance_payments_out')
      .select(PAYMENT_COLUMNS)
      .eq('org_id', ctx.orgId)
      .order('txn_date', { ascending: false })
      .order('allocation_id', { ascending: true })
      .range(from, from + PAYMENT_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(
      ...page.map((r) => ({
        ...(r as unknown as PaymentOutRow),
        amount: Number(r.amount),
        transaction_amount: Number(r.transaction_amount),
      })),
    );
    if (page.length < PAYMENT_PAGE_SIZE) return rows;
  }
}

/* ---- writes ----------------------------------------------------------- */

/** Records a payment out, paid now or scheduled, split across one supplier's bills. */
export async function recordPaymentOut(
  ctx: FinanceWriteContext,
  input: z.input<typeof recordPaymentOutInput>,
): Promise<FinResult<{ id: string }>> {
  const { allocations, scheduled, ...payment } = recordPaymentOutInput.parse(input);
  const { data, error } = await ctx.client.rpc('finance_record_payment_out', {
    target_org: ctx.orgId,
    payment: { ...payment, status: scheduled ? 'scheduled' : 'posted' },
    allocations,
  });
  if (error || !data) return moneyWriteFailed('recordPaymentOut', error);
  return { ok: true, data: { id: data as string } };
}

/** A scheduled payment has now been made: it gets its number and reduces the bill. */
export async function markPaymentPaid(
  ctx: FinanceWriteContext,
  input: z.input<typeof markPaymentPaidInput>,
): Promise<FinResult<{ id: string; number: string }>> {
  const { id: txnId, paid_on } = markPaymentPaidInput.parse(input);
  const { data, error } = await ctx.client.rpc('finance_mark_payment_paid', {
    target_org: ctx.orgId,
    target_txn: txnId,
    paid_on,
  });
  if (error || !data) return moneyWriteFailed('markPaymentPaid', error);
  return { ok: true, data: { id: txnId, number: data as string } };
}

/** Voids a paid payment. The bills it paid owe that amount again. */
export async function voidPayment(
  ctx: FinanceWriteContext,
  input: z.input<typeof paymentIdInput>,
): Promise<FinResult<{ id: string }>> {
  const { id: txnId } = paymentIdInput.parse(input);
  const { data, error } = await ctx.client
    .from('finance_transactions')
    .update({ status: 'void', updated_at: new Date().toISOString() })
    .eq('id', txnId)
    .eq('org_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return moneyWriteFailed('voidPayment', error);
  if (!data) return { ok: false, error: M.gone };
  return { ok: true, data: { id: data.id } };
}

/** Deletes a payment that has not been made yet. A paid one is refused: void it. */
export async function deleteScheduledPayment(
  ctx: FinanceWriteContext,
  input: z.input<typeof paymentIdInput>,
): Promise<FinResult<{ id: string }>> {
  const { id: txnId } = paymentIdInput.parse(input);
  const { data, error } = await ctx.client
    .from('finance_transactions')
    .delete()
    .eq('id', txnId)
    .eq('org_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return moneyWriteFailed('deleteScheduledPayment', error);
  if (!data) return { ok: false, error: M.gone };
  return { ok: true, data: { id: data.id } };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/finance-money.test.ts`
Expected: PASS. (`32.506` rounds to `32.51`.)

- [ ] **Step 5: Type-check and commit**

Run: `pnpm exec tsc --noEmit` then `pnpm lint`
Expected: no errors.

```bash
git add src/lib/finance/money.ts tests/finance-money.test.ts
git commit -m "feat: money data layer: record, schedule, mark paid, void and delete payments out"
```

---

### Task 4: Point the live screens at the new tables, and close two stage 1 gaps

**Files:**
- Modify: `src/lib/finance/purchases.ts`
- Modify: `src/lib/finance/contacts.ts`
- Modify: `tests/purchases-view.test.ts` (adds tests; existing ones unchanged)
- Modify: `tests/finance-contacts.test.ts` (adds one test)
- Create: `tests/finance-schemas.test.ts`

**Interfaces:**
- Consumes: view `finance_payments_out`; `rm`, `rmShort` from `@/lib/finance/format`.
- Produces: `toPaymentRow(row: PaymentOutViewRow): PaymentRow` exported from `purchases.ts`; `CONTACT_MESSAGES.hasBills`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/purchases-view.test.ts`:

```ts
import { toPaymentRow } from '@/lib/finance/purchases';

const viewRow = {
  number: 'PV-0003',
  txn_date: '2026-10-05',
  method: 'fpx',
  amount: '132.50',
  status: 'posted',
  bill_no: 'BILL-0007',
  supplier_name: 'Lim Hardware',
};

test('a row of finance_payments_out becomes the payment the screen shows', () => {
  expect(toPaymentRow(viewRow)).toEqual({
    payment_no: 'PV-0003',
    paid_on: '2026-10-05',
    method: 'fpx',
    amount: 132.5,
    status: 'paid',
    supplier_bills: { bill_no: 'BILL-0007', contacts: { name: 'Lim Hardware' } },
  });
});

test('a scheduled payment has no number yet and stays scheduled', () => {
  expect(toPaymentRow({ ...viewRow, number: null, status: 'scheduled' })).toMatchObject({
    payment_no: '—',
    status: 'scheduled',
  });
});

test('a method the screen does not chart yet is counted with bank transfers', () => {
  expect(toPaymentRow({ ...viewRow, method: 'duitnow' }).method).toBe('bank_transfer');
  expect(toPaymentRow({ ...viewRow, method: 'cash' }).method).toBe('cash');
});
```

Move the new `import` line up beside the file's existing import from `@/lib/finance/purchases` (one import statement for that module).

Append to `tests/finance-contacts.test.ts`, inside `describe('contact writes', …)`:

```ts
  it('explains that a supplier with bills cannot stop being a supplier', async () => {
    const { ctx } = fakeClient({ data: null, error: { code: 'FIN07' } });
    expect(await updateContact(ctx, { id: ID, is_customer: true, is_supplier: false })).toEqual({
      ok: false,
      error: 'This contact has supplier bills, so it has to stay a supplier.',
    });
  });
```

Create `tests/finance-schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { saveBillInput } from '@/lib/finance/bills';
import { createContactInput, updateContactInput } from '@/lib/finance/contacts';
import { markPaymentPaidInput, recordPaymentOutInput } from '@/lib/finance/money';
import { createProductInput, updateProductInput } from '@/lib/finance/products';

const ID = '11111111-1111-4111-8111-111111111111';

/**
 * A server action parses its input and hands the result to a write function
 * that parses again. That is only safe while parsing a schema's own output
 * changes nothing; a transform that is not idempotent would be applied twice.
 */
const cases: [string, { parse: (v: unknown) => unknown }, unknown][] = [
  ['createContactInput', createContactInput, { name: ' Aisyah ', is_customer: true, is_supplier: false, email: '', phone: ' 012 ', tin: '' }],
  ['updateContactInput', updateContactInput, { id: ID, name: ' Aisyah ', email: '' }],
  ['createProductInput', createProductInput, { name: ' Ink ', type: 'product', price: 14.506, cost: 0.03754, sku: ' ', uom: '' }],
  ['updateProductInput', updateProductInput, { id: ID, price: 14.506, cost: 2.34567, category: '' }],
  ['saveBillInput', saveBillInput, {
    supplier_id: ID, bill_date: '2026-10-01', due_date: '2026-10-31', supplier_ref: ' ', notes: '',
    lines: [{ description: ' Gloves ', quantity: 1.23456, unit_price: 0.123456, uom: '', product_id: '' }],
  }],
  ['recordPaymentOutInput', recordPaymentOutInput, {
    account_id: ID, txn_date: '2026-10-05', method: 'fpx', reference: ' ',
    allocations: [{ bill_id: ID, amount: 32.506 }],
  }],
  ['markPaymentPaidInput', markPaymentPaidInput, { id: ID, paid_on: '2026-10-09' }],
];

describe('finance schemas parse their own output unchanged', () => {
  for (const [name, schema, input] of cases) {
    it(name, () => {
      const once = schema.parse(input);
      expect(schema.parse(once)).toEqual(once);
    });
  }
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run tests/purchases-view.test.ts tests/finance-contacts.test.ts tests/finance-schemas.test.ts`
Expected: the three new `purchases-view` tests fail (`toPaymentRow` is not exported); the new contacts test fails (general message instead of the sentence); `finance-schemas` passes if Tasks 2 and 3 are right. If a schema case fails, fix that schema's transform so it is idempotent; do not change the test.

- [ ] **Step 3: Change `src/lib/finance/purchases.ts`**

Add to the imports at the top:

```ts
import { rm as formatRm, rmShort as formatRmShort } from './format';
```

Replace the two function definitions `export function rm(n: number) { … }` and `export function rmShort(n: number) { … }` (and the comment above `rmShort`) with:

```ts
// Kept as exports of this module for its existing importers; defined in format.ts.
export const rm = formatRm;
export const rmShort = formatRmShort;
```

Replace the whole `fetchPayments` function with:

```ts
/** A row of the finance_payments_out view, as PostgREST returns it. */
export type PaymentOutViewRow = {
  number: string | null;
  txn_date: string;
  method: string;
  amount: number | string;
  status: string;
  bill_no: string | null;
  supplier_name: string;
};

/**
 * The view row in the shape the screen's builders use. The screen charts four
 * methods so far; the others (DuitNow, card, e-wallet) are electronic, so they
 * are counted with bank transfers until the screen shows all seven.
 */
export function toPaymentRow(row: PaymentOutViewRow): PaymentRow {
  const method = (row.method in METHODS ? row.method : 'bank_transfer') as PaymentRow['method'];
  return {
    payment_no: row.number ?? '—',
    paid_on: row.txn_date,
    method,
    amount: Number(row.amount),
    status: row.status === 'posted' ? 'paid' : 'scheduled',
    supplier_bills: { bill_no: row.bill_no ?? '—', contacts: { name: row.supplier_name } },
  };
}

async function fetchPayments({ supabase, orgId }: Live) {
  const { data, error } = await supabase
    .from('finance_payments_out')
    .select('number, txn_date, method, amount, status, bill_no, supplier_name')
    .eq('org_id', orgId)
    // Voided and rejected payments are not shown on this screen yet.
    .in('status', ['posted', 'scheduled'])
    .order('txn_date', { ascending: false })
    .order('number', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PaymentOutViewRow[]).map(toPaymentRow);
}
```

In `fetchBills`, the existing `.neq('display_status', 'void')` stays. Change nothing else in the file.

Run: `grep -n "payments_out\|'pending'" src/lib/finance/purchases.ts`
Expected: `payments_out` appears only inside `finance_payments_out`. The `PaymentRow` status type still lists `'pending' | 'scheduled' | 'paid'`; leave it.

- [ ] **Step 4: Change `src/lib/finance/contacts.ts`**

In `CONTACT_MESSAGES`, after the `inUse` line, add:

```ts
  hasBills: 'This contact has supplier bills, so it has to stay a supplier.',
```

In `contactWriteFailed`, before the `PG_CHECK` line, add:

```ts
  if (code === 'FIN07') return { ok: false, error: M.hasBills };
```

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run tests/purchases-view.test.ts tests/finance-contacts.test.ts tests/finance-schemas.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check, lint and commit**

Run: `pnpm exec tsc --noEmit` then `pnpm lint`
Expected: no errors.

```bash
git add src/lib/finance/purchases.ts src/lib/finance/contacts.ts tests/purchases-view.test.ts tests/finance-contacts.test.ts tests/finance-schemas.test.ts
git commit -m "feat: read payments from the money table; refuse unticking Supplier on a contact with bills"
```

---

### Task 5: Document and verify the branch

**Files:**
- Modify: `docs/bendahara-backend.md`

- [ ] **Step 1: Update the backend note**

In `docs/bendahara-backend.md`:

1. In the "Tables" table, replace the row for `supplier_bills`, `supplier_bill_lines`, `payments_out` with these rows:

```markdown
| `finance_accounts` | Bank and cash accounts. Every workspace starts with "Main Bank" and "Cash in hand". No screen yet. |
| `supplier_bills`, `supplier_bill_lines` | Supplier bills and their lines. A draft has no `bill_no`. |
| `finance_transactions` | One row per movement of money: direction, account, date, amount, method, status. |
| `finance_allocations` | How a movement is split across the documents it pays. Only bills so far. |
```

and delete the older `finance_accounts` row so it appears once.

2. Add these sections before "Known limits":

```markdown
## Money

Money is entered once. A payment out is one `finance_transactions` row with
direction `out`, split across one supplier's bills by `finance_allocations`.
The view `finance_payments_out` has one row per bill a payment pays;
`supplier_bill_totals` counts only posted money out as paid.

Statuses of a transaction: `draft` (being written by a database function),
`scheduled` (not yet money out), `posted` (paid; numbered `PV-0001`), `void`.
`pending_approval` and `rejected` exist for the approval rule that arrives
with Payment Vouchers and Expenses; nothing sets them yet.

## Posted is locked

Triggers enforce it, so no caller can get round it:

- A draft bill can be edited and deleted. A posted bill can only be voided,
  and not while it has payments. Its lines are locked with it.
- A scheduled payment can be edited and deleted. A paid one can only be
  voided, which frees the bills it paid. Its split is locked with it.
- A payment cannot exceed what is still owed on a bill, counting scheduled
  payments. The bill row is locked while this is checked, so two payments at
  the same moment are checked one after the other.
- Each guard steps aside when the workspace itself is being deleted.

## Database functions

All run as the caller, so RLS decides who may write.

| Function | Does |
|---|---|
| `finance_save_bill(org, bill, lines)` | Creates a draft bill or replaces a draft's header and lines. Returns the id. |
| `finance_post_bill(org, bill_id)` | Posts a draft and returns its number. |
| `finance_record_payment_out(org, payment, allocations)` | Records a payment, `posted` or `scheduled`. Returns the id. |
| `finance_mark_payment_paid(org, txn_id, paid_on)` | Scheduled to paid. Returns the number. |
| `finance_next_number(org, type)` | The next document number. |

Voiding a bill or a payment, and deleting a draft bill or a scheduled payment,
are plain updates and deletes; the guards decide whether they are allowed.

## Error codes

The guards and functions raise these SQLSTATEs; `bills.ts`, `money.ts` and
`contacts.ts` turn them into sentences.

| Code | Meaning |
|---|---|
| `FIN01` | The bill is posted or void and cannot be changed or deleted |
| `FIN02` | The bill has payments, so it cannot be voided |
| `FIN03` | The allocations add up to more than the payment |
| `FIN04` | A payment can only go against a posted bill |
| `FIN05` | The amount is more than is still owed on the bill |
| `FIN06` | The bills on one payment belong to different suppliers, or none was found |
| `FIN07` | The contact has bills, so Supplier cannot be unticked |
| `FIN09` | The payment is posted or void and cannot be changed or deleted |
| `FIN10` | The bill has no lines, or its lines total nothing |
| `FIN11` | The bill or payment no longer exists |
```

3. In "Known limits", add:

```markdown
- Supplier Bills and Payments Out still have no forms; the data layer for them
  is in `bills.ts` and `money.ts`.
- The Payments Out screen charts four payment methods; DuitNow, card and
  e-wallet are counted with bank transfers until its form is built.
- Approval of money out is not enforced yet.
```

and remove the line that says Supplier Bills and Payments Out are read-only so far, if the section has one.

- [ ] **Step 2: Run everything**

Run, as separate commands: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`.
Expected: no type or lint errors; the build completes. If migration 1 is applied to the hosted database, every test passes. If it is not applied yet, exactly `tests/bendahara-purchases.test.ts` fails and nothing else; report which.

- [ ] **Step 3: Check for banned colours and names**

Run: `git diff origin/main...HEAD -- src | grep -n -i -E "^\+.*(purple|violet|fuchsia|indigo|kuasa\.ai)"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/bendahara-backend.md
git commit -m "docs: describe the money table, the posted-is-locked guards and the finance error codes"
```

- [ ] **Step 5: Hand back**

Do not push. Report what was built and the test counts. The controller then: pushes and opens the PR when the owner says so; after the merge is deployed, checks Supplier Bills and Payments Out on production (same figures as before for the demo workspace: RM 10.9k payable, the same payments list); then dry-runs and applies migration 2 with the owner's go-ahead, and runs the database tests once more.

---

## Self-review notes

- Spec coverage for the first half of build-order item 2: transactions and allocations (Task 1), `payments_out` moved into them (Task 1; dropped by migration 2), the database rules "posted cannot be updated or deleted", "money allocated blocks a void", "an allocation cannot exceed the transaction", "only posted transactions change a balance" (Task 1), multi-row writes as database functions (Task 1), the data layer (Tasks 2 and 3). The approval rule is deliberately left for stage 5 (decision 2).
- Stage 1 carry-overs closed here: a unique number per document (the partial unique index on transactions; `bill_no` was already unique), the double-parse contract pinned by `tests/finance-schemas.test.ts`, unticking Supplier on a contact with bills, viewer-cannot-write on categories and sequences, `purchases.ts` using `format.ts`.
- Left for the second half's plan: the bill form and line-items editor, the payment form with allocations, server actions for bills and payments, CSV export, "View all", the finance error page, refreshing a list after "no longer exists", extending the Payments Out screen to seven methods and a Void status, the `ConfirmRow` accessibility items, and checking whether a list filter resets after a write.
