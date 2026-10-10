/**
 * The bill form's rules, kept out of the components so they can be tested:
 * what a new form holds, what choosing a supplier, a date or a product
 * changes, what is wrong with the form, and what is sent to saveBillAction.
 * Pure. Every box is held as the text the person typed.
 */
import { addDaysIso, billTotals, type LineNumbers } from './bill-math';
import { type BillDetail, BILL_MESSAGES, isIsoDate, saveBillInput } from './bills';
import { typedNumber } from './format';
import type { FinanceProduct } from './products';
import { WRITE_FAILED } from './result';

export type LineDraft = {
  /** Stable for React while the form is open; never sent. */
  key: string;
  product_id: string;
  description: string;
  quantity: string;
  uom: string;
  /** Not shown in the editor; carried so editing a draft does not drop it. */
  pack_size: string;
  unit_price: string;
  sst_rate: string;
};

export type BillForm = {
  /** Present when a saved draft is being changed. */
  id?: string;
  supplier_id: string;
  supplier_ref: string;
  bill_date: string;
  due_date: string;
  /** Once the person sets the due date by hand, it is no longer recalculated. */
  dueEdited: boolean;
  notes: string;
  lines: LineDraft[];
};

export function emptyLine(key: string): LineDraft {
  return { key, product_id: '', description: '', quantity: '1', uom: '', pack_size: '', unit_price: '', sst_rate: '0' };
}

/** A new bill dated today with one empty line. The due date follows once a supplier is chosen. */
export function newBillForm(today: string, lineKey: string): BillForm {
  return {
    supplier_id: '',
    supplier_ref: '',
    bill_date: today,
    due_date: today,
    dueEdited: false,
    notes: '',
    lines: [emptyLine(lineKey)],
  };
}

/** A saved draft, as the form shows it. Its due date was chosen already, so it is kept. */
export function billFormFromDetail(bill: BillDetail): BillForm {
  return {
    id: bill.id,
    supplier_id: bill.supplier_id,
    supplier_ref: bill.supplier_ref ?? '',
    bill_date: bill.bill_date,
    due_date: bill.due_date,
    dueEdited: true,
    notes: bill.notes ?? '',
    lines: bill.lines.map((l) => ({
      key: l.id,
      product_id: l.product_id ?? '',
      description: l.description,
      quantity: String(l.quantity),
      uom: l.uom ?? '',
      pack_size: l.pack_size ?? '',
      unit_price: String(l.unit_price),
      sst_rate: String(l.sst_rate),
    })),
  };
}

/** Bill date plus the supplier's payment terms; with no supplier yet, the bill date itself. */
export function defaultDueDate(billDate: string, termsDays: number | undefined): string {
  return addDaysIso(billDate, termsDays ?? 0);
}

/** Choosing a supplier moves the due date to their terms, unless it was set by hand. */
export function withSupplier(form: BillForm, supplier: { id: string; payment_terms_days: number }): BillForm {
  return {
    ...form,
    supplier_id: supplier.id,
    due_date: form.dueEdited ? form.due_date : defaultDueDate(form.bill_date, supplier.payment_terms_days),
  };
}

/**
 * Changing the bill date moves the due date with it, unless it was set by
 * hand. While the bill date is half typed the due date stays where it was.
 */
export function withBillDate(form: BillForm, billDate: string, termsDays: number | undefined): BillForm {
  const follow = !form.dueEdited && isIsoDate(billDate);
  return { ...form, bill_date: billDate, due_date: follow ? defaultDueDate(billDate, termsDays) : form.due_date };
}

export function withDueDate(form: BillForm, dueDate: string): BillForm {
  return { ...form, due_date: dueDate, dueEdited: true };
}

/**
 * Choosing a product fills the line from it: its name, unit, cost (what the
 * workspace pays for it) and SST rate. The person can then change any of
 * them. Choosing "no product" only clears the link.
 */
export function withProduct(line: LineDraft, product: FinanceProduct | null): LineDraft {
  if (!product) return { ...line, product_id: '' };
  return {
    ...line,
    product_id: product.id,
    description: product.name,
    uom: product.uom,
    unit_price: String(product.cost),
    sst_rate: String(product.sst_rate),
  };
}

/** An empty SST box means no SST. */
function sstRate(text: string): number {
  return text.trim() === '' ? 0 : (typedNumber(text) ?? Number.NaN);
}

/** The line's figures for the live total; a box that is not a number is NaN, which counts as nothing. */
export function lineNumbers(line: LineDraft): LineNumbers {
  return {
    quantity: typedNumber(line.quantity) ?? Number.NaN,
    unit_price: typedNumber(line.unit_price) ?? Number.NaN,
    sst_rate: sstRate(line.sst_rate),
  };
}

/** What is sent to saveBillAction. Figures are numbers; a box that is not a number goes as NaN and is refused. */
export function billPayload(form: BillForm) {
  return {
    ...(form.id ? { id: form.id } : {}),
    supplier_id: form.supplier_id,
    supplier_ref: form.supplier_ref,
    bill_date: form.bill_date,
    due_date: form.due_date,
    notes: form.notes,
    lines: form.lines.map((line) => ({
      product_id: line.product_id,
      description: line.description,
      uom: line.uom,
      pack_size: line.pack_size,
      ...lineNumbers(line),
    })),
  };
}

/**
 * The first thing wrong with the form, in the schema's own sentence, or null
 * when it can be sent. A draft may total nothing; a bill being posted may not,
 * and saying so here saves a draft the database would then refuse to post.
 */
export function billFormError(form: BillForm, posting = false): string | null {
  const parsed = saveBillInput.safeParse(billPayload(form));
  if (!parsed.success) return parsed.error.issues[0]?.message ?? BILL_MESSAGES.lines;
  if (posting && billTotals(form.lines.map(lineNumbers)).total <= 0) return BILL_MESSAGES.empty;
  return null;
}

/** What the form says when the bill was saved as a draft but posting it was refused. */
export function savedNotPosted(error: string): string {
  if (error === WRITE_FAILED) return 'The bill was saved as a draft, but posting it failed. Please try again.';
  return `The bill was saved as a draft, but it was not posted. ${error}`;
}
