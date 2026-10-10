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
  method: 'fpx' as const,
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
