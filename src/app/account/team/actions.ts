'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getViewer, type Viewer } from '@/lib/auth/viewer';
import { can } from '@/lib/auth/permissions';
import {
  INVITE_ROLES,
  TEAM_DEMO_ERROR,
  TEAM_ROLE_ERROR,
  friendlyRpcError,
  inviteUrl,
  originFromHeaders,
  type TeamActionState,
} from '@/lib/account/invites';

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '');
}

// Demo guests and non-admins are read-only; the database checks this again.
async function requireManager(): Promise<
  { viewer: Viewer; error?: undefined } | { error: string }
> {
  const viewer = await getViewer();
  if (viewer.isDemo) return { error: TEAM_DEMO_ERROR };
  if (!can(viewer.role, 'manage-members')) return { error: TEAM_ROLE_ERROR };
  return { viewer };
}

const roleSchema = z.enum(INVITE_ROLES, 'Please choose a valid role.');

const inviteSchema = z.object({
  // Invites are matched against the lowercased sign-in email.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Please enter a valid email address.')
    .pipe(z.email('Please enter a valid email address.')),
  role: roleSchema,
});

export async function createInviteAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await requireManager();
  if (gate.error !== undefined) return { error: gate.error };

  const parsed = inviteSchema.safeParse({
    email: field(formData, 'email'),
    role: field(formData, 'role'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc('create_invite', {
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error || typeof token !== 'string') {
    return {
      error: friendlyRpcError(error, 'Could not create the invite. Please try again.'),
    };
  }

  revalidatePath('/account/team');
  return {
    notice: 'Invite created. Copy the link and send it yourself; no email is sent.',
    link: inviteUrl(originFromHeaders(await headers()), token),
    email: parsed.data.email,
  };
}

const idSchema = z.uuid();

export async function revokeInviteAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await requireManager();
  if (gate.error !== undefined) return { error: gate.error };

  const inviteId = idSchema.safeParse(field(formData, 'inviteId'));
  if (!inviteId.success) return { error: 'That invite could not be found.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('revoke_invite', {
    p_invite: inviteId.data,
  });
  if (error) {
    return {
      error: friendlyRpcError(error, 'Could not revoke the invite. Please try again.'),
    };
  }

  revalidatePath('/account/team');
  return { notice: 'Invite revoked.' };
}

const memberRoleSchema = z.object({ userId: idSchema, role: roleSchema });

export async function setMemberRoleAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await requireManager();
  if (gate.error !== undefined) return { error: gate.error };

  const parsed = memberRoleSchema.safeParse({
    userId: field(formData, 'userId'),
    role: field(formData, 'role'),
  });
  if (!parsed.success) return { error: 'Please choose a valid role.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_member_role', {
    p_user: parsed.data.userId,
    p_role: parsed.data.role,
  });
  if (error) {
    return {
      error: friendlyRpcError(error, 'Could not change the role. Please try again.'),
    };
  }

  // Role counts also show on the account home page.
  revalidatePath('/account', 'layout');
  return { notice: 'Role updated.' };
}

export async function removeMemberAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const gate = await requireManager();
  if (gate.error !== undefined) return { error: gate.error };

  const userId = idSchema.safeParse(field(formData, 'userId'));
  if (!userId.success) return { error: 'That member could not be found.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_member', {
    p_user: userId.data,
  });
  if (error) {
    return {
      error: friendlyRpcError(error, 'Could not remove the member. Please try again.'),
    };
  }

  revalidatePath('/account', 'layout');
  return { notice: 'Member removed.' };
}

export async function switchWorkspaceAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const viewer = await getViewer();
  if (viewer.isDemo) {
    return { error: 'The demo workspace cannot switch workspaces.' };
  }

  const orgId = idSchema.safeParse(field(formData, 'orgId'));
  if (!orgId.success) return { error: 'That workspace could not be found.' };

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', viewer.userId)
    .eq('org_id', orgId.data)
    .maybeSingle();
  if (!membership) {
    return { error: 'You are no longer a member of that workspace.' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ current_org_id: orgId.data })
    .eq('user_id', viewer.userId)
    .select('user_id');
  if (error || !data?.length) {
    return { error: 'Could not switch workspace. Please try again.' };
  }

  // The workspace name and role appear in every signed-in layout.
  revalidatePath('/', 'layout');
  redirect('/account');
}
