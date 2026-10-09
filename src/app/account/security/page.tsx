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
import { ReadOnlyNotice } from '@/components/account/settings-form';
import { getViewer } from '@/lib/auth/viewer';

export default async function SecurityPage() {
  const viewer = await getViewer();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">
          Password, 2FA &amp; sessions.
        </p>
      </div>

      <div className="space-y-6">
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
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Authenticator app</p>
              <p className="text-sm text-muted-foreground">
                Add a second step at sign-in
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Not available yet
            </span>
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
