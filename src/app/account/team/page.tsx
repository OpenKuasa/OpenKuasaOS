import { headers } from 'next/headers';
import { Check, Minus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/screen/empty-state';
import { ReadOnlyNotice } from '@/components/account/settings-form';
import { TeamInviteForm } from '@/components/account/team-invite-form';
import { TeamMemberActions } from '@/components/account/team-member-actions';
import {
  TeamPendingInvites,
  type PendingInviteRow,
} from '@/components/account/team-pending-invites';
import { UserAvatar } from '@/components/account/user-avatar';
import { getTeam } from '@/lib/account/data';
import {
  getPendingInvites,
  inviteUrl,
  originFromHeaders,
} from '@/lib/account/invites';
import { PERMISSIONS, ROLES, can, roleLabel } from '@/lib/auth/permissions';
import { getViewer } from '@/lib/auth/viewer';
import { createClient } from '@/lib/supabase/server';

const JOINED = new Intl.DateTimeFormat('en-MY', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export default async function TeamPage() {
  const [viewer, team] = await Promise.all([getViewer(), getTeam()]);
  const canManage = !viewer.isDemo && can(viewer.role, 'manage-members');

  // RLS only shows invites to owners and admins, so others skip the query.
  let invites: PendingInviteRow[] = [];
  if (canManage) {
    const [supabase, h] = await Promise.all([createClient(), headers()]);
    const origin = originFromHeaders(h);
    invites = (await getPendingInvites(supabase, viewer.orgId)).map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      link: inviteUrl(origin, i.token),
      expires: JOINED.format(new Date(i.expiresAt)),
    }));
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          People who can access {viewer.orgName}.
        </p>
      </div>

      <div className="space-y-8">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {team.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members yet"
              description={
                viewer.isDemo
                  ? 'The demo workspace has no member accounts, only guests like you.'
                  : 'Members of this workspace will appear here.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    {canManage ? (
                      <TableHead className="text-right">Manage</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.map((m) => (
                    <TableRow key={m.userId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            initials={m.initials}
                            avatarUrl={m.avatarUrl}
                            className="size-9"
                            fallbackClassName="text-xs"
                          />
                          <div>
                            <p className="font-semibold">
                              {m.name}
                              {m.isYou ? (
                                <span className="ml-2 text-xs font-medium text-muted-foreground">
                                  You
                                </span>
                              ) : null}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {m.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{roleLabel(m.role)}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {JOINED.format(new Date(m.joinedAt))}
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          {m.isYou || m.role === 'owner' ? null : (
                            <TeamMemberActions
                              userId={m.userId}
                              name={m.name}
                              role={m.role}
                            />
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invite a member</CardTitle>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <TeamInviteForm />
            ) : (
              <ReadOnlyNotice>
                {viewer.isDemo
                  ? 'The demo workspace is read-only. Sign up to invite your own team.'
                  : 'Only owners and admins can invite and manage members.'}
              </ReadOnlyNotice>
            )}
          </CardContent>
        </Card>

        {canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Pending invites</CardTitle>
            </CardHeader>
            <CardContent>
              <TeamPendingInvites invites={invites} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Roles &amp; permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Capability</TableHead>
                    {ROLES.map((role) => (
                      <TableHead key={role} className="text-center">
                        {roleLabel(role)}
                        {role === viewer.role ? ' (you)' : ''}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PERMISSIONS.map((p) => (
                    <TableRow key={p.capability}>
                      <TableCell className="font-medium">{p.label}</TableCell>
                      {ROLES.map((role) => (
                        <TableCell key={role} className="text-center">
                          {p.allow.includes(role) ? (
                            <Check
                              className="mx-auto size-4 text-primary"
                              aria-label="Allowed"
                            />
                          ) : (
                            <Minus
                              className="mx-auto size-4 text-muted-foreground"
                              aria-label="Not allowed"
                            />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
