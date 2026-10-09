import { expect, test } from 'vitest';
import {
  activityHref,
  parseActivityFilters,
  periodStart,
} from '@/lib/account/activity';

test('filters default to every category over the last 30 days', () => {
  expect(parseActivityFilters({})).toEqual({ category: 'all', period: '30d' });
});

test('valid filters are kept', () => {
  expect(
    parseActivityFilters({
      category: 'security',
      period: '7d',
      before: '2026-10-01T08:15:30.123456+00:00',
    }),
  ).toEqual({
    category: 'security',
    period: '7d',
    before: '2026-10-01T08:15:30.123456+00:00',
  });
});

test('an invalid filter falls back without resetting the others', () => {
  expect(
    parseActivityFilters({
      category: 'nonsense',
      period: '90d',
      before: 'yesterday',
    }),
  ).toEqual({ category: 'all', period: '90d' });
  expect(
    parseActivityFilters({ category: ['auth', 'team'], period: '1y' }),
  ).toEqual({ category: 'all', period: '30d' });
});

test('periodStart counts back from now and is open-ended for all time', () => {
  const now = Date.parse('2026-10-10T00:00:00.000Z');
  expect(periodStart('7d', now)).toBe('2026-10-03T00:00:00.000Z');
  expect(periodStart('90d', now)).toBe('2026-07-12T00:00:00.000Z');
  expect(periodStart('all', now)).toBeNull();
});

test('activityHref omits defaults and encodes the cursor', () => {
  expect(activityHref({ category: 'all', period: '30d' })).toBe(
    '/account/activity',
  );
  const href = activityHref({
    category: 'team',
    period: 'all',
    before: '2026-10-01T08:15:30.123456+00:00',
  });
  expect(href).toBe(
    '/account/activity?category=team&period=all&before=2026-10-01T08%3A15%3A30.123456%2B00%3A00',
  );
  // The cursor survives a round trip through the URL.
  const params = Object.fromEntries(new URL(href, 'http://x').searchParams);
  expect(parseActivityFilters(params).before).toBe(
    '2026-10-01T08:15:30.123456+00:00',
  );
});
