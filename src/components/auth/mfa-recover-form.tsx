'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { redeemRecoveryCodeAction, type MfaState } from '@/app/mfa/actions';

export function MfaRecoverForm() {
  const [state, formAction, pending] = useActionState<MfaState, FormData>(
    redeemRecoveryCodeAction,
    undefined,
  );

  return (
    <form className="space-y-4" action={formAction}>
      <div className="space-y-2">
        <Label htmlFor="code">Recovery code</Label>
        <Input
          id="code"
          name="code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXXX-XXXXX"
          className="text-center font-mono uppercase tracking-widest"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? 'code-error' : undefined}
          autoFocus
          required
        />
      </div>

      {state?.error ? (
        <p id="code-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? 'Checking…' : 'Use recovery code'}
      </Button>
    </form>
  );
}
