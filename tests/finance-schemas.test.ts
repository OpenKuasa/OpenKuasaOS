import { describe, expect, it } from 'vitest';
import { saveBillInput } from '@/lib/finance/bills';
import { createContactInput, updateContactInput } from '@/lib/finance/contacts';
import { markPaymentPaidInput, recordPaymentOutInput } from '@/lib/finance/money';
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
  ['markPaymentPaidInput', markPaymentPaidInput, { id: ID, paid_on: '2026-10-09' }],
];

describe('finance schemas parse their own output unchanged', () => {
  for (const [name, schema, input] of cases) {
    it(name, () => {
      const once = schema.parse(input);
      expect(schema.parse(once)).toEqual(once);
    });
  }
});
