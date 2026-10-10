import { describe, expect, it } from 'vitest';
import {
  type BillForm,
  billFormError,
  billFormFromDetail,
  billPayload,
  defaultDueDate,
  emptyLine,
  lineNumbers,
  newBillForm,
  savedNotPosted,
  withBillDate,
  withDueDate,
  withProduct,
  withSupplier,
} from '@/lib/finance/bill-form';
import { billTotals } from '@/lib/finance/bill-math';
import { WRITE_FAILED } from '@/lib/finance/result';
import { BILL_MESSAGES, type BillDetail, saveBillInput } from '@/lib/finance/bills';
import type { FinanceProduct } from '@/lib/finance/products';

const BILL = '33333333-3333-4333-8333-333333333333';
const SUPPLIER = '44444444-4444-4444-8444-444444444444';
const PRODUCT = '99999999-9999-4999-8999-999999999999';
const today = '2026-10-11';

const gloves: FinanceProduct = {
  id: PRODUCT,
  sku: 'PRD-010',
  name: 'Nitrile Gloves (Box)',
  type: 'product',
  category: 'Consumables',
  uom: 'box',
  price: 24.9,
  cost: 12.5,
  sst_rate: 6,
  active: true,
};

/** A form that can be saved: a supplier and one line of 10 at RM 12.50. */
const filled = (f: Partial<BillForm> = {}): BillForm => ({
  ...newBillForm(today, 'k1'),
  supplier_id: SUPPLIER,
  due_date: '2026-11-10',
  lines: [{ ...emptyLine('k1'), description: 'Gloves', quantity: '10', unit_price: '12.50' }],
  ...f,
});

describe('newBillForm', () => {
  it('is dated today with one empty line of quantity 1 and no SST', () => {
    expect(newBillForm(today, 'k1')).toEqual({
      supplier_id: '',
      supplier_ref: '',
      bill_date: today,
      due_date: today,
      dueEdited: false,
      notes: '',
      lines: [{ key: 'k1', product_id: '', description: '', quantity: '1', uom: '', pack_size: '', unit_price: '', sst_rate: '0' }],
    });
  });
});

describe('the due date', () => {
  const supplier = { id: SUPPLIER, payment_terms_days: 30 };

  it('is the bill date plus the supplier’s terms', () => {
    expect(defaultDueDate('2026-10-11', 30)).toBe('2026-11-10');
    expect(defaultDueDate('2026-10-11', 0)).toBe('2026-10-11');
    expect(defaultDueDate('2026-10-11', undefined)).toBe('2026-10-11');
  });
  it('follows the supplier and the bill date', () => {
    const chosen = withSupplier(newBillForm(today, 'k1'), supplier);
    expect(chosen).toMatchObject({ supplier_id: SUPPLIER, due_date: '2026-11-10', dueEdited: false });
    expect(withBillDate(chosen, '2026-12-15', 30)).toMatchObject({ bill_date: '2026-12-15', due_date: '2027-01-14' });
    expect(withSupplier(chosen, { id: 'other', payment_terms_days: 7 }).due_date).toBe('2026-10-18');
  });
  it('stops following once the person sets it by hand', () => {
    const edited = withDueDate(withSupplier(newBillForm(today, 'k1'), supplier), '2026-10-25');
    expect(edited).toMatchObject({ due_date: '2026-10-25', dueEdited: true });
    expect(withBillDate(edited, '2026-10-12', 30).due_date).toBe('2026-10-25');
    expect(withSupplier(edited, { id: 'other', payment_terms_days: 7 })).toMatchObject({ supplier_id: 'other', due_date: '2026-10-25' });
  });
  it('stays where it was while the bill date is half typed or cleared', () => {
    const chosen = withSupplier(newBillForm(today, 'k1'), supplier);
    expect(withBillDate(chosen, '', 30)).toMatchObject({ bill_date: '', due_date: '2026-11-10' });
    expect(withBillDate(chosen, '0002-10-11', 30).due_date).toBe('2026-11-10');
  });
});

describe('withProduct', () => {
  const line = { ...emptyLine('k1'), description: 'typed by hand', quantity: '4', unit_price: '9', pack_size: '100 pcs' };

  it('fills description, unit, unit price from the product’s cost, and SST, keeping the quantity', () => {
    expect(withProduct(line, gloves)).toEqual({
      key: 'k1',
      product_id: PRODUCT,
      description: 'Nitrile Gloves (Box)',
      quantity: '4',
      uom: 'box',
      pack_size: '100 pcs',
      unit_price: '12.5',
      sst_rate: '6',
    });
  });
  it('only clears the link when "no product" is chosen', () => {
    const linked = withProduct(line, gloves);
    expect(withProduct(linked, null)).toEqual({ ...linked, product_id: '' });
  });
});

