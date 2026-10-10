import { timingSafeEqual } from 'node:crypto';

/**
 * Authorizes a scheduler request by the existing service-role key, sent as
 * `Authorization: Bearer <key>` or `x-service-key: <key>`. Constant-time compare;
 * an unset env key rejects everything. Never logs the key or the header.
 */
export function isTriggerAuthorized(req: Request): boolean {
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected) return false;
  const bearer = /^Bearer (.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  const provided = bearer ?? req.headers.get('x-service-key') ?? '';
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
