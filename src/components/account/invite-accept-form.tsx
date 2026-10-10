'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  acceptInviteAction,
  signInAndAcceptAction,
  signUpAndAcceptAction,
} from '@/app/invite/[token]/actions';
import type { InviteAcceptState } from '@/lib/account/invites';

function Feedback({ state }: { state: InviteAcceptState }) {
  return (
    <>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.notice ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
        >
          {state.notice}
        </p>
      ) : null}
    </>
  );
}

/** For someone already signed in as the invited email. */
export function InviteJoinButton({
  token,
  orgName,
}: {
  token: string;
  orgName: string;
}) {
  const [state, formAction, pending] = useActionState<
    InviteAcceptState,
    FormData
  >(acceptInviteAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Feedback state={state} />
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? 'Joining…' : `Join ${orgName}`}
      </Button>
    </form>
  );
}

type Mode = 'create' | 'sign-in';

/** For signed-out visitors: sign in or create an account, then join. */
export function InviteAcceptForm({
  token,
  email,
  orgName,
}: {
  token: string;
  email: string;
  orgName: string;
}) {
  const [mode, setMode] = useState<Mode>('create');
  const [signInState, signInFormAction, signInPending] = useActionState<
    InviteAcceptState,
    FormData
  >(signInAndAcceptAction, undefined);
  const [signUpState, signUpFormAction, signUpPending] = useActionState<
    InviteAcceptState,
    FormData
  >(signUpAndAcceptAction, undefined);

  const creating = mode === 'create';
  const pending = signInPending || signUpPending;

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Account" className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={creating ? 'secondary' : 'outline'}
          aria-pressed={creating}
          onClick={() => setMode('create')}
        >
          Create my account
        </Button>
        <Button
          type="button"
          variant={creating ? 'outline' : 'secondary'}
          aria-pressed={!creating}
          onClick={() => setMode('sign-in')}
        >
          I already have an account
        </Button>
      </div>

      <form
        key={mode}
        action={creating ? signUpFormAction : signInFormAction}
        className="space-y-4"
      >
        <input type="hidden" name="token" value={token} />

        <div className="space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            readOnly
            autoComplete="username"
            className="bg-muted/50 text-muted-foreground"
          />
        </div>

        {creating ? (
          <div className="space-y-2">
            <Label htmlFor="invite-full-name">Full name</Label>
            <Input
              id="invite-full-name"
              name="fullName"
              autoComplete="name"
              defaultValue={signUpState?.fullName}
              maxLength={120}
              required
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="invite-password">Password</Label>
          <Input
            id="invite-password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete={creating ? 'new-password' : 'current-password'}
            minLength={creating ? 8 : undefined}
            required
          />
          {creating ? (
            <p className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          ) : null}
        </div>

        <Feedback state={creating ? signUpState : signInState} />

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending
            ? 'Joining…'
            : creating
              ? `Create account and join ${orgName}`
              : `Sign in and join ${orgName}`}
        </Button>
      </form>
    </div>
  );
}
