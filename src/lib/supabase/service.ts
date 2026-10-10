import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS — only for the agent worker (the one
 * non-session actor). Never import from client code; never log or return the key.
 */
export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Service role is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
