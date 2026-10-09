import { expect, test } from 'vitest';
import { billsView, paymentsView, type BillRow, type PaymentRow } from '@/lib/finance/purchases';

const today = '2026-10-09';

const bill = (b: Partial<BillRow>): BillRow => ({
  bill_no: 'BILL-1',
  supplier_name: 'Lim Hardware',
  bill_date: '2026-10-01',
  due_date: '2026-10-31',
  total: 100,
  balance: 100,
  display_status: 'pending',
  ...b,
});

const payment = (p: Partial<PaymentRow>): PaymentRow => ({
  payment_no: 'PAY-1',
  paid_on: '2026-10-05',
  method: 'fpx',
  amount: 100,
  status: 'paid',
  supplier_bills: { bill_no: 'BILL-1', contacts: { name: 'Lim Hardware' } },
  ...p,
});

test('bill cards sum open balances, this week, overdue and paid this month', () => {
  const view = billsView(
    [
      bill({ bill_no: 'B1', balance: 2600, due_date: '2026-10-13' }),
      bill({ bill_no: 'B2', balance: 4300, supplier_name: 'Maju Jaya', due_date: '2026-11-01' }),
      bill({ bill_no: 'B3', balance: 1800, display_status: 'overdue', due_date: '2026-10-04' }),
      bill({ bill_no: 'B4', balance: 0, display_status: 'paid' }),
      bill({ bill_no: 'B5', balance: 780, display_status: 'draft' }),
    ],
    [payment({ amount: 1450 }), payment({ amount: 500, paid_on: '2026-09-30' })],
    today,
  );

  expect(view.stats.map((s) => [s.value, s.delta])).toEqual([
    ['RM 8,700', '3 open bills'],
    ['RM 2,600', '1 bill'],
    ['RM 1,800', '1 bill'],
    ['RM 1,450', '1 payment'],
  ]);
  // Draft and paid bills owe nothing yet; Lim Hardware has two open bills.
  expect(view.bySupplier).toEqual([
    { label: 'Lim Hardware', value: 4400 },
    { label: 'Maju Jaya', value: 4300 },
  ]);
  expect(view.byStatus.map((s) => s.value)).toEqual([2, 1, 1, 1]);
  expect(view.bills[0]).toMatchObject({ id: 'B1', due: '13 Oct 2026', balance: 'RM 2,600.00', status: 'Pending' });
});

test('payment cards count only paid money; trend covers the last 8 months', () => {
  const view = paymentsView(
    [
      payment({ amount: 3000, method: 'bank_transfer' }),
      payment({ amount: 1000, method: 'cash' }),
      payment({ amount: 4300, status: 'scheduled', paid_on: '2026-10-14' }),
      payment({ amount: 2500, paid_on: '2026-03-02' }),
      payment({ amount: 999, paid_on: '2026-02-27' }), // older than 8 months
    ],
    today,
  );

  expect(view.stats.map((s) => s.value)).toEqual(['RM 4,000', '2', '75%', 'RM 4,300']);
  expect(view.trend.map((t) => t.label)).toEqual(['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
  expect(view.trend[0]).toEqual({ label: 'Mar', electronic: 2.5, cash: 0 });
  expect(view.trend[7]).toEqual({ label: 'Oct', electronic: 3, cash: 1 });
  expect(view.byMethod.map((m) => m.value)).toEqual([3, 0, 1, 0]);
});
