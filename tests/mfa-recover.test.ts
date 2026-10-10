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

import { redeemRecoveryCodeAction } from '@/app/mfa/actions';
import { hashRecoveryCode } from '@/lib/auth/mfa';

type Options = {
  user?: { id: string } | null;
  levels?: { currentLevel: string; nextLevel: string };
  rpc?: { data: boolean | null; error: { message: string } | null };
};

function fakeClient(options: Options = {}) {
  const rpc = vi.fn(async (name: string, args: { p_hash: string }) => {
    void name;
    void args;
    return options.rpc ?? { data: true, error: null };
  });
  const refreshSession = vi.fn(async () => ({ data: {}, error: null }));
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user === undefined ? { id: 'u1' } : options.user },
      })),
      refreshSession,
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: options.levels ?? { currentLevel: 'aal1', nextLevel: 'aal2' },
        })),
        listFactors: vi.fn(async () => ({
          data: {
            all: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
          },
        })),
      },
    },
    rpc,
  };
  createClient.mockResolvedValue(client);
  return { client, rpc, refreshSession };
}

function form(code: string) {
  const data = new FormData();
  data.set('code', code);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('rejects input that cannot be a recovery code without calling Supabase', async () => {
  fakeClient();
  for (const code of ['', 'K7QMX', 'K7QMX-2HVB', 'K7QMX-2HVB0', '123456']) {
    const state = await redeemRecoveryCodeAction(undefined, form(code));
    expect(state?.error).toBe('Enter a recovery code like XXXXX-XXXXX.');
  }
  expect(createClient).not.toHaveBeenCalled();
});

test('a valid code refreshes the session, records the event and lands on Security', async () => {
  const { client, rpc, refreshSession } = fakeClient();
  await expect(
    redeemRecoveryCodeAction(undefined, form('K7QMX-2HVBD')),
  ).rejects.toThrow('REDIRECT /account/security?notice=recovered');

  expect(rpc).toHaveBeenCalledWith('redeem_recovery_code', {
    p_hash: hashRecoveryCode('K7QMX2HVBD'),
  });
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(recordEvent).toHaveBeenCalledWith(
    client,
    expect.objectContaining({
      action: 'Signed in with a recovery code',
      category: 'security',
      notify: expect.objectContaining({ to: 'self', event: 'security' }),
    }),
  );
});

test('case, spaces and dashes do not change the hash that is sent', async () => {
  const { rpc } = fakeClient();
  await expect(
    redeemRecoveryCodeAction(undefined, form('  k7qmx 2hvbd ')),
  ).rejects.toThrow('REDIRECT');
  expect(rpc.mock.calls[0][1]).toEqual({
    p_hash: hashRecoveryCode('K7QMX-2HVBD'),
  });
});

test('a wrong code stays on the page', async () => {
  const { refreshSession } = fakeClient({ rpc: { data: false, error: null } });
  const state = await redeemRecoveryCodeAction(undefined, form('K7QMX-2HVBD'));
  expect(state?.error).toBe('That recovery code is not right.');
  expect(refreshSession).not.toHaveBeenCalled();
  expect(recordEvent).not.toHaveBeenCalled();
});

test('the lockout exception becomes a plain sentence', async () => {
  fakeClient({
    rpc: { data: null, error: { message: 'Too many attempts; try later' } },
  });
  const state = await redeemRecoveryCodeAction(undefined, form('K7QMX-2HVBD'));
  expect(state?.error).toBe('Too many attempts. Try again in 15 minutes.');
});

test('other database errors never leak the raw message', async () => {
  fakeClient({
    rpc: { data: null, error: { message: 'permission denied for function' } },
  });
  const state = await redeemRecoveryCodeAction(undefined, form('K7QMX-2HVBD'));
  expect(state?.error).toBe(
    'Could not check that recovery code. Please try again.',
  );
});

test('an expired session is sent back to sign in', async () => {
  const { rpc } = fakeClient({ user: null });
  await expect(
    redeemRecoveryCodeAction(undefined, form('K7QMX-2HVBD')),
  ).rejects.toThrow('REDIRECT /login?notice=session_expired');
  expect(rpc).not.toHaveBeenCalled();
});

test('a session that owes no code cannot redeem one', async () => {
  const { rpc } = fakeClient({
    levels: { currentLevel: 'aal2', nextLevel: 'aal2' },
  });
  await expect(
    redeemRecoveryCodeAction(undefined, form('K7QMX-2HVBD')),
  ).rejects.toThrow('REDIRECT /command');
  expect(rpc).not.toHaveBeenCalled();
});
