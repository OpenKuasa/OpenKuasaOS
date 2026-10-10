import type { Slice } from '@/components/charts';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { createClient } from '@/lib/supabase/server';

/* ---- display shapes shared by the screens and their sample data ---- */

export type Stat = {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'flat';
  /** Trend line; live data has no history yet, so it is omitted there. */
  spark?: number[];
};

export type BillStatus = 'Paid' | 'Pending' | 'Overdue' | 'Draft';

export type Bill = {
  id: string;
  date: string;
  supplier: string;
  due: string;
  total: string;
  balance: string;
  status: BillStatus;
};

export type BillsView = {
  stats: Stat[];
  bySupplier: { label: string; value: number }[];
  byStatus: Slice[];
  bills: Bill[];
  billCount: number;
};

export type PaymentStatus = 'Paid' | 'Scheduled' | 'Pending';
export type PaymentMethod = 'Bank Transfer' | 'FPX' | 'Cash' | 'Cheque';

export type Payment = {
  id: string;
  date: string;
  supplier: string;
  bill: string;
  method: PaymentMethod;
  amount: string;
  status: PaymentStatus;
};

export type PaymentsView = {
  stats: Stat[];
  trend: { label: string; electronic: number; cash: number }[];
  byMethod: Slice[];
  paidMtd: string;
  payments: Payment[];
};

/* ---- rows as read from Supabase ---------------------------------- */

export type BillRow = {
  bill_no: string;
  supplier_name: string;
  bill_date: string;
  due_date: string;
  total: number;
  balance: number;
  display_status: 'draft' | 'pending' | 'overdue' | 'paid';
};

export type PaymentRow = {
  payment_no: string;
  paid_on: string;
  method: 'bank_transfer' | 'fpx' | 'cash' | 'cheque';
  amount: number;
  status: 'pending' | 'scheduled' | 'paid';
  supplier_bills: { bill_no: string; contacts: { name: string } };
};

const TABLE_ROWS = 10;

const METHODS: Record<PaymentRow['method'], PaymentMethod> = {
  bank_transfer: 'Bank Transfer',
  fpx: 'FPX',
  cash: 'Cash',
  cheque: 'Cheque',
};

const ELECTRONIC = new Set<PaymentRow['method']>(['bank_transfer', 'fpx']);

/* ---- formatting --------------------------------------------------- */

