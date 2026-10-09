import { expect, test, vi } from 'vitest';

// viewer.ts imports the server Supabase client, which needs a request scope.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { initialsOf, toViewer } from '@/lib/auth/viewer';

const org = { name: 'Acme Sdn Bhd', role: 'owner' as const };

test('uses full_name from user metadata when present', () => {
  const viewer = toViewer(
    { email: 'siti@acme.my', user_metadata: { full_name: ' Siti Aminah ' } },
    org,
  );
  expect(viewer).toEqual({
    name: 'Siti Aminah',
    email: 'siti@acme.my',
    initials: 'SA',
    orgName: 'Acme Sdn Bhd',
    role: 'owner',
    isDemo: false,
  });
});

test('falls back to the email local part when no name is set', () => {
  const viewer = toViewer({ email: 'siti@acme.my', user_metadata: {} }, org);
  expect(viewer.name).toBe('siti');
  expect(viewer.initials).toBe('S');
});

test('labels anonymous demo sessions as a demo guest', () => {
  const viewer = toViewer({ email: '', is_anonymous: true }, org);
  expect(viewer.name).toBe('Demo guest');
  expect(viewer.email).toBeNull();
  expect(viewer.isDemo).toBe(true);
});

test('initialsOf takes at most two words and never returns empty', () => {
  expect(initialsOf('ahmad zaki bin ali')).toBe('AZ');
  expect(initialsOf('   ')).toBe('?');
});
