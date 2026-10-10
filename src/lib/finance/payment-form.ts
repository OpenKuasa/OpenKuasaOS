/**
 * The payment form's rules, kept out of the component so they can be tested:
 * which bills can still take a payment, what each defaults to, what is wrong
 * with the form, and what is sent to recordPaymentOutAction. Pure.
 */
import { BILL_MESSAGES, type BillListRow } from './bills';
import { typedNumber } from './format';
import {
  type FinanceAccount,
  MONEY_MESSAGES,
  type PaymentMethod,
  type PaymentOutRow,
  recordPaymentOutInput,
} from './money';

export type PayableBill = {
  id: string;
  bill_no: string;
  supplier_id: string;
  supplier_name: string;
  due_date: string;
  overdue: boolean;
  /** Still owed after every paid payment. */
  balance: number;
  /** Promised by payments that are scheduled but not yet paid. */
  scheduled: number;
  /** What a new payment may take: the balance less what is already scheduled. */
  payable: number;
};

export type PaymentForm = {
  supplierId: string;
  /** The ticked bills, each with the amount as typed. */
  amounts: Record<string, string>;
  accountId: string;
  date: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  /** False to pay now; true to schedule for later. */
  scheduled: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const sen = (n: number) => Math.round(n * 100);

/** A payment in one of these states has not paid the bill yet, but the database already counts it against the bill. */
const HOLDING: ReadonlySet<PaymentOutRow['status']> = new Set(['draft', 'pending_approval', 'scheduled']);

/**
 * The bills a payment can be recorded against: posted, not fully paid, and not
 * already covered by scheduled payments. The database refuses a payment for
 * more than balance − scheduled, so that is what the form offers.
 */
export function payableBills(bills: BillListRow[], payments: PaymentOutRow[]): PayableBill[] {
  const held = new Map<string, number>();
  for (const p of payments) {
    if (HOLDING.has(p.status)) held.set(p.bill_id, (held.get(p.bill_id) ?? 0) + p.amount);
  }
  return bills
    .filter((b) => (b.display_status === 'pending' || b.display_status === 'overdue') && b.balance > 0)
    .map((b) => {
      const scheduled = round2(held.get(b.id) ?? 0);
      return {
        id: b.id,
        bill_no: b.bill_no ?? '—',
        supplier_id: b.supplier_id,
        supplier_name: b.supplier_name,
        due_date: b.due_date,
        overdue: b.display_status === 'overdue',
        balance: b.balance,
        scheduled,
        payable: round2(b.balance - scheduled),
      };
    })
    .filter((b) => b.payable > 0)
    .sort(
      (x, y) =>
        x.supplier_name.localeCompare(y.supplier_name) ||
        x.due_date.localeCompare(y.due_date) ||
        x.bill_no.localeCompare(y.bill_no),
    );
}

/** The suppliers that have at least one bill to pay, by name. */
export function paymentSuppliers(payable: PayableBill[]): { id: string; name: string; bills: number }[] {
  const suppliers = new Map<string, { id: string; name: string; bills: number }>();
  for (const b of payable) {
    const entry = suppliers.get(b.supplier_id) ?? { id: b.supplier_id, name: b.supplier_name, bills: 0 };
    entry.bills += 1;
    suppliers.set(b.supplier_id, entry);
  }
  return [...suppliers.values()].sort((x, y) => x.name.localeCompare(y.name));
}

/** One supplier's payable bills, the earliest due first. */
export function billsOf(payable: PayableBill[], supplierId: string): PayableBill[] {
  return payable.filter((b) => b.supplier_id === supplierId);
}

/** 1200.5 → "1200.50", the way an amount box shows it. */
export function amountText(amount: number): string {
  return amount.toFixed(2);
}

/**
 * A fresh form. The account defaults to the first bank account. With
 * `preselect` (the Pay choice on a bill row) the supplier is chosen and that
 * bill ticked for all it can still take.
 */
export function newPaymentForm(
  payable: PayableBill[],
  accounts: FinanceAccount[],
  today: string,
  preselect?: { supplierId: string; billId: string },
): PaymentForm {
  const suppliers = paymentSuppliers(payable);
  const bill = preselect ? payable.find((b) => b.id === preselect.billId && b.supplier_id === preselect.supplierId) : undefined;
  return {
    supplierId: preselect?.supplierId ?? (suppliers.length === 1 ? suppliers[0].id : ''),
    amounts: bill ? { [bill.id]: amountText(bill.payable) } : {},
    accountId: (accounts.find((a) => a.kind === 'bank') ?? accounts[0])?.id ?? '',
    date: today,
    method: 'bank_transfer',
    reference: '',
    notes: '',
    scheduled: false,
  };
}

/** Choosing another supplier starts the ticks again: one payment pays one supplier. */
export function chooseSupplier(form: PaymentForm, supplierId: string): PaymentForm {
  return supplierId === form.supplierId ? form : { ...form, supplierId, amounts: {} };
}

/** Ticks a bill for all it can still take, or unticks it. */
export function toggleBill(form: PaymentForm, bill: PayableBill, ticked: boolean): PaymentForm {
  const amounts = { ...form.amounts };
  if (ticked) amounts[bill.id] = amountText(bill.payable);
  else delete amounts[bill.id];
  return { ...form, amounts };
}

/** Ticks every bill of the chosen supplier, or clears them all. */
export function toggleAll(form: PaymentForm, bills: PayableBill[], ticked: boolean): PaymentForm {
  return { ...form, amounts: ticked ? Object.fromEntries(bills.map((b) => [b.id, amountText(b.payable)])) : {} };
}

/** The running total: every ticked amount that is a number above 0. */
export function paymentTotal(form: PaymentForm): number {
  let total = 0;
  for (const text of Object.values(form.amounts)) {
    const amount = typedNumber(text);
    if (amount !== null && amount > 0) total += sen(amount);
  }
  return total / 100;
}

/** What is sent to recordPaymentOutAction. Amounts are numbers; a box that is not a number goes as NaN and is refused. */
export function paymentPayload(form: PaymentForm) {
  return {
    account_id: form.accountId,
    txn_date: form.date,
    method: form.method,
    reference: form.reference,
    notes: form.notes,
    scheduled: form.scheduled,
    allocations: Object.entries(form.amounts).map(([bill_id, text]) => ({
      bill_id,
      amount: typedNumber(text) ?? Number.NaN,
    })),
  };
}

/**
 * The first thing wrong with the form, in the sentence the schema or the
 * database would use, or null when it can be sent.
 */
export function paymentFormError(form: PaymentForm, payable: PayableBill[]): string | null {
  if (!form.supplierId) return BILL_MESSAGES.supplier;
  const ticked = Object.entries(form.amounts);
  if (ticked.length === 0) return MONEY_MESSAGES.bills;
  for (const [billId, text] of ticked) {
    const amount = typedNumber(text);
    if (amount === null || sen(amount) <= 0) return MONEY_MESSAGES.amount;
    const bill = payable.find((b) => b.id === billId && b.supplier_id === form.supplierId);
    // A bill that is no longer payable was paid or voided since the form opened.
    if (!bill || sen(amount) > sen(bill.payable)) return MONEY_MESSAGES.tooMuch;
  }
  const parsed = recordPaymentOutInput.safeParse(paymentPayload(form));
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? MONEY_MESSAGES.amount);
}
