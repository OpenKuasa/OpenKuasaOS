import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingTable } from './forms-table';

/** The migration that creates `public.form_submissions` and the public form functions. */
export const FORM_SUBMISSIONS_MIGRATION =
  'supabase/migrations/20261012110000_reach_form_submissions.sql';

export const formSubmissionsSkipReason =
  'public.form_submissions or the public form functions do not exist in this database yet: ' +
  `apply ${FORM_SUBMISSIONS_MIGRATION}, then run the public lead forms database tests again. ` +
  'Skipping them until then.';

/** PostgREST "function not in the schema cache", and Postgres "undefined function". */
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

export function isMissingFunction(error: { code?: string } | null | undefined): boolean {
  return Boolean(error?.code && MISSING_FUNCTION_CODES.has(error.code));
}

/**
 * Whether the public lead forms migration is missing from the database the
 * tests talk to. `client` must be signed in: a visitor is refused the table
 * either way, which says nothing about whether it exists.
 */
export async function formSubmissionsMissing(client: SupabaseClient): Promise<boolean> {
  const table = await client.from('form_submissions').select('id').limit(1);
  if (isMissingTable(table.error)) return true;
  const fn = await client.rpc('get_public_form', {
    p_form_id: '00000000-0000-4000-8000-000000000000',
  });
  return isMissingFunction(fn.error);
}
