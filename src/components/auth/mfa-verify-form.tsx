'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { verifyMfaAction, type MfaState } from '@/app/mfa/actions';

export function MfaVerifyForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState<MfaState, FormData>(
    verifyMfaAction,
    undefined,
  );

  return (
    <form className="space-y-4" action={formAction}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="space-y-2">
        <Label htmlFor="code">Authentication code</Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          className="text-center font-mono tracking-[0.4em]"
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
        {pending ? 'Verifying…' : 'Verify'}
      </Button>
    </form>
  );
}
