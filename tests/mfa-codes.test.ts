import { expect, test } from 'vitest';
import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  hashRecoveryCode,
  isRecoveryCodeShape,
  mfaVerifyHref,
  normalizeRecoveryCode,
  safeNextPath,
} from '@/lib/auth/mfa';
import { totp } from './helpers/totp';

test('generates ten distinct, well-formed recovery codes', () => {
  const codes = generateRecoveryCodes();
  expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
  expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
  for (const code of codes) {
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    expect(isRecoveryCodeShape(code)).toBe(true);
  }
});

test('hashing ignores case, spaces and dashes', () => {
  const hash = hashRecoveryCode('K7QMX-2HVBD');
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(hashRecoveryCode(' k7qmx 2hvbd ')).toBe(hash);
  expect(normalizeRecoveryCode('k7qmx-2hvbd')).toBe('K7QMX2HVBD');
  expect(hashRecoveryCode('K7QMX-2HVBE')).not.toBe(hash);
});

test('rejects input that cannot be a recovery code', () => {
  expect(isRecoveryCodeShape('123456')).toBe(false);
  expect(isRecoveryCodeShape('K7QMX-2HVB0')).toBe(false);
  expect(isRecoveryCodeShape('')).toBe(false);
});

test('the test TOTP helper matches the RFC 6238 vector', () => {
  // RFC 6238 Appendix B, SHA-1, T = 59s: 94287082 → last six digits.
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  expect(totp(secret, 59_000)).toBe('287082');
});

test('only same-site paths survive as a post-verification destination', () => {
  expect(safeNextPath('/invite/abc')).toBe('/invite/abc');
  expect(safeNextPath('//evil.example')).toBeNull();
  expect(safeNextPath('https://evil.example')).toBeNull();
  expect(safeNextPath('/\\evil.example')).toBeNull();
  expect(safeNextPath(['/a', '/b'])).toBeNull();
  expect(mfaVerifyHref('/invite/abc')).toBe('/mfa/verify?next=%2Finvite%2Fabc');
  expect(mfaVerifyHref('https://evil.example')).toBe('/mfa/verify');
});
