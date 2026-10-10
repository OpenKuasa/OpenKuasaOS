'use client';

import { useActionState, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  removeMemberAction,
  setMemberRoleAction,
} from '@/app/account/team/actions';
import {
  INVITE_ROLES,
  type InviteRole,
  type TeamActionState,
} from '@/lib/account/invites';
import { roleLabel } from '@/lib/auth/permissions';

/** Role picker and two-step remove for one member, shown to owners and admins. */
export function TeamMemberActions({
  userId,
  name,
  role,
}: {
  userId: string;
  name: string;
  role: InviteRole;
}) {
  const [roleState, setRole, rolePending] = useActionState<
    TeamActionState,
    FormData
  >(setMemberRoleAction, undefined);
  const [removeState, remove, removePending] = useActionState<
    TeamActionState,
    FormData
  >(removeMemberAction, undefined);
  const [transitionPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const pending = rolePending || removePending || transitionPending;

  const run = (
    dispatch: (formData: FormData) => void,
    fields: Record<string, string>,
  ) => {
    const formData = new FormData();
    formData.set('userId', userId);
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    startTransition(() => dispatch(formData));
  };

  const error = removeState?.error ?? roleState?.error;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center justify-end gap-2">
        {/* Follows the saved role, so a failed change snaps back. */}
        <Select
          value={role}
          disabled={pending}
          onValueChange={(next) => {
            if (next !== role) run(setRole, { role: next });
          }}
        >
          <SelectTrigger size="sm" className="w-28" aria-label={`Role for ${name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVITE_ROLES.map((option) => (
              <SelectItem key={option} value={option}>
                {roleLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {confirming ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                run(remove, {});
              }}
            >
              Confirm remove
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            aria-label={`Remove ${name}`}
            onClick={() => setConfirming(true)}
          >
            {removePending ? 'Removing…' : 'Remove'}
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
