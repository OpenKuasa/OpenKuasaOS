import type { SupabaseClient } from '@supabase/supabase-js';

/** Who is writing: the caller's own client (so RLS applies) and their workspace. */
export type FinanceWriteContext = { client: SupabaseClient; orgId: string };

export type FinResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const PG_UNIQUE = '23505';
export const PG_FOREIGN_KEY = '23503';
export const PG_CHECK = '23514';
/** Row-level security refused the write. */
export const PG_FORBIDDEN = '42501';
/** A number does not fit its column: quantity × unit price can overflow. */
export const PG_OUT_OF_RANGE = '22003';

export const WRITE_FAILED = 'That change could not be saved. Please try again.';
export const READ_FAILED = 'That could not be loaded. Please try again.';
export const NOT_ALLOWED = 'You do not have permission to make changes here.';
export const TOO_LARGE = 'That amount is too large.';

export function pgCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/** Logs the database error for triage; the person only ever sees the general message. */
export function writeFailed(fnName: string, error: unknown): { ok: false; error: string } {
  console.error(`[finance] ${fnName} failed:`, error);
  return { ok: false, error: WRITE_FAILED };
}
