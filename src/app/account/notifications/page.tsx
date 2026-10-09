import { NotificationsForm } from '@/components/account/notifications-form';
import { getProfile } from '@/lib/account/data';
import { getViewer } from '@/lib/auth/viewer';

export default async function NotificationsPage() {
  const [viewer, profile] = await Promise.all([getViewer(), getProfile()]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Choose what we tell you and how.
        </p>
      </div>

      <NotificationsForm
        prefs={profile.notificationPrefs}
        email={profile.email}
        timezone={profile.timezone}
        readOnly={viewer.isDemo}
      />
    </div>
  );
}