export function rm(n: number) {
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Short money for KPI cards: RM 2,600 / RM 12.7k. */
export function rmShort(n: number) {
  return n >= 10_000
    ? `RM ${(n / 1000).toFixed(1)}k`
    : `RM ${Math.round(n).toLocaleString('en-MY')}`;
}

// Fixed names: Intl's short months vary by ICU version ('Sep' vs 'Sept').
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-10-08 → 08 Oct 2026 */
function day(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function sum<T>(rows: T[], pick: (r: T) => number) {
  return rows.reduce((total, r) => total + pick(r), 0);
}

function capitalise<T extends string>(s: string) {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as T;
}

/* ---- view builders (pure; `today` is a UTC YYYY-MM-DD date) ------- */

export function billsView(bills: BillRow[], payments: PaymentRow[], today: string): BillsView {
  const open = bills.filter((b) => b.display_status === 'pending' || b.display_status === 'overdue');
  const overdue = open.filter((b) => b.display_status === 'overdue');
  const weekEnd = addDays(today, 7);
  const dueThisWeek = open.filter(
    (b) => b.display_status === 'pending' && b.due_date <= weekEnd,
  );
  const paidMtd = payments.filter(
    (p) => p.status === 'paid' && p.paid_on.slice(0, 7) === today.slice(0, 7),
  );

  const owed = new Map<string, number>();
  for (const b of open) owed.set(b.supplier_name, (owed.get(b.supplier_name) ?? 0) + b.balance);
  const bySupplier = [...owed]
    .map(([label, value]) => ({ label, value }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 5);

  const statusCount = (s: BillRow['display_status']) =>
    bills.filter((b) => b.display_status === s).length;

  return {
    stats: [
      { label: 'Total payable', value: rmShort(sum(open, (b) => b.balance)), delta: count(open.length, 'open bill'), deltaTone: 'flat' },
      { label: 'Due this week', value: rmShort(sum(dueThisWeek, (b) => b.balance)), delta: count(dueThisWeek.length, 'bill'), deltaTone: 'flat' },
      { label: 'Overdue', value: rmShort(sum(overdue, (b) => b.balance)), delta: count(overdue.length, 'bill'), deltaTone: overdue.length ? 'down' : 'flat' },
      { label: 'Paid (MTD)', value: rmShort(sum(paidMtd, (p) => p.amount)), delta: count(paidMtd.length, 'payment'), deltaTone: 'flat' },
    ],
    bySupplier,
    byStatus: [
      { key: 'pending', label: 'Pending', value: statusCount('pending'), color: 'var(--chart-1)' },
      { key: 'paid', label: 'Paid', value: statusCount('paid'), color: 'var(--chart-2)' },
      { key: 'overdue', label: 'Overdue', value: statusCount('overdue'), color: 'var(--chart-4)' },
      { key: 'draft', label: 'Draft', value: statusCount('draft'), color: 'var(--chart-3)' },
    ],
    bills: bills.slice(0, TABLE_ROWS).map((b) => ({
      id: b.bill_no,
      date: day(b.bill_date),
      supplier: b.supplier_name,
      due: day(b.due_date),
      total: rm(b.total),
      balance: rm(b.balance),
      status: capitalise<BillStatus>(b.display_status),
    })),
    billCount: bills.length,
  };
}

export function paymentsView(payments: PaymentRow[], today: string): PaymentsView {
  const month = today.slice(0, 7);
  const paid = payments.filter((p) => p.status === 'paid');
  const paidMtd = paid.filter((p) => p.paid_on.slice(0, 7) === month);
  const paidMtdTotal = sum(paidMtd, (p) => p.amount);
  const electronicMtd = sum(paidMtd.filter((p) => ELECTRONIC.has(p.method)), (p) => p.amount);
  const scheduled = payments.filter((p) => p.status !== 'paid');

  // Last 8 months, oldest first, in RM thousands.
  const [y, m] = month.split('-').map(Number);
  const trend = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(Date.UTC(y, m - 8 + i, 1));
    const key = start.toISOString().slice(0, 7);
    const inMonth = paid.filter((p) => p.paid_on.slice(0, 7) === key);
    const k = (rows: PaymentRow[]) => Math.round(sum(rows, (p) => p.amount) / 100) / 10;
    return {
      label: MONTHS[start.getUTCMonth()],
      electronic: k(inMonth.filter((p) => ELECTRONIC.has(p.method))),
      cash: k(inMonth.filter((p) => !ELECTRONIC.has(p.method))),
    };
  });

  const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];
  const byMethod = (Object.keys(METHODS) as PaymentRow['method'][]).map((method, i) => ({
    key: method,
    label: METHODS[method],
    value: Math.round(sum(paidMtd.filter((p) => p.method === method), (p) => p.amount) / 100) / 10,
    color: colors[i],
  }));

  return {
    stats: [
      { label: 'Paid (MTD)', value: rmShort(paidMtdTotal), delta: 'this month', deltaTone: 'flat' },
      { label: 'Payments', value: String(paidMtd.length), delta: 'this month', deltaTone: 'flat' },
      {
        label: 'Via bank / FPX',
        value: paidMtdTotal ? `${Math.round((electronicMtd / paidMtdTotal) * 100)}%` : '—',
        delta: 'of paid MTD',
        deltaTone: 'flat',
      },
      { label: 'Scheduled', value: rmShort(sum(scheduled, (p) => p.amount)), delta: count(scheduled.length, 'payment'), deltaTone: 'flat' },
    ],
    trend,
    byMethod,
    paidMtd: rmShort(paidMtdTotal),
    payments: payments.slice(0, TABLE_ROWS).map((p) => ({
      id: p.payment_no,
      date: day(p.paid_on),
      supplier: p.supplier_bills.contacts.name,
      bill: p.supplier_bills.bill_no,
      method: METHODS[p.method],
      amount: rm(p.amount),
      status: capitalise<PaymentStatus>(p.status),
    })),
  };
}

/* ---- loading ------------------------------------------------------ */

/**
 * The signed-in user's org, or null when the screen should show sample data:
 * Supabase not configured, signed out, or no org yet.
 */
async function liveOrg() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  const supabase = await createClient();
  const org = await getCurrentOrg(supabase);
  return org ? { supabase, orgId: org.orgId } : null;
}

type Live = NonNullable<Awaited<ReturnType<typeof liveOrg>>>;

// ponytail: loads every bill and payment and summarises in JS; move the
// summaries into SQL once an org has thousands of rows.
async function fetchBills({ supabase, orgId }: Live) {
  const { data, error } = await supabase
    .from('supplier_bill_totals')
    .select('bill_no, supplier_name, bill_date, due_date, total, balance, display_status')
    .eq('org_id', orgId)
    .neq('display_status', 'void')
    .order('bill_date', { ascending: false })
    .order('bill_no', { ascending: false });
  if (error) throw error;
  return data as BillRow[];
}

async function fetchPayments({ supabase, orgId }: Live) {
  const { data, error } = await supabase
    .from('payments_out')
    .select('payment_no, paid_on, method, amount, status, supplier_bills(bill_no, contacts:finance_contacts(name))')
    .eq('org_id', orgId)
    .order('paid_on', { ascending: false })
    .order('payment_no', { ascending: false });
  if (error) throw error;
  return data as unknown as PaymentRow[];
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function loadBillsView(): Promise<BillsView | null> {
  const live = await liveOrg();
  if (!live) return null;
  const [bills, payments] = await Promise.all([fetchBills(live), fetchPayments(live)]);
  return billsView(bills, payments, todayUtc());
}

export async function loadPaymentsView(): Promise<PaymentsView | null> {
  const live = await liveOrg();
  if (!live) return null;
  return paymentsView(await fetchPayments(live), todayUtc());
}
