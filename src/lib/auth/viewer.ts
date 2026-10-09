import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { OrgRole } from './current-org';
import { canSee, type Capability } from './permissions';

/** The signed-in person and their workspace, as shown in the app chrome. */
export type Viewer = {
  userId: string;
  orgId: string;
  name: string;
  email: string | null;
  initials: string;
  orgName: string;
  role: OrgRole;
  isDemo: boolean;
};

type ViewerUser = {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
  user_metadata?: Record<string, unknown> | null;
};

// Shown when no Supabase project is configured, so the app still runs
// without credentials (see `updateSession`).
const PREVIEW_VIEWER: Viewer = {
  userId: 'preview',
  orgId: 'preview',
  name: 'Guest',
  email: null,
  initials: 'G',
  orgName: 'Preview workspace',
  role: 'viewer',
  isDemo: true,
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return letters.join('').toUpperCase() || '?';
}

export function toViewer(
  user: ViewerUser,
  org: { id: string; name: string; role: OrgRole },
  profileName?: string | null,
): Viewer {
  const isDemo = user.is_anonymous === true;
  const email = user.email || null;
  // profiles.full_name is the source of truth; auth metadata is a fallback.
  const fullName = profileName?.trim() || user.user_metadata?.full_name;
  const name =
    typeof fullName === 'string' && fullName.trim()
      ? fullName.trim()
      : isDemo
        ? 'Demo guest'
        : (email?.split('@')[0] ?? 'Member');

  return {
    userId: user.id,
    orgId: org.id,
    name,
    email,
    initials: initialsOf(name),
    orgName: org.name,
    role: org.role,
    isDemo,
  };
}

export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Resolves the signed-in viewer for the app and account layouts. Sends
 * signed-out visitors to /login and users without a workspace to /onboarding.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  if (!hasSupabaseEnv()) return PREVIEW_VIEWER;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS lets a member read every row of their org, so scope to the caller.
  const { data, error } = await supabase
    .from('org_members')
    .select('role, orgs(id, name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) redirect('/onboarding');

  const org = (Array.isArray(data.orgs) ? data.orgs[0] : data.orgs) as
    | { id: string; name: string }
    | null
    | undefined;
  if (!org) redirect('/onboarding');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .maybeSingle();

  return toViewer(
    user,
    { id: org.id, name: org.name, role: data.role as OrgRole },
    profile?.full_name,
  );
});

/** Page guard: members without the capability are sent back to account home. */
export async function requireAccess(capability: Capability): Promise<Viewer> {
  const viewer = await getViewer();
  if (!canSee(viewer, capability)) redirect('/account');
  return viewer;
}
