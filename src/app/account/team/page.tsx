import { Check, Minus, Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { getTeam } from '@/lib/account/data';
import { PERMISSIONS, ROLES, can, roleLabel } from '@/lib/auth/permissions';
import { getViewer } from '@/lib/auth/viewer';

const JOINED = new Intl.DateTimeFormat('en-MY', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export default async function TeamPage() {
  const [viewer, team] = await Promise.all([getViewer(), getTeam()]);
  const canInvite = !viewer.isDemo && can(viewer.role, 'manage-members');

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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.map((m) => (
                    <TableRow key={m.userId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9">
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                              {m.initials}
                            </AvatarFallback>
                          </Avatar>
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
            <ReadOnlyNotice>
              {canInvite
                ? 'Email invites are not available yet. For now, each person signs up with their own workspace.'
                : 'Only owners and admins can invite members, and email invites are not available yet.'}
            </ReadOnlyNotice>
          </CardContent>
        </Card>

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
