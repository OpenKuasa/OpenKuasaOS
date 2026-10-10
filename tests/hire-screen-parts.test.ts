import { describe, expect, it } from 'vitest';
import { topSlices } from '@/screens/hire/parts';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `S${i}`, v: 10 - i }));
const slices = (n: number) =>
  topSlices(rows(n), (r) => r.v, (r) => r.name);
const total = (n: number) => rows(n).reduce((s, r) => s + r.v, 0);

describe('topSlices', () => {
  it.each([0, 1, 4])('keeps all %i rows', (n) => {
    const out = slices(n);
    expect(out).toHaveLength(n);
    expect(out.reduce((s, r) => s + r.value, 0)).toBe(total(n));
    expect(out.find((r) => r.key === 'other')).toBeUndefined();
  });

  it.each([5, 7])('folds %i rows into 3 plus Other', (n) => {
    const out = slices(n);
    expect(out).toHaveLength(4);
    expect(out[3]).toEqual({
      key: 'other',
      label: 'Other',
      value: rows(n).slice(3).reduce((s, r) => s + r.v, 0),
    });
    expect(out.reduce((s, r) => s + r.value, 0)).toBe(total(n));
  });
});
