'use client';

import { useActionState, useTransition } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SettingsState } from '@/app/account/actions';

type Action = (
  prev: SettingsState,
  formData: FormData,
) => Promise<SettingsState>;

/**
 * Runs a settings action without the automatic form reset, which would snap
 * switches and selects back to their mount-time values after a save.
 */
export function useSettingsForm(action: Action) {
  const [state, dispatch, actionPending] = useActionState(action, undefined);
  const [transitionPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };

  return { state, onSubmit, pending: actionPending || transitionPending };
}

export function ReadOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="note"
      className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
    >
      <Lock className="size-4 shrink-0" />
      {children}
    </p>
  );
}

export function SaveBar({
  state,
  pending,
  disabled,
  label = 'Save changes',
}: {
  state: SettingsState;
  pending: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-4">
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.notice}
        </p>
      ) : null}
      <Button type="submit" disabled={disabled || pending}>
        {pending ? 'Saving…' : label}
      </Button>
    </div>
  );
}
