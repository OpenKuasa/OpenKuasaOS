import { expect, test } from 'vitest';
import {
  RATE_LIMIT_ERROR,
  WRONG_CODE_ERROR,
  factorIdSchema,
  formatSecret,
  mfaVerifyErrorMessage,
  qrImageSrc,
  recoveryCodesFileText,
  totpCodeSchema,
} from '@/components/account/mfa-helpers';

test('accepts exactly six digits, ignoring pasted spaces', () => {
  expect(totpCodeSchema.parse('123456')).toBe('123456');
  expect(totpCodeSchema.parse(' 123 456 ')).toBe('123456');
  for (const bad of ['', '12345', '1234567', '12345a']) {
    expect(totpCodeSchema.safeParse(bad).success).toBe(false);
  }
});

test('factor ids must be UUIDs', () => {
  expect(
    factorIdSchema.safeParse('3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b').success,
  ).toBe(true);
  expect(factorIdSchema.safeParse('not-a-factor').success).toBe(false);
  expect(factorIdSchema.safeParse('').success).toBe(false);
});

test('wrong and expired codes get the same friendly sentence', () => {
  expect(mfaVerifyErrorMessage({ code: 'mfa_verification_failed' })).toBe(
    WRONG_CODE_ERROR,
  );
  expect(mfaVerifyErrorMessage({ code: 'mfa_challenge_expired' })).toBe(
    WRONG_CODE_ERROR,
  );
  expect(mfaVerifyErrorMessage({ message: 'Invalid TOTP code entered' })).toBe(
    WRONG_CODE_ERROR,
  );
});

test('rate limits and unknown errors never leak the raw message', () => {
  expect(mfaVerifyErrorMessage({ status: 429 })).toBe(RATE_LIMIT_ERROR);
  expect(mfaVerifyErrorMessage({ code: 'over_request_rate_limit' })).toBe(
    RATE_LIMIT_ERROR,
  );
  const shown = mfaVerifyErrorMessage({
    message: 'pq: connection refused at 10.0.0.4',
    status: 500,
  });
  expect(shown).not.toContain('pq');
  expect(mfaVerifyErrorMessage(null, 'Fallback.')).toBe('Fallback.');
});

test('re-encodes the raw SVG so a # cannot truncate the QR image', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>';
  const src = qrImageSrc(`data:image/svg+xml;utf-8,${svg}`);
  expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
  expect(src).not.toContain('#');
  expect(decodeURIComponent(src.slice(src.indexOf(',') + 1))).toBe(svg);

  const base64 = 'data:image/svg+xml;base64,PHN2Zy8+';
  expect(qrImageSrc(base64)).toBe(base64);
  expect(qrImageSrc('https://example.com/qr.png')).toBe(
    'https://example.com/qr.png',
  );
});

test('groups the setup key in fours', () => {
  expect(formatSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  expect(formatSecret('')).toBe('');
});

test('the download lists every code and says how they behave', () => {
  const codes = ['K7QMX-2HVBD', 'P3RST-9WXYZ'];
  const text = recoveryCodesFileText(codes);
  for (const code of codes) expect(text.split('\n')).toContain(code);
  expect(text).toContain('Each code works once');
  expect(text).toContain('turns two-factor authentication off');
});
