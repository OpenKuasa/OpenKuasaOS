import { overtimeApprovals } from '@/lib/people/approvals';
import { ApprovalsScreen } from './approvals-screen';
import { loadPeople } from './parts';

/** Owners and admins only: anyone else gets the notice and nothing is read. Read-only for now. */
export default async function ApproveOvertimeScreen() {
  const { model, viewer } = await loadPeople('approve-overtime', (data, now, ctx) => overtimeApprovals(data, ctx.viewer, now));
  return <ApprovalsScreen queue="overtime" model={model} viewer={viewer} />;
}
