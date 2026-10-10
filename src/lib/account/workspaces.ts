import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getViewer, hasSupabaseEnv } from '@/lib/auth/viewer';
import type { OrgRole } from '@/lib/auth/current-org';

export type Workspace = {
  orgId: string;
  name: string;
  role: OrgRole;
  isCurrent: boolean;
};

/** Every workspace the viewer belongs to, current one first. */
export const getWorkspaces = cache(async (): Promise<Workspace[]> => {
  const viewer = await getViewer();
  if (!hasSupabaseEnv() || viewer.isDemo) return [];

  const supabase = await createClient();
  // RLS lets a member read every row of their org, so scope to the caller.
  const { data, error } = await supabase
    .from('org_members')
    .select('role, orgs(id, name)')
    .eq('user_id', viewer.userId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const workspaces: Workspace[] = [];
  for (const row of data ?? []) {
    const org = (Array.isArray(row.orgs) ? row.orgs[0] : row.orgs) as
      | { id: string; name: string }
      | null
      | undefined;
    if (!org) continue;
    workspaces.push({
      orgId: org.id,
      name: org.name,
      role: row.role as OrgRole,
      isCurrent: org.id === viewer.orgId,
    });
  }
  return workspaces.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
});
