import { expect, test } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';
import { createConfirmedTestUser, createOrg, liveClient, signInOwner } from './helpers/live-workspaces';

// Supplier credit notes against the hosted database (20261120090000): the
// note, its credit on a bill, the figures that follow, the books. Every
// workspace is made through tests/helpers/live-workspaces.ts, which deletes
// what it creates.

const testWithSupabase = hasSupabaseEnv ? test : test.skip;

if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);

type Org = { c: SupabaseClient; orgId: string; bank: string; supplier: string; other: string };

async function workspace(orgName: string): Promise<Org> {
  const c = liveClient();
  const { error: authErr } = await signInOwner(c);
  expect(authErr, authErr?.message).toBeNull();
  const { data: orgId, error } = await createOrg(c, orgName);
  expect(error, error?.message).toBeNull();
  const { data: accounts } = await c.from('finance_accounts').select('id, name').eq('org_id', orgId);
  const { data: contacts, error: contactErr } = await c
    .from('finance_contacts')
    .insert([
      { org_id: orgId, name: `Supplier of ${orgName}`, is_customer: false, is_supplier: true },
      { org_id: orgId, name: `Other supplier of ${orgName}`, is_customer: false, is_supplier: true },
    ])
    .select('id, name');
  expect(contactErr, contactErr?.message).toBeNull();
  return {
    c,
    orgId: orgId as string,
    bank: accounts!.find((a) => a.name === 'Main Bank')!.id as string,
    supplier: contacts!.find((x) => x.name.startsWith('Supplier'))!.id as string,
    other: contacts!.find((x) => x.name.startsWith('Other'))!.id as string,
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const PAPER = { description: 'A4 paper', quantity: 10, unit_price: 12.5, sst_rate: 6 }; // 125.00 + 7.50 SST = 132.50

async function draftBill(o: Org, supplier = o.supplier, lines: object[] = [PAPER], extra: object = {}) {
  const saved = await o.c.rpc('finance_save_bill', {
    target_org: o.orgId,
    bill: { supplier_id: supplier, bill_date: today(), due_date: today(), ...extra },
    lines,
  });
  expect(saved.error, saved.error?.message).toBeNull();
  return saved.data as string;
}

/** A posted bill of RM 132.50, unless other lines are given. */
async function postedBill(o: Org, supplier = o.supplier, lines: object[] = [PAPER], extra: object = {}) {
  const id = await draftBill(o, supplier, lines, extra);
  const posted = await o.c.rpc('finance_post_bill', { target_org: o.orgId, target_bill: id });
  expect(posted.error, posted.error?.message).toBeNull();
  return id;
}

function payBill(o: Org, bill: string, amount: number) {
  return o.c.rpc('finance_record_payment_out', {
    target_org: o.orgId,
    payment: { account_id: o.bank, txn_date: today(), method: 'fpx' },
    allocations: [{ bill_id: bill, amount }],
  });
}

function saveNote(o: Org, bill: string, amount: number, extra: object = {}) {
  return o.c.rpc('finance_save_supplier_credit_note', {
    target_org: o.orgId,
    note: { bill_id: bill, credit_date: today(), reason: 'overpaid', amount, supplier_ref: 'CN-7781', ...extra },
  });
}

/** An issued note. */
async function issuedNote(o: Org, bill: string, amount: number) {
  const saved = await saveNote(o, bill, amount);
  expect(saved.error, saved.error?.message).toBeNull();
  const issued = await o.c.rpc('finance_issue_supplier_credit_note', { target_org: o.orgId, target_note: saved.data });
  expect(issued.error, issued.error?.message).toBeNull();
  return { id: saved.data as string, no: issued.data as string };
}

function apply(o: Org, note: string, bill: string, amount: number) {
  return o.c
    .from('finance_supplier_credit_applications')
    .insert({ org_id: o.orgId, credit_note_id: note, bill_id: bill, amount })
    .select('id');
}

async function bill(c: SupabaseClient, id: string) {
  const { data, error } = await c
    .from('supplier_bill_totals')
    .select('total, paid, credited, balance, display_status')
    .eq('id', id)
    .single();
  expect(error, error?.message).toBeNull();
  return { total: Number(data!.total), paid: Number(data!.paid), credited: Number(data!.credited), balance: Number(data!.balance), display_status: data!.display_status };
}

async function note(c: SupabaseClient, id: string) {
  const { data, error } = await c
    .from('finance_supplier_credit_note_totals')
    .select('status, credit_note_no, amount, applied, open_amount, supplier_name, bill_no')
    .eq('id', id)
    .single();
  expect(error, error?.message).toBeNull();
  return { ...data!, amount: Number(data!.amount), applied: Number(data!.applied), open_amount: Number(data!.open_amount) };
}

function voidNote(o: Org, id: string) {
  return o.c.from('finance_supplier_credit_notes').update({ status: 'void', updated_at: new Date().toISOString() }).eq('id', id).select('id');
}

testWithSupabase('an issued note is numbered, takes what its bill owes, and a draft does neither', async () => {
  const a = await workspace('Supplier Credit A Sdn Bhd');
  const b1 = await postedBill(a);
  const saved = await saveNote(a, b1, 30);
  expect(saved.error, saved.error?.message).toBeNull();
  expect(await bill(a.c, b1)).toMatchObject({ credited: 0, balance: 132.5 });
  expect(await note(a.c, saved.data)).toMatchObject({ status: 'draft', credit_note_no: null, open_amount: 0 });

  const issued = await a.c.rpc('finance_issue_supplier_credit_note', { target_org: a.orgId, target_note: saved.data });
  expect(issued.error, issued.error?.message).toBeNull();
  expect(issued.data).toMatch(/^SCN-\d{4}$/);
  expect(await bill(a.c, b1)).toMatchObject({ total: 132.5, paid: 0, credited: 30, balance: 102.5, display_status: 'pending' });
  expect(await note(a.c, saved.data)).toMatchObject({ status: 'issued', amount: 30, applied: 30, open_amount: 0 });

  // Issued once; and once issued it is not edited, deleted or made by hand.
  const again = await a.c.rpc('finance_issue_supplier_credit_note', { target_org: a.orgId, target_note: saved.data });
  expect(again.error?.code).toBe('FIN01');
  const edit = await a.c.from('finance_supplier_credit_notes').update({ amount: 1 }).eq('id', saved.data).select('id');
  expect(edit.error?.code).toBe('FIN01');
  const removed = await a.c.from('finance_supplier_credit_notes').delete().eq('id', saved.data);
  expect(removed.error?.code).toBe('FIN01');
  const sneaky = await a.c.from('finance_supplier_credit_notes').insert({
    org_id: a.orgId, bill_id: b1, credit_note_no: 'SCN-SNEAKY', amount: 1, status: 'issued', issued_at: new Date().toISOString(),
  });
  expect(sneaky.error?.code).toBe('FIN01');

  // A draft is deleted, not voided.
  const draft = await saveNote(a, b1, 5);
  expect((await voidNote(a, draft.data)).error?.code).toBe('FIN01');
  expect((await a.c.from('finance_supplier_credit_notes').delete().eq('id', draft.data)).error).toBeNull();
});

testWithSupabase('a note goes against a posted bill, and the issued notes of a bill never exceed it', async () => {
  const a = await workspace('Supplier Credit B Sdn Bhd');
  const draft = await draftBill(a);
  expect((await saveNote(a, draft, 10)).error?.code).toBe('FIN04');

  const b1 = await postedBill(a);
  expect((await saveNote(a, b1, 132.51)).error?.code).toBe('FIN05');
  await issuedNote(a, b1, 100);
  // 32.50 is left to credit.
  const tooMuch = await saveNote(a, b1, 32.51);
  expect(tooMuch.error?.code).toBe('FIN05');
  expect((await saveNote(a, b1, 32.5)).error).toBeNull();
});

testWithSupabase('credit left over from a paid bill is applied to a later bill of the same supplier, and a payment cannot pay past it', async () => {
  const a = await workspace('Supplier Credit C Sdn Bhd');
  const paidBill = await postedBill(a);
  expect((await payBill(a, paidBill, 132.5)).error).toBeNull();
  expect(await bill(a.c, paidBill)).toMatchObject({ paid: 132.5, balance: 0, display_status: 'paid' });

  // Nothing is owed on the bill, so nothing is applied on issue: all 30 is open.
  const n = await issuedNote(a, paidBill, 30);
  expect(await note(a.c, n.id)).toMatchObject({ applied: 0, open_amount: 30, supplier_name: 'Supplier of Supplier Credit C Sdn Bhd' });
  expect(await bill(a.c, paidBill)).toMatchObject({ credited: 0, balance: 0 });

  const later = await postedBill(a);
  const draft = await draftBill(a);
  const otherSupplier = await postedBill(a, a.other);
  expect((await apply(a, n.id, draft, 10)).error?.code).toBe('FIN04');
  expect((await apply(a, n.id, otherSupplier, 10)).error?.code).toBe('FIN42');
  expect((await apply(a, n.id, later, 30.01)).error?.code).toBe('FIN05');
  const applied = await apply(a, n.id, later, 30);
  expect(applied.error, applied.error?.message).toBeNull();
  expect(await bill(a.c, later)).toMatchObject({ paid: 0, credited: 30, balance: 102.5, display_status: 'pending' });
  expect(await note(a.c, n.id)).toMatchObject({ applied: 30, open_amount: 0 });
  // The note is used up, and a bill takes a note once.
  expect((await apply(a, n.id, later, 1)).error?.code).toBe('FIN05');

  // The payment counts the credit as settled.
  expect((await payBill(a, later, 102.51)).error?.code).toBe('FIN05');
  expect((await payBill(a, later, 102.5)).error).toBeNull();
  expect(await bill(a.c, later)).toMatchObject({ paid: 102.5, credited: 30, balance: 0, display_status: 'paid' });

  // Credit goes on a bill that already has payments waiting, never past what is left.
  const third = await postedBill(a);
  const second = await issuedNote(a, third, 20);
  const wait = await a.c.rpc('finance_record_payment_out', {
    target_org: a.orgId,
    payment: { account_id: a.bank, txn_date: today(), method: 'fpx', status: 'scheduled' },
    allocations: [{ bill_id: third, amount: 100 }],
  });
  expect(wait.error, wait.error?.message).toBeNull();
  // 132.50 - 20 (applied on issue) - 100 (waiting) = 12.50 left to pay.
  expect((await payBill(a, third, 12.51)).error?.code).toBe('FIN05');
  expect((await payBill(a, third, 12.5)).error).toBeNull();
  expect(second.no).toMatch(/^SCN-/);
});

testWithSupabase('voiding a note gives back what it took, unless its credit is on another bill', async () => {
  const a = await workspace('Supplier Credit D Sdn Bhd');
  const paidFirst = await postedBill(a);
  const b1 = await postedBill(a);
  const n = await issuedNote(a, b1, 30);
  expect(await bill(a.c, b1)).toMatchObject({ credited: 30, balance: 102.5 });

  // A bill with a note, or credit, on it is not voided.
  const voidBill = await a.c.from('supplier_bills').update({ status: 'void', updated_at: new Date().toISOString() }).eq('id', b1).select('id');
  expect(voidBill.error?.code).toBe('FIN43');

  // An issued note keeps its bill and its stamp.
  const moved = await a.c.from('finance_supplier_credit_notes').update({ bill_id: paidFirst }).eq('id', n.id).select('id');
  expect(moved.error?.code).toBe('FIN01');
  const stamped = await a.c.from('finance_supplier_credit_notes').update({ voided_at: new Date().toISOString() }).eq('id', n.id).select('id');
  expect(stamped.error?.code).toBe('FIN01');

  expect((await voidNote(a, n.id)).error).toBeNull();
  expect(await bill(a.c, b1)).toMatchObject({ credited: 0, balance: 132.5 });
  expect(await note(a.c, n.id)).toMatchObject({ status: 'void', applied: 0, open_amount: 0 });
  // A void note has no credit to give.
  expect((await apply(a, n.id, b1, 10)).error?.code).toBe('FIN04');

  // Credit used on a later bill: refused until it is taken off that bill.
  const paid = await postedBill(a);
  expect((await payBill(a, paid, 132.5)).error).toBeNull();
  const m = await issuedNote(a, paid, 40);
  const later = await postedBill(a);
  const used = await apply(a, m.id, later, 40);
  expect(used.error, used.error?.message).toBeNull();
  expect((await voidNote(a, m.id)).error?.code).toBe('FIN41');
  // The later bill carries credit, so it is not voided either.
  const voidLater = await a.c.from('supplier_bills').update({ status: 'void', updated_at: new Date().toISOString() }).eq('id', later).select('id');
  expect(voidLater.error?.code).toBe('FIN43');

  const off = await a.c.from('finance_supplier_credit_applications').delete().eq('id', used.data![0].id);
  expect(off.error).toBeNull();
  expect(await bill(a.c, later)).toMatchObject({ credited: 0, balance: 132.5 });
  expect((await voidNote(a, m.id)).error).toBeNull();
  expect(await note(a.c, m.id)).toMatchObject({ status: 'void', open_amount: 0 });
});

testWithSupabase('an issued note is in the books, a void one is reversed, and the entry balances', async () => {
  const a = await workspace('Supplier Credit E Sdn Bhd');
  const b1 = await postedBill(a);
  const n = await issuedNote(a, b1, 30);
  const key = `supplier_credit_note:${n.id}`;
  const entry = async () => {
    const { data, error } = await a.c.from('finance_ledger_lines').select('entry_key, source, debit, credit, account_id').eq('org_id', a.orgId).like('entry_key', `${key}%`);
    expect(error, error?.message).toBeNull();
    return data!;
  };

  const lines = await entry();
  expect(lines).toHaveLength(2);
  expect(lines.every((l) => l.source === 'supplier_credit_note' && l.account_id !== null)).toBe(true);
  // Accounts Payable is debited, the bill's category credited, by the same amount.
  expect(lines.map((l) => [Number(l.debit), Number(l.credit)]).sort()).toEqual([[0, 30], [30, 0]]);

  expect((await voidNote(a, n.id)).error).toBeNull();
  const after = await entry();
  expect(after).toHaveLength(4);
  const net = new Map<string, number>();
  for (const l of after) net.set(String(l.account_id), (net.get(String(l.account_id)) ?? 0) + Math.round((Number(l.debit) - Number(l.credit)) * 100));
  expect([...net.values()]).toEqual([0, 0]);
});

testWithSupabase('a credit note brings a purchase order’s billed figure down', async () => {
  const a = await workspace('Supplier Credit F Sdn Bhd');
  const order = await a.c.rpc('finance_save_purchase_order', {
    target_org: a.orgId,
    purchase_order: { supplier_id: a.supplier, po_date: today() },
    lines: [PAPER], // RM 132.50
  });
  expect(order.error, order.error?.message).toBeNull();
  expect((await a.c.rpc('finance_submit_purchase_order', { target_org: a.orgId, target_po: order.data })).error).toBeNull();
  const approved = await a.c.rpc('finance_decide_purchase_order', { target_org: a.orgId, target_po: order.data, approve: true, reason: null });
  expect(approved.error, approved.error?.message).toBeNull();

  const billed = await postedBill(a, a.supplier, [{ description: 'A4 paper, and more', quantity: 10, unit_price: 30, sst_rate: 0 }], { purchase_order_id: order.data });
  const read = async () => {
    const { data, error } = await a.c.from('finance_purchase_order_totals').select('billed_total, over_billed').eq('id', order.data).single();
    expect(error, error?.message).toBeNull();
    return { billed_total: Number(data!.billed_total), over_billed: data!.over_billed };
  };
  expect(await read()).toEqual({ billed_total: 300, over_billed: true });

  const draft = await saveNote(a, billed, 167.5);
  expect(draft.error, draft.error?.message).toBeNull();
  // A draft does not count.
  expect(await read()).toEqual({ billed_total: 300, over_billed: true });
  expect((await a.c.rpc('finance_issue_supplier_credit_note', { target_org: a.orgId, target_note: draft.data })).error).toBeNull();
  expect(await read()).toEqual({ billed_total: 132.5, over_billed: false });
});

testWithSupabase('a member writes a draft, but issuing, voiding and applying credit need an owner or admin', async () => {
  const a = await workspace('Supplier Credit G Sdn Bhd');
  const m = liveClient();
  const signUp = await createConfirmedTestUser(m, 'supplier-credit-member-pass-123');
  const invite = await a.c.rpc('create_invite', { p_email: signUp.email, p_role: 'member' });
  expect(invite.error, invite.error?.message).toBeNull();
  const accepted = await m.rpc('accept_invite', { p_token: invite.data });
  expect(accepted.error, accepted.error?.message).toBeNull();

  const b1 = await postedBill(a);
  const paid = await postedBill(a);
  expect((await payBill(a, paid, 132.5)).error).toBeNull();
  const owned = await issuedNote(a, paid, 30);

  const draft = await m.rpc('finance_save_supplier_credit_note', {
    target_org: a.orgId,
    note: { bill_id: b1, credit_date: today(), reason: 'returned_goods', amount: 10 },
  });
  expect(draft.error, draft.error?.message).toBeNull();
  const issue = await m.rpc('finance_issue_supplier_credit_note', { target_org: a.orgId, target_note: draft.data });
  expect(issue.error?.code).toBe('FIN14');
  const voided = await m.from('finance_supplier_credit_notes').update({ status: 'void' }).eq('id', owned.id).select('id');
  expect(voided.error?.code).toBe('FIN14');
  // Nor may a member void a bill; the sign-off answers before the credit rule does.
  const voidBill = await m.from('supplier_bills').update({ status: 'void' }).eq('id', b1).select('id');
  expect(voidBill.error?.code).toBe('FIN14');
  const applied = await m
    .from('finance_supplier_credit_applications')
    .insert({ org_id: a.orgId, credit_note_id: owned.id, bill_id: b1, amount: 10 });
  expect(applied.error).not.toBeNull();
  expect(await note(a.c, owned.id)).toMatchObject({ status: 'issued', applied: 0 });
});
