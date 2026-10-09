import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Set a new password · OpenKuasa OS',
};

export default async function ResetPasswordPage() {
  // Reaching this page requires the recovery session set by /auth/confirm.
  // Without it the link was never followed or has expired.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?notice=reset_expired');

  return (
    <AuthShell>
      <div className="space-y-1.5 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Set a new password
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose a strong password you&apos;ll remember.
        </p>
      </div>

      <ResetPasswordForm />
    </AuthShell>
  );
}
