import { describe, expect, it } from 'vitest';
import { billIdInput, saveBillInput } from '@/lib/finance/bills';
import { createContactInput, updateContactInput } from '@/lib/finance/contacts';
import { markPaymentPaidInput, paymentIdInput, recordPaymentOutInput } from '@/lib/finance/money';
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
  ['saveBillInput (smallest quantity)', saveBillInput, {
    supplier_id: ID, bill_date: '2026-10-01', due_date: '2026-10-31', supplier_ref: ' ', notes: '',
    lines: [{ description: ' Gloves ', quantity: 0.0005, unit_price: 0.123456, uom: '', product_id: '' }],
  }],
  ['recordPaymentOutInput (smallest amount)', recordPaymentOutInput, {
    account_id: ID, txn_date: '2026-10-05', method: 'fpx', reference: ' ',
    allocations: [{ bill_id: ID, amount: 0.005 }],
  }],
  ['markPaymentPaidInput', markPaymentPaidInput, { id: ID, paid_on: '2026-10-09' }],
  ['billIdInput', billIdInput, { id: ID }],
  ['paymentIdInput', paymentIdInput, { id: ID }],
  ['saveBillInput (a draft being changed, with a product)', saveBillInput, {
    id: ID, supplier_id: ID, bill_date: '2026-10-01', due_date: '2026-10-01', supplier_ref: ' INV 88 ', notes: ' urgent ',
    lines: [{ product_id: ID, description: 'Ink', quantity: 2, uom: ' box ', unit_price: 14.5, sst_rate: 6 }],
  }],
  ['recordPaymentOutInput (scheduled, two bills)', recordPaymentOutInput, {
    account_id: ID, txn_date: '2026-10-20', method: 'cheque', reference: ' CHQ 001 ', notes: '', scheduled: true,
    allocations: [{ bill_id: ID, amount: 10.005 }, { bill_id: '22222222-2222-4222-8222-222222222222', amount: 5 }],
  }],
];

describe('finance schemas parse their own output unchanged', () => {
  for (const [name, schema, input] of cases) {
    it(name, () => {
      const once = schema.parse(input);
      expect(schema.parse(once)).toEqual(once);
    });
  }
});
