import { CompanyForm } from '@/components/account/company-form';
import { getCompany } from '@/lib/account/data';
import { can } from '@/lib/auth/permissions';
import { getViewer } from '@/lib/auth/viewer';

export default async function CompanyPage() {
  const [viewer, company] = await Promise.all([getViewer(), getCompany()]);

  const readOnlyReason = viewer.isDemo
    ? "You're exploring the demo workspace, so company details are read-only."
    : can(viewer.role, 'manage-company')
      ? null
      : 'Only owners and admins can edit company details.';

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Company details</h1>
        <p className="text-sm text-muted-foreground">
          Your organisation&apos;s information.
        </p>
      </div>

      <CompanyForm company={company} readOnlyReason={readOnlyReason} />
    </div>
  );
}
