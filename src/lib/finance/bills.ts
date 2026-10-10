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
