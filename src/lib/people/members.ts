import type { SupabaseClient } from '@supabase/supabase-js';

/** A workspace member an employee record can be linked to. */
export type WorkspaceMember = { userId: string; name: string; email: string };

/**
 * The workspace's members who have an email, by name. Read with the caller's
 * session: the database already limits profiles to the caller and the people
 * they share a workspace with. Demo guests have no email and are left out.
 */
export async function listWorkspaceMembers(client: SupabaseClient, orgId: string): Promise<WorkspaceMember[]> {
  const members = await client.from('org_members').select('user_id').eq('org_id', orgId);
  if (members.error) throw members.error;
  const ids = ((members.data ?? []) as { user_id: string }[]).map((member) => member.user_id);
  if (ids.length === 0) return [];

  const profiles = await client
    .from('profiles')
    .select('user_id,full_name,email')
    .in('user_id', ids)
    .not('email', 'is', null);
  if (profiles.error) throw profiles.error;

  return ((profiles.data ?? []) as { user_id: string; full_name: string | null; email: string | null }[])
    .filter((profile): profile is { user_id: string; full_name: string | null; email: string } => Boolean(profile.email))
    .map((profile) => ({
      userId: profile.user_id,
      name: profile.full_name?.trim() || profile.email.split('@')[0],
      email: profile.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