describe('lineNumbers', () => {
  it('reads the boxes as numbers, with an empty SST box as 0', () => {
    expect(lineNumbers({ ...emptyLine('k'), quantity: '2.5', unit_price: '10', sst_rate: '' })).toEqual({ quantity: 2.5, unit_price: 10, sst_rate: 0 });
  });
  it('rounds the SST rate to two decimals, so what is sent is what the total was worked out with', () => {
    expect(lineNumbers({ ...emptyLine('k'), sst_rate: '1.005' }).sst_rate).toBe(1.01);
    expect(lineNumbers({ ...emptyLine('k'), sst_rate: '0.145' }).sst_rate).toBe(0.15);
    expect(lineNumbers({ ...emptyLine('k'), sst_rate: '6' }).sst_rate).toBe(6);
  });
  it('gives NaN for a box that is not a number, which the total counts as nothing', () => {
    const numbers = lineNumbers({ ...emptyLine('k'), quantity: '1,000', unit_price: '', sst_rate: 'six' });
    expect([numbers.quantity, numbers.unit_price, numbers.sst_rate].every(Number.isNaN)).toBe(true);
    expect(billTotals([numbers])).toEqual({ subtotal: 0, sst: 0, total: 0 });
  });
});

describe('billFormError', () => {
  it('passes a form that can be saved', () => {
    expect(billFormError(filled())).toBeNull();
  });
  it('asks for a supplier first', () => {
    expect(billFormError(filled({ supplier_id: '' }))).toBe('Choose a supplier.');
  });
  it('asks for real dates, the due date not before the bill date', () => {
    expect(billFormError(filled({ bill_date: '' }))).toBe('Enter a valid date.');
    expect(billFormError(filled({ due_date: '20261-11-10' }))).toBe('Enter a valid date.');
    expect(billFormError(filled({ due_date: '2026-10-10' }))).toBe('The due date cannot be before the bill date.');
  });
  it('checks each line in the schema’s words', () => {
    const line = filled().lines[0];
    const withLine = (l: Partial<typeof line>) => filled({ lines: [{ ...line, ...l }] });
    expect(billFormError(withLine({ description: '  ' }))).toBe('Describe each line.');
    expect(billFormError(withLine({ quantity: '' }))).toBe('Enter a quantity above 0.');
    expect(billFormError(withLine({ quantity: '0' }))).toBe('Enter a quantity above 0.');
    expect(billFormError(withLine({ unit_price: '' }))).toBe('Enter a unit price of 0 or more.');
    expect(billFormError(withLine({ unit_price: '-1' }))).toBe('Enter a unit price of 0 or more.');
    expect(billFormError(withLine({ sst_rate: '101' }))).toBe('Enter an SST rate between 0 and 100.');
    expect(billFormError(withLine({ sst_rate: '' }))).toBeNull();
    expect(billFormError(withLine({ description: 'x'.repeat(201) }))).toBe('That is too long. Keep it to 200 characters or fewer.');
  });
  it('refuses a figure typed with a comma rather than reading it as a smaller number', () => {
    const line = filled().lines[0];
    expect(billFormError(filled({ lines: [{ ...line, unit_price: '1,250.00' }] }))).toBe('Enter a unit price of 0 or more.');
    expect(billFormError(filled({ lines: [{ ...line, quantity: '1,000' }] }))).toBe('Enter a quantity above 0.');
  });
  it('reports the second line when the first is fine', () => {
    const line = filled().lines[0];
    expect(billFormError(filled({ lines: [line, { ...emptyLine('k2'), unit_price: '5' }] }))).toBe('Describe each line.');
  });
  it('asks for at least one line, and at most 100', () => {
    const line = filled().lines[0];
    expect(billFormError(filled({ lines: [] }))).toBe('Add at least one line.');
    expect(billFormError(filled({ lines: Array.from({ length: 101 }, (_, i) => ({ ...line, key: `k${i}` })) }))).toBe(
      'A bill can have at most 100 lines.',
    );
  });
  it('lets a draft total nothing, but not a bill that is being posted', () => {
    const free = filled({ lines: [{ ...filled().lines[0], unit_price: '0' }] });
    expect(billFormError(free)).toBeNull();
    expect(billFormError(free, true)).toBe('A bill needs at least one line with an amount.');
    expect(billFormError(filled(), true)).toBeNull();
  });
});

