import { redirect } from 'next/navigation';
import { getMfaStatus } from '@/lib/auth/mfa';
import { hasSupabaseEnv } from '@/lib/auth/viewer';
import { createClient } from '@/lib/supabase/server';

/**
 * Page guard for the second sign-in step. These pages sit outside the gated
 * layouts (`getViewer()` would redirect back here forever), so they check the
 * session themselves: signed-out visitors go to /login, and anyone who does
 * not owe a code goes on to the app.
 */
export async function requireMfaChallenge(next?: string | null): Promise<void> {
  if (!hasSupabaseEnv()) redirect('/command');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const status = await getMfaStatus(supabase);
  if (!status.challengeRequired || status.factors.length === 0) {
    redirect(next ?? '/command');
  }
}
