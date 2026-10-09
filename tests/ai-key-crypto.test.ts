import { expect, test } from 'vitest';
import {
  decryptApiKey,
  encryptApiKey,
  hasKeySecret,
  isOpenRouterKeyShape,
  keyHint,
} from '@/lib/ai/key-crypto';

const env = { AI_KEYS_ENCRYPTION_SECRET: 'a-server-only-secret-of-32-characters-or-more' };
const key = 'sk-or-v1-0123456789abcdef0123456789abcdef';

test('a sealed key opens again under the same secret', () => {
  const sealed = encryptApiKey(key, env);
  expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  expect(sealed).not.toContain(key);
  expect(decryptApiKey(sealed, env)).toBe(key);
});

test('sealing the same key twice gives different ciphertext', () => {
  expect(encryptApiKey(key, env)).not.toBe(encryptApiKey(key, env));
});

test('a sealed key does not open under another secret or after tampering', () => {
  const sealed = encryptApiKey(key, env);
  const other = { AI_KEYS_ENCRYPTION_SECRET: 'another-server-secret-of-32-characters-or-more' };
  expect(decryptApiKey(sealed, other)).toBeNull();

  const parts = sealed.split('.');
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('AA') ? 'BB' : 'AA');
  expect(decryptApiKey(parts.join('.'), env)).toBeNull();
  expect(decryptApiKey('not-a-sealed-key', env)).toBeNull();
});

test('a missing or short secret means keys cannot be stored', () => {
  expect(hasKeySecret(env)).toBe(true);
  expect(hasKeySecret({})).toBe(false);
  expect(hasKeySecret({ AI_KEYS_ENCRYPTION_SECRET: 'too-short' })).toBe(false);
  expect(() => encryptApiKey(key, {})).toThrow();
  expect(decryptApiKey(encryptApiKey(key, env), {})).toBeNull();
});

test('recognises OpenRouter keys and only ever shows the last four characters', () => {
  expect(isOpenRouterKeyShape(key)).toBe(true);
  expect(isOpenRouterKeyShape(`  ${key}  `)).toBe(true);
  expect(isOpenRouterKeyShape('sk-ant-abcdefghijklmnopqrstuvwxyz')).toBe(false);
  expect(isOpenRouterKeyShape('sk-or-short')).toBe(false);
  expect(keyHint(key)).toBe('sk-or-…cdef');
});
