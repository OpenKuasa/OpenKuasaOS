import type { ReactNode } from 'react';
import { isLiveChatAllowed } from '@/lib/ai/access';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { hasSupabaseEnv } from '@/lib/auth/viewer';
import { createSupabasePeopleData, getPeopleData } from '@/lib/people/supabase';
import type { PeopleData, PeopleViewer } from '@/lib/people/types';
import { NO_WORKSPACE_VIEWER, getPeopleViewer } from '@/lib/people/viewer';
import { createClient } from '@/lib/supabase/server';

export function Muted({ children }: { children: ReactNode }) {
  return (
    <p className="grid min-h-24 place-items-center text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export const LOAD_FAILED = <Muted>Couldn&apos;t load your HR data — please refresh</Muted>;
export const HR_ONLY = <Muted>Shown to HR admins</Muted>;
export const NOT_AVAILABLE = <Muted>Not available yet</Muted>;

/**
 * Loads one Lekiu screen's model for the signed-in viewer. `model` is null
 * when the read failed, so the screen can say so on its cards instead of
 * crashing. `viewer` says who is looking (for wording only: the database has
 * already decided which rows came back). `hasWorkspace` is false when the user is in no workspace (or the read failed before one
 * was resolved). `chatDemo` is true for a demo or
 * signed-out visitor, who gets the canned chat answer.
 */
export async function loadPeople<T>(
  tag: string,
  build: (data: PeopleData, now: Date) => Promise<T>,
): Promise<{ model: T | null; viewer: PeopleViewer; chatDemo: boolean; hasWorkspace: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let model: T | null = null;
  let viewer: PeopleViewer = NO_WORKSPACE_VIEWER;
  let hasWorkspace = false;
  try {
    // Resolve the workspace once; the provider and the viewer share it.
    const org = hasSupabaseEnv() ? await getCurrentOrg(supabase) : null;
    // No project configured: the sample company stands in for a workspace.
    hasWorkspace = org !== null || !hasSupabaseEnv();
    const data = org ? createSupabasePeopleData(supabase, org.orgId) : await getPeopleData(supabase);
    viewer = await getPeopleViewer(supabase, org);
    model = await build(data, new Date());
  } catch (error) {
    console.error(`[people/${tag}] data error:`, error);
  }
  return { model, viewer, chatDemo: !isLiveChatAllowed(user), hasWorkspace };
}
