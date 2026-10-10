import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A client that carries no session at all, whoever is asking. Reading a
 * public page (a form, a job board) must not depend on who happens to be
 * signed in.
 */
export function createAnonymousClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
