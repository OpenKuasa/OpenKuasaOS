import { AppShell } from '@/components/app/app-shell';
import { ViewerProvider } from '@/components/app/viewer-context';
import { getViewer } from '@/lib/auth/viewer';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();

  return (
    <ViewerProvider viewer={viewer}>
      <AppShell>{children}</AppShell>
    </ViewerProvider>
  );
}
