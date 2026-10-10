import { describe, expect, it } from 'vitest';
import { average, bucketByMonth, bucketByWeek, percent, sumBy } from '@/lib/people/series';

type Row = { date: string | null; value: number };
const dateOf = (r: Row) => r.date;
const valueOf = (r: Row) => r.value;

describe('bucketByMonth', () => {
  it('returns exactly the months asked for, oldest first, zero-filled', () => {
    const rows: Row[] = [
      { date: '2026-10-02', value: 2 },
      { date: '2026-10-20', value: 1.25 },
      { date: '2026-08-15', value: 4 },
    ];
    const out = bucketByMonth(rows, dateOf, valueOf, '2026-10-09', 3);
    expect(out).toEqual([
      { start: '2026-08-01', label: 'Aug', value: 4 },
      { start: '2026-09-01', label: 'Sep', value: 0 },
      { start: '2026-10-01', label: 'Oct', value: 3.25 },
    ]);
  });

  it('ignores rows outside the window and rows with no date', () => {
    const rows: Row[] = [
      { date: '2026-06-30', value: 9 },
      { date: '2026-11-01', value: 9 },
      { date: null, value: 9 },
    ];
    expect(bucketByMonth(rows, dateOf, valueOf, '2026-10-09', 3).map((b) => b.value)).toEqual([0, 0, 0]);
  });

  it('crosses a year boundary', () => {
    const out = bucketByMonth([], dateOf, valueOf, '2026-01-15', 3);
    expect(out.map((b) => b.start)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01']);
    expect(out.map((b) => b.label)).toEqual(['Nov', 'Dec', 'Jan']);
  });

  it('rounds float sums to two decimals', () => {
    const rows: Row[] = [{ date: '2026-10-01', value: 0.1 }, { date: '2026-10-02', value: 0.2 }];
    expect(bucketByMonth(rows, dateOf, valueOf, '2026-10-09', 1)[0].value).toBe(0.3);
  });

  it('gives no buckets for no months', () => {
    expect(bucketByMonth([], dateOf, valueOf, '2026-10-09', 0)).toEqual([]);
  });
});

describe('bucketByWeek', () => {
  it('starts weeks on Monday and labels with the Monday', () => {
    // 2026-10-09 is a Friday; its week starts Monday the 5th.
    const rows: Row[] = [
      { date: '2026-10-04', value: 1 }, // Sunday: the week before
      { date: '2026-10-05', value: 2 },
      { date: '2026-10-09', value: 3 },
      { date: '2026-09-21', value: 7 },
    ];
    const out = bucketByWeek(rows, dateOf, valueOf, '2026-10-09', 3);
    expect(out).toEqual([
      { start: '2026-09-21', label: '21 Sep', value: 7 },
      { start: '2026-09-28', label: '28 Sep', value: 1 },
      { start: '2026-10-05', label: '05 Oct', value: 5 },
    ]);
  });

  it('ignores rows after this week and rows with no date', () => {
    const rows: Row[] = [{ date: '2026-10-12', value: 5 }, { date: null, value: 5 }];
    expect(bucketByWeek(rows, dateOf, valueOf, '2026-10-09', 2).map((b) => b.value)).toEqual([0, 0]);
  });
});

describe('sumBy', () => {
  it('orders by value then key, and drops null keys', () => {
    const rows = [
      { k: 'b', v: 2 }, { k: 'a', v: 2 }, { k: 'c', v: 5 }, { k: null, v: 100 }, { k: 'a', v: 0 },
    ];
    expect(sumBy(rows, (r) => r.k, (r) => r.v)).toEqual([
      { key: 'c', value: 5 },
      { key: 'a', value: 2 },
      { key: 'b', value: 2 },
    ]);
  });

  it('is empty for no rows', () => {
    expect(sumBy([], () => 'x', () => 1)).toEqual([]);
  });
});

describe('percent and average', () => {
  it('give null when there is nothing to divide by', () => {
    expect(percent(1, 0)).toBeNull();
    expect(percent(0, 0)).toBeNull();
    expect(average([])).toBeNull();
  });

  it('give whole percents and one-decimal means', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(average([4, 4.5, 5])).toBe(4.5);
    expect(average([1, 2, 2])).toBe(1.7);
  });
});
