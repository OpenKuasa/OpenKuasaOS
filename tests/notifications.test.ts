import { expect, test } from 'vitest';
import { isAppHref, relativeTime } from '@/lib/account/notifications';

const NOW = Date.parse('2026-10-10T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test('relativeTime uses minutes, hours, then days', () => {
  expect(relativeTime(ago(20_000), NOW)).toBe('Just now');
  expect(relativeTime(ago(2 * MINUTE), NOW)).toBe('2m ago');
  expect(relativeTime(ago(59 * MINUTE), NOW)).toBe('59m ago');
  expect(relativeTime(ago(3 * HOUR), NOW)).toBe('3h ago');
  expect(relativeTime(ago(4 * DAY), NOW)).toBe('4d ago');
});

test('relativeTime shows a date for old items and tolerates clock skew', () => {
  expect(relativeTime(ago(45 * DAY), NOW)).toMatch(/26 Aug 2026/);
  expect(relativeTime(ago(-5 * MINUTE), NOW)).toBe('Just now');
  expect(relativeTime('not a date', NOW)).toBe('');
});

test('isAppHref accepts only app-relative paths', () => {
  expect(isAppHref('/account/security')).toBe(true);
  expect(isAppHref('//evil.example')).toBe(false);
  expect(isAppHref('/\\evil.example')).toBe(false);
  expect(isAppHref('https://evil.example')).toBe(false);
  expect(isAppHref('javascript:alert(1)')).toBe(false);
  expect(isAppHref('account')).toBe(false);
  expect(isAppHref(null)).toBe(false);
});
