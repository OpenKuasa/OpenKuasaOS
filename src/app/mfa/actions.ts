'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  getMfaStatus,
  hashRecoveryCode,
  isRecoveryCodeShape,
  safeNextPath,
} from '@/lib/auth/mfa';
import { recordEvent } from '@/lib/events';

export type MfaState = { error?: string } | undefined;

// With "limit AAL1 session duration" on, a session that waits too long at the
// second step is terminated; the user has to start over with their password.
const SESSION_EXPIRED_PATH = '/login?notice=session_expired';

const WRONG_CODE =
  'That code is not right. Check your authenticator app and try again.';
const SLOW_DOWN = 'Too many attempts. Wait a moment and try again.';

// Authenticator apps show the code as "123 456"; accept it either way.
const totpSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .pipe(
    z
      .string()
      .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.'),
  );

const recoverySchema = z
  .string()
  .trim()
  .refine(isRecoveryCodeShape, 'Enter a recovery code like XXXXX-XXXXX.');

function verifyErrorMessage(error: { code?: string; status?: number }): string {
  switch (error.code) {
    case 'mfa_verification_failed':
    case 'mfa_verification_rejected':
    case 'mfa_challenge_expired':
      return WRONG_CODE;
    case 'over_request_rate_limit':
      return SLOW_DOWN;
    default:
      return error.status === 429
        ? SLOW_DOWN
        : 'Could not check that code. Please try again.';
  }
}

// Second step of sign-in: check the authenticator code and lift the session
// to aal2.
export async function verifyMfaAction(
  _prev: MfaState,
  formData: FormData,
): Promise<MfaState> {
  const parsed = totpSchema.safeParse(String(formData.get('code') ?? ''));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const destination = safeNextPath(formData.get('next')) ?? '/command';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(SESSION_EXPIRED_PATH);

  // The factor always comes from the server, never from the form.
  const status = await getMfaStatus(supabase);
  if (!status.challengeRequired || status.factors.length === 0) {
    redirect(destination);
  }

  // Normally there is exactly one authenticator; if there are several, the
  // code only has to match one of them.
  let failure: string | undefined;
  for (const factor of status.factors) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: parsed.data,
    });
    failure = error ? verifyErrorMessage(error) : undefined;
    if (failure !== WRONG_CODE) break;
  }

  if (failure) {
    // The session may have been terminated while the form was open.
    const { data: after } = await supabase.auth.getUser();
    if (!after.user) redirect(SESSION_EXPIRED_PATH);
    return { error: failure };
  }

  await recordEvent(supabase, { action: 'Signed in', category: 'auth' });
  redirect(destination);
}

// Escape hatch for a lost phone: a one-time recovery code removes the
// authenticator (in the database), which leaves the session fully signed in.
export async function redeemRecoveryCodeAction(
  _prev: MfaState,
  formData: FormData,
): Promise<MfaState> {
  const parsed = recoverySchema.safeParse(String(formData.get('code') ?? ''));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(SESSION_EXPIRED_PATH);

  // Only a session that still owes a code may trade a recovery code for access.
  const status = await getMfaStatus(supabase);
  if (!status.challengeRequired) redirect('/command');

  const { data: redeemed, error } = await supabase.rpc('redeem_recovery_code', {
    p_hash: hashRecoveryCode(parsed.data),
  });
  if (error) {
    if (error.message.toLowerCase().includes('too many attempts')) {
      return { error: 'Too many attempts. Try again in 15 minutes.' };
    }
    const { data: after } = await supabase.auth.getUser();
    if (!after.user) redirect(SESSION_EXPIRED_PATH);
    return { error: 'Could not check that recovery code. Please try again.' };
  }
  if (redeemed !== true) {
    return { error: 'That recovery code is not right.' };
  }

  // The factor is gone; reissue the session so it no longer asks for a code.
  await supabase.auth.refreshSession();
  await recordEvent(supabase, {
    action: 'Signed in with a recovery code',
    category: 'security',
    notify: {
      to: 'self',
      event: 'security',
      title: 'A recovery code was used to sign in',
      body: 'Two-factor authentication is now off. Set it up again to stay protected.',
      href: '/account/security',
    },
  });
  redirect('/account/security?notice=recovered');
}
