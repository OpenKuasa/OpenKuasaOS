'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { removeAiKeyAction, saveAiKeyAction } from '@/app/account/ai/actions';
import { SaveBar } from './settings-form';

export function AiKeyForm({ hasKey }: { hasKey: boolean }) {
  // A native form action clears the field after each submit, which is what a
  // secret input wants.
  const [state, formAction, pending] = useActionState(
    saveAiKeyAction,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="api-key">
          {hasKey ? 'Replace with a new key' : 'OpenRouter API key'}
        </Label>
        <Input
          id="api-key"
          name="apiKey"
          type="password"
          placeholder="sk-or-v1-…"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <p className="text-xs text-muted-foreground">
          We check the key with OpenRouter, then store it encrypted. It is
          never shown again; only its last four characters are.
        </p>
      </div>
      <SaveBar
        state={state}
        pending={pending}
        label={hasKey ? 'Replace key' : 'Save key'}
      />
    </form>
  );
}

export function RemoveAiKeyForm() {
  const [state, formAction, pending] = useActionState(
    removeAiKeyAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? 'Removing…' : 'Remove key'}
      </Button>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
