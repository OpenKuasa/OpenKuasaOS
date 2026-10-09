import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  PasswordForm,
  SignOutOthersForm,
} from '@/components/account/security-forms';
import { MfaCard } from '@/components/account/mfa-card';
import { ReadOnlyNotice } from '@/components/account/settings-form';
import { RECOVERY_CODE_COUNT, getMfaStatus } from '@/lib/auth/mfa';
import { getViewer } from '@/lib/auth/viewer';
import { createClient } from '@/lib/supabase/server';

/** Whether the authenticator is on and how many recovery codes are unused. */
async function loadMfa(): Promise<{
  enabled: boolean;
  remaining: number | null;
}> {
  const supabase = await createClient();
  const status = await getMfaStatus(supabase);
  if (!status.factors.length) return { enabled: false, remaining: null };

  const { data, error } = await supabase.rpc('recovery_codes_remaining');
  return {
    enabled: true,
    remaining: error || typeof data !== 'number' ? null : data,
  };
}

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { notice } = await searchParams;
  const viewer = await getViewer();
  // Demo guests (and the no-credentials preview) cannot enrol a second factor.
  const mfa = viewer.isDemo ? null : await loadMfa();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">
          Password, 2FA &amp; sessions.
        </p>
      </div>

      <div className="space-y-6">
        {/* Set by /mfa/recover after a recovery code was used to sign in. */}
        {notice === 'recovered' && mfa && !mfa.enabled ? (
          <p
            role="status"
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
          >
            You signed in with a recovery code, so two-factor authentication
            is now off and your other recovery codes no longer work. Set it up
            again below to stay protected.
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
          </CardHeader>
          <CardContent>
            {viewer.isDemo ? (
              <ReadOnlyNotice>
                Demo sessions have no password. Sign up to create your own
                account.
              </ReadOnlyNotice>
            ) : (
              <PasswordForm />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Two-factor authentication</CardTitle>
          </CardHeader>
          <CardContent>
            {mfa ? (
              <MfaCard
                enabled={mfa.enabled}
                remaining={mfa.remaining}
                total={RECOVERY_CODE_COUNT}
              />
            ) : (
              <ReadOnlyNotice>
                Two-factor authentication is not available in the demo
                workspace. Sign up to protect your own account.
              </ReadOnlyNotice>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">This browser</p>
                <p className="text-sm text-muted-foreground">
                  Signed in as {viewer.email ?? 'a demo guest'}
                </p>
              </div>
              <span className="text-sm text-muted-foreground">Active now</span>
            </div>
            {viewer.isDemo ? null : <SignOutOthersForm />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
