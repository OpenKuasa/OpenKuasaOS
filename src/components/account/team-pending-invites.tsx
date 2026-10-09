'use client';

import { useActionState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { revokeInviteAction } from '@/app/account/team/actions';
import type { TeamActionState } from '@/lib/account/invites';
import { roleLabel } from '@/lib/auth/permissions';
import type { OrgRole } from '@/lib/auth/current-org';
import { InviteLinkField } from './invite-link-field';

export type PendingInviteRow = {
  id: string;
  email: string;
  role: OrgRole;
  link: string;
  /** Formatted on the server so both renders agree. */
  expires: string;
};

function InviteRow({ invite }: { invite: PendingInviteRow }) {
  const [state, formAction, pending] = useActionState<
    TeamActionState,
    FormData
  >(revokeInviteAction, undefined);

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{invite.email}</p>
          <p className="text-sm text-muted-foreground">
            Expires {invite.expires}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{roleLabel(invite.role)}</Badge>
          <form action={formAction}>
            <input type="hidden" name="inviteId" value={invite.id} />
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={pending}
            >
              {pending ? 'Revoking…' : 'Revoke'}
            </Button>
          </form>
        </div>
      </div>
      <InviteLinkField
        link={invite.link}
        label={`Invite link for ${invite.email}`}
      />
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

export function TeamPendingInvites({
  invites,
}: {
  invites: PendingInviteRow[];
}) {
  if (invites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No pending invites. Links you create will be listed here until they are
        accepted, revoked or expire.
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {invites.map((invite) => (
        <InviteRow key={invite.id} invite={invite} />
      ))}
    </ul>
  );
}
