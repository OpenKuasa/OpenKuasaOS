import { AccountShell } from '@/components/account/account-shell';
import { ViewerProvider } from '@/components/app/viewer-context';
import { getViewer } from '@/lib/auth/viewer';

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();

  return (
    <ViewerProvider viewer={viewer}>
      <AccountShell>{children}</AccountShell>
    </ViewerProvider>
  );
}
