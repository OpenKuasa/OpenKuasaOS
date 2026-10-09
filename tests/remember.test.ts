import { expect, test } from 'vitest';
import { isPersistent, sessionize } from '@/lib/supabase/remember';

// isPersistent: a missing or non-"0" cookie must stay persistent so existing
// sessions and the demo/sign-up flows are never downgraded by accident.
test('isPersistent defaults to persistent when the cookie is absent', () => {
  expect(isPersistent(undefined)).toBe(true);
});

test('isPersistent stays persistent for any value except "0"', () => {
  expect(isPersistent('1')).toBe(true);
  expect(isPersistent('yes')).toBe(true);
});

test('isPersistent opts out only on an explicit "0"', () => {
  expect(isPersistent('0')).toBe(false);
});

const options = {
  maxAge: 3600,
  expires: new Date(),
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: true,
};

test('sessionize returns options unchanged when persisting', () => {
  expect(sessionize(options, true)).toBe(options);
});

test('sessionize strips maxAge and expires when not persisting', () => {
  const out = sessionize(options, false);
  expect(out.maxAge).toBeUndefined();
  expect(out.expires).toBeUndefined();
});

test('sessionize preserves every other cookie option', () => {
  expect(sessionize(options, false)).toMatchObject({
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
  });
});

test('sessionize tolerates undefined options', () => {
  expect(sessionize(undefined, false)).toEqual({});
});
