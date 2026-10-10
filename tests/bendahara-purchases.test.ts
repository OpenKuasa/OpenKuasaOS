import { beforeAll, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';

const testWithSupabase = hasSupabaseEnv ? test : test.skip;

if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function client(): SupabaseClient {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function anonUserWithOrg(orgName: string) {
  const c = client();
  const { error: authErr } = await c.auth.signInAnonymously();
  expect(authErr, authErr?.message).toBeNull();
  const { data: orgId, error } = await c.rpc('create_org_for_current_user', {
    org_name: orgName,
  });
  expect(error, error?.message).toBeNull();
  return { c, orgId: orgId as string };
}

async function insertOne<T>(c: SupabaseClient, table: string, row: object) {
  const { data, error } = await c.from(table).insert(row).select().single();
  expect(error, error?.message).toBeNull();
  return data as T & { id: string };
}

function daysFromToday(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

let a: Awaited<ReturnType<typeof anonUserWithOrg>>;
let b: Awaited<ReturnType<typeof anonUserWithOrg>>;
let supplierA: { id: string };
let billA: { id: string };

beforeAll(async () => {
  if (!hasSupabaseEnv) return;
  a = await anonUserWithOrg('Purchases A Sdn Bhd');
  b = await anonUserWithOrg('Purchases B Sdn Bhd');
  supplierA = await insertOne(a.c, 'finance_contacts', {
    org_id: a.orgId,
    type: 'supplier',
    name: 'Supplier of A',
  });
  billA = await insertOne(a.c, 'supplier_bills', {
    org_id: a.orgId,
    bill_no: 'BILL-1',
    supplier_id: supplierA.id,
    due_date: daysFromToday(30),
    status: 'posted',
  });
  await insertOne(a.c, 'supplier_bill_lines', {
    org_id: a.orgId,
    bill_id: billA.id,
    description: 'Gloves',
    quantity: 10,
    unit_price: 12.5,
    sst_rate: 6,
  });
});

async function totals(c: SupabaseClient, billId: string) {
  const { data, error } = await c
    .from('supplier_bill_totals')
    .select('total, paid, balance, display_status')
    .eq('id', billId)
    .single();
  expect(error, error?.message).toBeNull();
  return data;
}

testWithSupabase('bill total, balance and status are derived from lines and paid payments', async () => {
  // 10 × 12.50 = 125.00, plus 6% SST = 132.50
  expect(await totals(a.c, billA.id)).toEqual({
    total: 132.5,
    paid: 0,
    balance: 132.5,
    display_status: 'pending',
  });

  await insertOne(a.c, 'payments_out', {
    org_id: a.orgId,
    payment_no: 'PAY-1',
    bill_id: billA.id,
    method: 'fpx',
    amount: 100,
  });
  // A scheduled payment is not money out yet.
  await insertOne(a.c, 'payments_out', {
    org_id: a.orgId,
    payment_no: 'PAY-2',
    bill_id: billA.id,
    method: 'bank_transfer',
    amount: 32.5,
    status: 'scheduled',
  });
  expect(await totals(a.c, billA.id)).toMatchObject({ paid: 100, balance: 32.5, display_status: 'pending' });

  const { error } = await a.c.from('payments_out').update({ status: 'paid' }).eq('payment_no', 'PAY-2');
  expect(error, error?.message).toBeNull();
  expect(await totals(a.c, billA.id)).toMatchObject({ balance: 0, display_status: 'paid' });
});

testWithSupabase('an unpaid posted bill past its due date is overdue; a draft never is', async () => {
  const late = await insertOne<{ id: string }>(a.c, 'supplier_bills', {
    org_id: a.orgId,
    bill_no: 'BILL-LATE',
    supplier_id: supplierA.id,
    bill_date: daysFromToday(-20),
    due_date: daysFromToday(-5),
    status: 'posted',
  });
  await insertOne(a.c, 'supplier_bill_lines', {
    org_id: a.orgId,
    bill_id: late.id,
    description: 'Electricity',
    quantity: 1,
    unit_price: 300,
  });
  expect((await totals(a.c, late.id))?.display_status).toBe('overdue');

  await a.c.from('supplier_bills').update({ status: 'draft' }).eq('id', late.id);
  expect((await totals(a.c, late.id))?.display_status).toBe('draft');
});

testWithSupabase('another org cannot see bills, lines or payments', async () => {
  for (const table of ['finance_contacts', 'supplier_bills', 'supplier_bill_lines', 'payments_out', 'supplier_bill_totals']) {
    const { data, error } = await b.c.from(table).select('id').eq('org_id', a.orgId);
    expect(error, error?.message).toBeNull();
    expect(data ?? [], table).toHaveLength(0);
  }
});

testWithSupabase("another org cannot attach its rows to A's supplier or bill", async () => {
  // In its own org: the composite foreign key rejects A's parent ids.
  const bill = await b.c.from('supplier_bills').insert({
    org_id: b.orgId,
    bill_no: 'BILL-X',
    supplier_id: supplierA.id,
    due_date: daysFromToday(30),
  });
  expect(bill.error?.code).toBe('23503');

  const payment = await b.c.from('payments_out').insert({
    org_id: b.orgId,
    payment_no: 'PAY-X',
    bill_id: billA.id,
    method: 'cash',
    amount: 1,
  });
  expect(payment.error?.code).toBe('23503');

  // In A's org: RLS rejects the write.
  const line = await b.c.from('supplier_bill_lines').insert({
    org_id: a.orgId,
    bill_id: billA.id,
    description: 'Injected',
    quantity: 1,
    unit_price: 1,
  });
  expect(line.error?.code).toBe('42501');
});

testWithSupabase('a supplier with bills cannot be deleted', async () => {
  const { error } = await a.c.from('finance_contacts').delete().eq('id', supplierA.id);
  expect(error?.code).toBe('23503');
});

testWithSupabase('a demo viewer reads the seeded bills but cannot write', async () => {
  const c = client();
  const { error: authErr } = await c.auth.signInAnonymously();
  expect(authErr, authErr?.message).toBeNull();
  const { data: demoId, error } = await c.rpc('join_demo_org');
  expect(error, error?.message).toBeNull();

  const { data: bills } = await c.from('supplier_bill_totals').select('bill_no').eq('org_id', demoId);
  expect((bills ?? []).length).toBeGreaterThan(0);

  const { data: supplier } = await c
    .from('finance_contacts')
    .select('id')
    .eq('org_id', demoId)
    .eq('type', 'supplier')
    .limit(1)
    .single();
  const write = await c.from('supplier_bills').insert({
    org_id: demoId,
    bill_no: 'BILL-VIEWER',
    supplier_id: supplier?.id,
    due_date: daysFromToday(30),
  });
  expect(write.error?.code).toBe('42501');
});
