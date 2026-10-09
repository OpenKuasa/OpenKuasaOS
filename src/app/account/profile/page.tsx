import { ProfileForm } from '@/components/account/profile-form';
import { getProfile } from '@/lib/account/data';
import { getViewer } from '@/lib/auth/viewer';

export default async function ProfilePage() {
  const [viewer, profile] = await Promise.all([getViewer(), getProfile()]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">Your personal details.</p>
      </div>

      <ProfileForm
        profile={profile}
        initials={viewer.initials}
        readOnly={viewer.isDemo}
      />
    </div>
  );
}
