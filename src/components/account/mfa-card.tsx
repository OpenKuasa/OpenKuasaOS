'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  cancelMfaSetupAction,
  confirmMfaSetupAction,
  disableMfaAction,
  regenerateRecoveryCodesAction,
  startMfaSetupAction,
} from '@/app/account/security/actions';
import { formatSecret, type MfaSetup } from './mfa-helpers';
import { MfaRecoveryCodes } from './mfa-recovery-codes';

type View =
  | { kind: 'idle' }
  | ({ kind: 'setup' } & MfaSetup)
  | { kind: 'codes'; codes: string[] }
  | { kind: 'disable' }
  | { kind: 'regenerate' };

const IDLE: View = { kind: 'idle' };
const UNEXPECTED_ERROR = 'Something went wrong. Please try again.';

/**
 * The authenticator-app controls on the Security page. The setup key and the
 * recovery codes are held in this component's state only.
 */
export function MfaCard({
  enabled,
  remaining,
  total,
}: {
  enabled: boolean;
  /** Unused recovery codes, or null when the count could not be read. */
  remaining: number | null;
  total: number;
}) {
  const [view, setView] = useState<View>(IDLE);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const show = (next: View) => {
    setView(next);
    setCode('');
    setError(null);
    setNotice(null);
  };

  const run = (task: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await task();
      } catch {
        setError(UNEXPECTED_ERROR);
      }
    });
  };

  const start = () =>
    run(async () => {
      const result = await startMfaSetupAction();
      if ('error' in result) setError(result.error);
      else show({ kind: 'setup', ...result });
    });

  const confirmSetup = (factorId: string) =>
    run(async () => {
      const result = await confirmMfaSetupAction({ factorId, code });
      if (result.codes) return show({ kind: 'codes', codes: result.codes });
      // On without codes: fall back to the "On" view, which offers Regenerate.
      if (result.enabled) show(IDLE);
      setError(result.error ?? UNEXPECTED_ERROR);
    });

  const cancelSetup = (factorId: string) => {
    show(IDLE);
    startTransition(async () => {
      try {
        await cancelMfaSetupAction({ factorId });
      } catch {
        // The leftover factor is discarded the next time setup starts.
      }
    });
  };

  const regenerate = () =>
    run(async () => {
      const result = await regenerateRecoveryCodesAction({ code });
      if (result.codes) show({ kind: 'codes', codes: result.codes });
      else setError(result.error ?? UNEXPECTED_ERROR);
    });

  const disable = () =>
    run(async () => {
      const result = await disableMfaAction({ code });
      if (result.error) return setError(result.error);
      show(IDLE);
      setNotice(result.notice ?? null);
    });

  // Fresh codes win over everything else: the page refreshes underneath them
  // as soon as 2FA turns on, and they must stay up until acknowledged.
  if (view.kind === 'codes') {
    return <MfaRecoveryCodes codes={view.codes} onDone={() => show(IDLE)} />;
  }

  const messages = (
    <>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </>
  );

  if (view.kind === 'setup') {
    return (
      <div className="space-y-4">
        <div>
          <p className="font-medium">Set up your authenticator app</p>
          <p className="text-sm text-muted-foreground">
            Scan the QR code with an authenticator app, then enter the 6-digit
            code it shows.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          {/* An SVG data URI from Supabase; next/image has nothing to optimise. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={view.qrCode}
            alt="QR code for your authenticator app"
            width={176}
            height={176}
            className="size-44 shrink-0 rounded-lg border bg-white p-2"
          />
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">
              Can&apos;t scan it? Enter this key by hand:
            </p>
            <p className="font-mono text-sm break-all">
              {formatSecret(view.secret)}
            </p>
          </div>
        </div>
        <CodeForm
          code={code}
          onCode={setCode}
          pending={pending}
          submitLabel="Turn on"
          pendingLabel="Checking…"
          onSubmit={() => confirmSetup(view.factorId)}
          onCancel={() => cancelSetup(view.factorId)}
        />
        {messages}
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Authenticator app</p>
            <p className="text-sm text-muted-foreground">
              Add a second step at sign-in: a 6-digit code from an app on your
              phone.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <StatusPill on={false} />
            <Button type="button" size="sm" onClick={start} disabled={pending}>
              {pending ? 'Starting…' : 'Set up'}
            </Button>
          </div>
        </div>
        {messages}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-medium">Authenticator app</p>
          <p className="text-sm text-muted-foreground">
            You are asked for a code from your app when you sign in.
          </p>
        </div>
        <StatusPill on />
      </div>

      <div className="space-y-1">
        <p className="font-medium">Recovery codes</p>
        {remaining === 0 ? (
          <p className="text-sm text-destructive">
            You have no recovery codes left. If you lose your phone you will
            not be able to sign in. Regenerate them now.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {remaining === null
              ? 'Could not load how many codes you have left.'
              : `${remaining} of ${total} left.`}{' '}
            If you lose your phone, a recovery code signs you in. Using one
            turns two-factor authentication off, so you will need to set it up
            again.
          </p>
        )}
      </div>

      {view.kind === 'idle' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => show({ kind: 'regenerate' })}
          >
            Regenerate recovery codes
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => show({ kind: 'disable' })}
          >
            Turn off
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {view.kind === 'disable'
              ? 'Enter a code from your authenticator app to turn two-factor authentication off. Your recovery codes will be deleted.'
              : 'Enter a code from your authenticator app to get a new set. Your current recovery codes will stop working.'}
          </p>
          <CodeForm
            code={code}
            onCode={setCode}
            pending={pending}
            destructive={view.kind === 'disable'}
            submitLabel={
              view.kind === 'disable' ? 'Turn off' : 'Regenerate codes'
            }
            pendingLabel="Checking…"
            onSubmit={view.kind === 'disable' ? disable : regenerate}
            onCancel={() => show(IDLE)}
          />
        </div>
      )}
      {messages}
    </div>
  );
}

function StatusPill({ on }: { on: boolean }) {
  return (
    <span
      className={
        on
          ? 'inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'
          : 'inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
      }
    >
      {on ? 'On' : 'Off'}
    </span>
  );
}

function CodeForm({
  code,
  onCode,
  pending,
  destructive,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
}: {
  code: string;
  onCode: (code: string) => void;
  pending: boolean;
  destructive?: boolean;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="space-y-2">
        <Label htmlFor="mfa-code">6-digit code</Label>
        <Input
          id="mfa-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(event) =>
            onCode(event.target.value.replace(/\D/g, '').slice(0, 6))
          }
          className="w-32 font-mono tracking-widest"
        />
      </div>
      <Button
        type="submit"
        variant={destructive ? 'destructive' : 'default'}
        disabled={pending || code.length !== 6}
      >
        {pending ? pendingLabel : submitLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={pending}
      >
        Cancel
      </Button>
    </form>
  );
}
