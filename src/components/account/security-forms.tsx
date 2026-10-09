'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  changePasswordAction,
  signOutOtherSessionsAction,
} from '@/app/account/actions';
import { SaveBar, useSettingsForm } from './settings-form';

export function PasswordForm() {
  // A native form action resets the fields after each submit, which is what
  // password inputs want.
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
      </div>
      <SaveBar state={state} pending={pending} label="Update password" />
    </form>
  );
}

export function SignOutOthersForm() {
  const { state, onSubmit, pending } = useSettingsForm(
    signOutOtherSessionsAction,
  );

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-center justify-between gap-4"
    >
      <div>
        <p className="font-medium">Other devices</p>
        <p className="text-sm text-muted-foreground">
          {state?.notice ??
            state?.error ??
            'Sign out everywhere except this browser.'}
        </p>
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? 'Signing out…' : 'Sign out other devices'}
      </Button>
    </form>
  );
}
