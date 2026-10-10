import { todayInMalaysia } from '@/lib/people/dates';
import { buildTimeOffModel } from '@/lib/people/requests';
import { loadPeople } from './parts';
import { MyRequestsScreen, StatusCell } from './my-requests';

const dash = '—';

/** Your own short time-off requests. */
export default async function TimeOffScreen() {
  const { model } = await loadPeople('time-off', async (data, now, ctx) => {
    const today = todayInMalaysia(now);
    // Not linked to an employee: nothing to read, the builder answers "not linked".
    if (ctx.viewer.employeeId === null) return buildTimeOffModel([], ctx.viewer, today);
    return buildTimeOffModel(await data.listTimeOffRequests(), ctx.viewer, today);
  });
  const timeOff = model?.linked ? model : null;

  return (
    <MyRequestsScreen
      title="Time-Off"
      subtitle="Your short time-off requests"
      laterLabel="Request Time-Off"
      model={model}
      kpis={[
        { label: 'This month', value: timeOff ? timeOff.this_month : dash, caption: timeOff?.this_month === 1 ? 'request' : 'requests' },
        { label: 'Approved', value: timeOff ? timeOff.approved : dash, caption: 'this month' },
        { label: 'Pending', value: timeOff ? timeOff.pending : dash, caption: timeOff?.pending === 1 ? 'request' : 'requests' },
        { label: 'Hours', value: timeOff ? timeOff.hours : dash, caption: 'this month' },
      ]}
      summary={null}
      tableSubtitle="Time-off requests and their status"
      columns={['Date', 'From', 'To', 'Duration', 'Reason', 'Status']}
      rows={(timeOff?.rows ?? []).map((r) => ({
        key: r.id,
        cells: [r.date, r.from, r.to, r.duration, <span key="r" className="text-muted-foreground">{r.reason}</span>, <StatusCell key="s" status={r.status} />],
      }))}
      emptyText="You haven't asked for any time-off yet"
    />
  );
}
