import { expect, test } from 'vitest';
import { filterRows } from '@/components/screen/table-filter';

const rows = [
  { no: 'INV-1', customer: 'Lim Hardware', status: 'Paid' },
  { no: 'INV-2', customer: 'Aisyah Trading', status: 'Overdue' },
  { no: 'INV-3', customer: 'Lim Hardware', status: 'Overdue' },
];
const text = (r: (typeof rows)[number]) => `${r.no} ${r.customer}`;
const nos = (list: typeof rows) => list.map((r) => r.no);

test('search ignores case and surrounding spaces; every dropdown must match', () => {
  expect(nos(filterRows(rows, '', text))).toEqual(['INV-1', 'INV-2', 'INV-3']);
  expect(nos(filterRows(rows, '  lim ', text))).toEqual(['INV-1', 'INV-3']);
  expect(nos(filterRows(rows, '', text, { status: 'Overdue' }))).toEqual(['INV-2', 'INV-3']);
  expect(nos(filterRows(rows, 'lim', text, { status: 'Overdue', customer: 'all' }))).toEqual(['INV-3']);
  expect(filterRows(rows, 'xyz', text)).toEqual([]);
});
