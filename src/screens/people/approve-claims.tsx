import { claimApprovals } from '@/lib/people/approvals';
import { ApprovalsScreen } from './approvals-screen';
import { loadPeople } from './parts';

/** Owners and admins only: anyone else gets the notice and nothing is read. Read-only for now. */
export default async function ApproveClaimsScreen() {
  const { model, viewer } = await loadPeople('approve-claims', (data, now, ctx) => claimApprovals(data, ctx.viewer, now));
  return <ApprovalsScreen queue="claims" model={model} viewer={viewer} />;
}
