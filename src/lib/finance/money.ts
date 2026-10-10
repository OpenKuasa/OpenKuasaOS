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
  .transform((v) => Math.round(v * 100) / 100)
  .pipe(z.number().gt(0, M.amount).max(999_999_999_999.99, M.amount));
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
