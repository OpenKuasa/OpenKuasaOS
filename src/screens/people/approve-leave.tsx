import { leaveApprovals } from '@/lib/people/approvals';
import { ApprovalsScreen } from './approvals-screen';
import { loadPeople } from './parts';

/** Owners and admins only: anyone else gets the notice and nothing is read. Read-only for now. */
export default async function ApproveLeaveScreen() {
  const { model, viewer } = await loadPeople('approve-leave', (data, now, ctx) => leaveApprovals(data, ctx.viewer, now));
  return <ApprovalsScreen queue="leave" model={model} viewer={viewer} />;
}
