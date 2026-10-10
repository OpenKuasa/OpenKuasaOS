'use client';

import { useActionState, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createInviteAction } from '@/app/account/team/actions';
import { INVITE_ROLES, type TeamActionState } from '@/lib/account/invites';
import { roleLabel } from '@/lib/auth/permissions';
import { InviteLinkField } from './invite-link-field';

export function TeamInviteForm() {
  const [state, dispatch, actionPending] = useActionState<
    TeamActionState,
    FormData
  >(createInviteAction, undefined);
  const [transitionPending, startTransition] = useTransition();
  const pending = actionPending || transitionPending;

  const [email, setEmail] = useState('');
  // Clear the address once its invite exists, but keep it after an error.
  const [clearedFor, setClearedFor] = useState<string | undefined>();
  if (state?.link && state.link !== clearedFor) {
    setClearedFor(state.link);
    setEmail('');
  }

  // Submitted by hand so the role select is not reset after each invite.
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Invites are links, not emails. Create one, then copy the link and send
        it to the person yourself. It works for 7 days and only for the email
        you enter.
      </p>

      <form
        onSubmit={onSubmit}
        className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
      >
        <div className="space-y-2">
          <Label htmlFor="invite-member-email">Email</Label>
          <Input
            id="invite-member-email"
            name="email"
            type="email"
            placeholder="name@company.com"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-member-role">Role</Label>
          <Select name="role" defaultValue="member">
            <SelectTrigger id="invite-member-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVITE_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {roleLabel(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create invite link'}
        </Button>
      </form>

      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {state?.link ? (
        <div
          role="status"
          className="space-y-2 rounded-lg border bg-muted/50 px-4 py-3"
        >
          <p className="text-sm">
            Invite link for <span className="font-semibold">{state.email}</span>
            . No email was sent, so copy it and share it yourself.
          </p>
          <InviteLinkField
            link={state.link}
            label={`Invite link for ${state.email}`}
          />
        </div>
      ) : null}
    </div>
  );
}
