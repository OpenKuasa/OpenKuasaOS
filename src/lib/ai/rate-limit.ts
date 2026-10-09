/**
 * Durable per-user/day quota for live Ask-Jebat calls, backed by a Postgres
 * `consume_ai_quota` RPC (see supabase/migrations). Confirm-email is off, so a
 * signed-in account is cheap to create — this is the server-side backstop, on
 * top of the spend limit set on the OpenRouter key.
 *
 * Fail-open by design: if the RPC is not yet deployed we log and allow, so the
 * feature is never bricked by a missing migration. The key's spend limit remains
 * the hard ceiling.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const DAILY_CHAT_LIMIT = 50;

export type QuotaResult = { allowed: boolean; remaining: number | null };

export async function consumeDailyQuota(
  supabase: SupabaseClient,
  limit: number = DAILY_CHAT_LIMIT,
): Promise<QuotaResult> {
  const { data, error } = await supabase.rpc('consume_ai_quota', { daily_limit: limit });
  if (error) {
    console.warn('[ask-jebat] consume_ai_quota unavailable, allowing request:', error.message);
    return { allowed: true, remaining: null };
  }
  const remaining = typeof data === 'number' ? data : -1;
  return { allowed: remaining >= 0, remaining };
}
