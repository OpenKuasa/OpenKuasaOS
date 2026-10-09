import { beforeEach, expect, test, vi } from 'vitest';

// The actions need a request scope for the real client and for redirect();
// both are replaced so the flow can run offline.
const { createClient, recordEvent } = vi.hoisted(() => ({
  createClient: vi.fn(),
  recordEvent: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/lib/events', () => ({ recordEvent }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));

import { verifyMfaAction } from '@/app/mfa/actions';

type Options = {
  user?: { id: string } | null;
  levels?: { currentLevel: string; nextLevel: string };
  factors?: { id: string; factor_type: string; status: string }[];
  verify?: (args: { factorId: string; code: string }) => {
    error: { code?: string; status?: number } | null;
  };
};

function fakeClient(options: Options = {}) {
  const challengeAndVerify = vi.fn(
    async (args: { factorId: string; code: string }) =>
      options.verify?.(args) ?? { error: null },
  );
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user === undefined ? { id: 'u1' } : options.user },
      })),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: options.levels ?? { currentLevel: 'aal1', nextLevel: 'aal2' },
        })),
        listFactors: vi.fn(async () => ({
          data: {
            all: options.factors ?? [
              { id: 'factor-1', factor_type: 'totp', status: 'verified' },
            ],
          },
        })),
        challengeAndVerify,
      },
    },
  };
  createClient.mockResolvedValue(client);
  return { client, challengeAndVerify };
}

function form(code: string, extra: Record<string, string> = {}) {
  const data = new FormData();
  data.set('code', code);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('rejects anything that is not six digits without calling Supabase', async () => {
  fakeClient();
  for (const code of ['', '12345', '1234567', 'abcdef', '12 34 5']) {
    const state = await verifyMfaAction(undefined, form(code));
    expect(state?.error).toBe(
      'Enter the 6-digit code from your authenticator app.',
    );
  }
  expect(createClient).not.toHaveBeenCalled();
});

test('a correct code records the sign-in and goes to the app', async () => {
  const { client, challengeAndVerify } = fakeClient();
  await expect(verifyMfaAction(undefined, form('123 456'))).rejects.toThrow(
    'REDIRECT /command',
  );
  expect(challengeAndVerify).toHaveBeenCalledWith({
    factorId: 'factor-1',
    code: '123456',
  });
  expect(recordEvent).toHaveBeenCalledWith(client, {
    action: 'Signed in',
    category: 'auth',
  });
});

test('ignores a factor id sent by the form', async () => {
  const { challengeAndVerify } = fakeClient();
  await expect(
    verifyMfaAction(undefined, form('123456', { factorId: 'someone-else' })),
  ).rejects.toThrow('REDIRECT /command');
  expect(challengeAndVerify).toHaveBeenCalledTimes(1);
  expect(challengeAndVerify.mock.calls[0][0].factorId).toBe('factor-1');
});

test('a wrong code stays on the page with a friendly message', async () => {
  fakeClient({
    verify: () => ({ error: { code: 'mfa_verification_failed', status: 422 } }),
  });
  const state = await verifyMfaAction(undefined, form('000000'));
  expect(state?.error).toBe(
    'That code is not right. Check your authenticator app and try again.',
  );
  expect(recordEvent).not.toHaveBeenCalled();
});

test('rate limiting and unknown failures never leak the raw error', async () => {
  fakeClient({ verify: () => ({ error: { code: 'over_request_rate_limit' } }) });
  expect((await verifyMfaAction(undefined, form('000000')))?.error).toBe(
    'Too many attempts. Wait a moment and try again.',
  );

  fakeClient({ verify: () => ({ error: { code: 'unexpected_failure' } }) });
  expect((await verifyMfaAction(undefined, form('000000')))?.error).toBe(
    'Could not check that code. Please try again.',
  );
});

test('tries each verified authenticator until one accepts the code', async () => {
  const { challengeAndVerify } = fakeClient({
    factors: [
      { id: 'old-phone', factor_type: 'totp', status: 'verified' },
      { id: 'pending', factor_type: 'totp', status: 'unverified' },
      { id: 'new-phone', factor_type: 'totp', status: 'verified' },
    ],
    verify: ({ factorId }) =>
      factorId === 'new-phone'
        ? { error: null }
        : { error: { code: 'mfa_verification_failed' } },
  });
  await expect(verifyMfaAction(undefined, form('123456'))).rejects.toThrow(
    'REDIRECT /command',
  );
  expect(challengeAndVerify.mock.calls.map(([args]) => args.factorId)).toEqual([
    'old-phone',
    'new-phone',
  ]);
  expect(recordEvent).toHaveBeenCalledTimes(1);
});

test('an expired session is sent back to sign in', async () => {
  const { challengeAndVerify } = fakeClient({ user: null });
  await expect(verifyMfaAction(undefined, form('123456'))).rejects.toThrow(
    'REDIRECT /login?notice=session_expired',
  );
  expect(challengeAndVerify).not.toHaveBeenCalled();
});

test('a session that owes no code goes straight to the app', async () => {
  const { challengeAndVerify } = fakeClient({
    levels: { currentLevel: 'aal2', nextLevel: 'aal2' },
  });
  await expect(verifyMfaAction(undefined, form('123456'))).rejects.toThrow(
    'REDIRECT /command',
  );
  expect(challengeAndVerify).not.toHaveBeenCalled();
  expect(recordEvent).not.toHaveBeenCalled();
});
