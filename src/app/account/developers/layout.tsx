import { requireAccess } from '@/lib/auth/viewer';

export default async function DevelopersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAccess('manage-developers');
  return children;
}
