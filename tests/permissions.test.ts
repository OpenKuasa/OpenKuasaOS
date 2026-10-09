import { expect, test } from 'vitest';
import { can, canSee } from '@/lib/auth/permissions';

test('billing and company edits are owner/admin only', () => {
  expect(can('owner', 'manage-billing')).toBe(true);
  expect(can('admin', 'manage-company')).toBe(true);
  expect(can('member', 'manage-billing')).toBe(false);
  expect(can('viewer', 'manage-company')).toBe(false);
});

test('developer settings and workspace deletion are owner only', () => {
  expect(can('owner', 'manage-developers')).toBe(true);
  expect(can('admin', 'manage-developers')).toBe(false);
  expect(can('admin', 'delete-workspace')).toBe(false);
});

test('members do not see screens outside their role', () => {
  const member = { role: 'member' as const, isDemo: false };
  expect(canSee(member, 'manage-billing')).toBe(false);
  expect(canSee(member, undefined)).toBe(true);
});

test('demo guests can look at every screen', () => {
  const guest = { role: 'viewer' as const, isDemo: true };
  expect(canSee(guest, 'manage-billing')).toBe(true);
  expect(canSee(guest, 'manage-developers')).toBe(true);
});
