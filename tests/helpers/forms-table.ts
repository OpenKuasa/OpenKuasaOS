import type { SupabaseClient } from '@supabase/supabase-js';

/** The migration that creates `public.forms`. */
export const FORMS_MIGRATION = 'supabase/migrations/20261011120000_reach_forms.sql';

export const formsTableSkipReason =
  `public.forms does not exist in this database yet: apply ${FORMS_MIGRATION}, ` +
  'then run the lead forms database tests again. Skipping them until then.';

/** PostgREST "table not in the schema cache", and Postgres "undefined table". */
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return Boolean(error?.code && MISSING_TABLE_CODES.has(error.code));
}

/**
 * Whether `public.forms` is missing from the database the tests talk to, which
 * it is until the migration above has been applied. Any other outcome (rows,
 * no rows, a permission error) means the table is there.
 */
export async function formsTableMissing(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.from('forms').select('id').limit(1);
  return isMissingTable(error);
}