describe('billPayload', () => {
  it('sends numbers, never the text that was typed, and no id for a new bill', () => {
    const payload = billPayload(
      filled({
        supplier_ref: ' INV 88 ',
        notes: '',
        lines: [{ key: 'k1', product_id: PRODUCT, description: ' Gloves ', quantity: '10', uom: 'box', pack_size: '', unit_price: '12.50', sst_rate: '6' }],
      }),
    );
    expect(payload).toEqual({
      supplier_id: SUPPLIER,
      supplier_ref: ' INV 88 ',
      bill_date: today,
      due_date: '2026-11-10',
      notes: '',
      lines: [{ product_id: PRODUCT, description: ' Gloves ', uom: 'box', pack_size: '', quantity: 10, unit_price: 12.5, sst_rate: 6 }],
    });
    expect('id' in payload).toBe(false);
    expect(saveBillInput.parse(payload)).toMatchObject({
      supplier_ref: 'INV 88',
      notes: null,
      lines: [{ product_id: PRODUCT, description: 'Gloves', uom: 'box', pack_size: null, quantity: 10, unit_price: 12.5, sst_rate: 6 }],
    });
  });
  it('sends the id when a draft is being changed', () => {
    expect(billPayload(filled({ id: BILL })).id).toBe(BILL);
  });
  it('never carries the line keys, the dueEdited flag or a workspace', () => {
    const payload = billPayload(filled({ id: BILL }));
    expect(Object.keys(payload).sort()).toEqual(['bill_date', 'due_date', 'id', 'lines', 'notes', 'supplier_id', 'supplier_ref']);
    expect(Object.keys(payload.lines[0]).sort()).toEqual(['description', 'pack_size', 'product_id', 'quantity', 'sst_rate', 'unit_price', 'uom']);
  });
});

describe('billFormFromDetail', () => {
  const detail: BillDetail = {
    id: BILL,
    bill_no: null,
    supplier_id: SUPPLIER,
    supplier_name: 'Lim Hardware',
    bill_date: '2026-10-01',
    due_date: '2026-10-15',
    total: 132.5,
    paid: 0,
    balance: 132.5,
    display_status: 'draft',
    supplier_ref: null,
    notes: 'urgent',
    lines: [
      { id: 'line-1', product_id: PRODUCT, description: 'Nitrile Gloves (Box)', quantity: 10, uom: 'box', pack_size: '100 pcs', unit_price: 12.5, sst_rate: 6, amount: 125, sst_amount: 7.5 },
      { id: 'line-2', product_id: null, description: 'Delivery', quantity: 1, uom: null, pack_size: null, unit_price: 0, sst_rate: 0, amount: 0, sst_amount: 0 },
    ],
  };

  it('shows a saved draft as it was saved, and keeps its due date', () => {
    const form = billFormFromDetail(detail);
    expect(form).toMatchObject({ id: BILL, supplier_id: SUPPLIER, supplier_ref: '', due_date: '2026-10-15', dueEdited: true, notes: 'urgent' });
    expect(form.lines).toEqual([
      { key: 'line-1', product_id: PRODUCT, description: 'Nitrile Gloves (Box)', quantity: '10', uom: 'box', pack_size: '100 pcs', unit_price: '12.5', sst_rate: '6' },
      { key: 'line-2', product_id: '', description: 'Delivery', quantity: '1', uom: '', pack_size: '', unit_price: '0', sst_rate: '0' },
    ]);
  });
  it('saves back what it loaded: nothing is lost by opening and saving a draft', () => {
    const form = billFormFromDetail(detail);
    expect(billFormError(form)).toBeNull();
    const parsed = saveBillInput.parse(billPayload(form));
    expect(parsed.id).toBe(BILL);
    expect(parsed.lines).toEqual([
      { product_id: PRODUCT, description: 'Nitrile Gloves (Box)', quantity: 10, uom: 'box', pack_size: '100 pcs', unit_price: 12.5, sst_rate: 6 },
      { product_id: null, description: 'Delivery', quantity: 1, uom: null, pack_size: null, unit_price: 0, sst_rate: 0 },
    ]);
    expect(billTotals(form.lines.map(lineNumbers))).toEqual({ subtotal: 125, sst: 7.5, total: 132.5 });
  });
});

describe('savedNotPosted', () => {
  it('says plainly that the draft was saved when the failure was the general one', () => {
    const text = savedNotPosted(WRITE_FAILED);
    expect(text).toBe('The bill was saved as a draft, but posting it failed. Please try again.');
    expect(text).not.toContain('could not be saved');
  });

  it('puts the reason after the fact that the draft was saved', () => {
    const text = savedNotPosted(BILL_MESSAGES.lines);
    expect(text).toBe(`The bill was saved as a draft, but it was not posted. ${BILL_MESSAGES.lines}`);
    expect(text).not.toContain('could not be saved');
  });
});
