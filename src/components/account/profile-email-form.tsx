'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestEmailChangeAction } from '@/app/account/profile/actions';
import { SaveBar, useSettingsForm } from './settings-form';

export function ProfileEmailForm({
  email,
  pendingEmail,
  readOnly,
}: {
  email: string | null;
  /** A new address that has been requested but not confirmed yet. */
  pendingEmail: string | null;
  readOnly: boolean;
}) {
  const { state, onSubmit, pending } = useSettingsForm(
    requestEmailChangeAction,
  );
  const disabled = readOnly || !email;

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Sign-in email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="current-email">Current email</Label>
              <Input
                id="current-email"
                type="email"
                value={email ?? ''}
                readOnly
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">New email</Label>
              <Input
                id="new-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                maxLength={254}
                required
                disabled={disabled}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {disabled
              ? 'The demo workspace has no sign-in email to change.'
              : 'We’ll email a confirmation link to the new address. Nothing changes until you open that link: until then you keep signing in with your current email.'}
          </p>
          {pendingEmail && !disabled ? (
            <p
              role="note"
              className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
            >
              Waiting for confirmation of{' '}
              <span className="font-medium text-foreground">
                {pendingEmail}
              </span>
              . Open the link sent to that inbox, or request a new one here.
            </p>
          ) : null}
          <SaveBar
            state={state}
            pending={pending}
            disabled={disabled}
            label="Send confirmation link"
          />
        </CardContent>
      </Card>
    </form>
  );
}
