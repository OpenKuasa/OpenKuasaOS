/**
 * Encryption for workspace OpenRouter keys (bring-your-own-key).
 *
 * Keys are sealed with AES-256-GCM under a server-only secret
 * (`AI_KEYS_ENCRYPTION_SECRET`) before they are stored, so what sits in the
 * database is useless without this server. Nothing here ever logs a key.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

type EnvLike = Record<string, string | undefined>;

const VERSION = 'v1';
const MIN_SECRET_LENGTH = 32;

/** True when the server can seal and open workspace keys. */
export function hasKeySecret(env: EnvLike = process.env): boolean {
  return (env.AI_KEYS_ENCRYPTION_SECRET?.trim().length ?? 0) >= MIN_SECRET_LENGTH;
}

function secretKey(env: EnvLike): Buffer {
  const secret = env.AI_KEYS_ENCRYPTION_SECRET?.trim() ?? '';
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error('AI_KEYS_ENCRYPTION_SECRET is not set (32+ characters).');
  }
  return createHash('sha256').update(secret).digest();
}

/** Seals a key as `v1.<iv>.<tag>.<ciphertext>` (base64url parts). */
export function encryptApiKey(apiKey: string, env: EnvLike = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(env), iv);
  const sealed = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), sealed]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Opens a sealed key; returns null if it is malformed, tampered with, or sealed under another secret. */
export function decryptApiKey(
  sealed: string,
  env: EnvLike = process.env,
): string | null {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      secretKey(env),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/** OpenRouter keys look like `sk-or-v1-…`; a cheap check before any network call. */
export function isOpenRouterKeyShape(input: string): boolean {
  return /^sk-or-[A-Za-z0-9_-]{16,300}$/.test(input.trim());
}

/** What we show back to people: never more than the last four characters. */
export function keyHint(apiKey: string): string {
  return `sk-or-…${apiKey.trim().slice(-4)}`;
}
