import { expect, it } from 'vitest';
import { rm, rmShort } from '@/lib/finance/format';

it('formats ringgit with two decimals and thousands separators', () => {
  expect(rm(1240)).toBe('RM 1,240.00');
  expect(rm(0)).toBe('RM 0.00');
  expect(rm(14.5)).toBe('RM 14.50');
});

it('shortens large amounts for KPI cards', () => {
  expect(rmShort(2600)).toBe('RM 2,600');
  expect(rmShort(12700)).toBe('RM 12.7k');
  expect(rmShort(0)).toBe('RM 0');
});
