import { ProfileEmailForm } from '@/components/account/profile-email-form';
import { ProfileForm } from '@/components/account/profile-form';
import { ProfilePhotoCard } from '@/components/account/profile-photo-card';
import { ReadOnlyNotice } from '@/components/account/settings-form';
import { getProfile } from '@/lib/account/data';
import { getViewer, hasSupabaseEnv } from '@/lib/auth/viewer';
import { createClient } from '@/lib/supabase/server';

// An email change that was requested but not yet confirmed from the new inbox.
async function getPendingEmail(): Promise<string | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.new_email || null;
}

export default async function ProfilePage() {
  const [viewer, profile, pendingEmail] = await Promise.all([
    getViewer(),
    getProfile(),
    getPendingEmail(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">Your personal details.</p>
      </div>

      <div className="space-y-6">
        {viewer.isDemo ? (
          <ReadOnlyNotice>
            You&apos;re exploring the demo workspace, so this profile is
            read-only.
          </ReadOnlyNotice>
        ) : null}

        <ProfilePhotoCard
          userId={viewer.userId}
          initials={viewer.initials}
          avatarUrl={profile.avatarUrl}
          readOnly={viewer.isDemo}
        />
        <ProfileForm profile={profile} readOnly={viewer.isDemo} />
        <ProfileEmailForm
          email={profile.email}
          pendingEmail={pendingEmail}
          readOnly={viewer.isDemo}
        />
      </div>
    </div>
  );
}
