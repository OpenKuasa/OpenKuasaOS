import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { OrgRole } from './current-org';

/** The signed-in person and their workspace, as shown in the app chrome. */
export type Viewer = {
  name: string;
  email: string | null;
  initials: string;
  orgName: string;
  role: OrgRole;
  isDemo: boolean;
};

type ViewerUser = {
  email?: string | null;
  is_anonymous?: boolean;
  user_metadata?: Record<string, unknown> | null;
};

// Shown when no Supabase project is configured, so the app still runs
// without credentials (see `updateSession`).
const PREVIEW_VIEWER: Viewer = {
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
  org: { name: string; role: OrgRole },
): Viewer {
  const isDemo = user.is_anonymous === true;
  const email = user.email || null;
  const fullName = user.user_metadata?.full_name;
  const name =
    typeof fullName === 'string' && fullName.trim()
      ? fullName.trim()
      : isDemo
        ? 'Demo guest'
        : (email?.split('@')[0] ?? 'Member');

  return {
    name,
    email,
    initials: initialsOf(name),
    orgName: org.name,
    role: org.role,
    isDemo,
  };
}

/**
 * Resolves the signed-in viewer for the app and account layouts. Sends
 * signed-out visitors to /login and users without a workspace to /onboarding.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return PREVIEW_VIEWER;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS lets a member read every row of their org, so scope to the caller.
  const { data, error } = await supabase
    .from('org_members')
    .select('role, orgs(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) redirect('/onboarding');

  const org = (Array.isArray(data.orgs) ? data.orgs[0] : data.orgs) as
    | { name: string }
    | null
    | undefined;

  return toViewer(user, {
    name: org?.name ?? 'Workspace',
    role: data.role as OrgRole,
  });
});
