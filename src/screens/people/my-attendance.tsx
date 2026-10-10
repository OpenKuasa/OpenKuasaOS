import { AlarmClock, CalendarCheck, Clock, LogIn, TrendingUp, Umbrella } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { AreaTrend, DonutStat, HeatGrid, type Series, type Slice } from '@/components/charts';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { LiveDot } from '@/components/ui/live-dot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { attendanceWindowStart, buildMyAttendance } from '@/lib/people/attendance';
import { todayInMalaysia } from '@/lib/people/dates';
import { LOAD_FAILED, LaterButton, Muted, NotLinkedCard, StatusPill, loadPeople } from './parts';

const HOURS_SERIES: Series[] = [{ key: 'hours', label: 'Hours worked', color: 'var(--chart-1)' }];
const LEAVE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-3)', 'var(--muted-foreground)'];

/** The signed-in employee's own attendance. An owner's is the owner's, never the team's. */
export default async function MyAttendanceScreen() {
  const { model } = await loadPeople('my-attendance', async (data, now, ctx) => {
    const today = todayInMalaysia(now);
    // Not linked to an employee: nothing to read, the builder answers "not linked".
    if (ctx.viewer.employeeId === null) {
      return buildMyAttendance({ days: [], leave: [], balances: [], viewer: ctx.viewer, today });
    }
    const [days, leave, balances] = await Promise.all([
      data.listAttendance(attendanceWindowStart(today), today),
      data.listLeaveRequests(),
      data.listLeaveBalances(Number(today.slice(0, 4))),
    ]);
    return buildMyAttendance({ days, leave, balances, viewer: ctx.viewer, today });
  });

  const dash = '—';
  const leaveMix: Slice[] = (model?.leave_by_type ?? []).map((row, index) => ({
    key: row.key,
    label: row.label,
    value: row.days,
    color: LEAVE_COLORS[index % LEAVE_COLORS.length],
  }));

  return (
    <ScreenContainer>
      <PageHeader
        title="My Attendance"
        subtitle="Your clock-ins, hours and leave balance."
        actions={
          <LaterButton icon={LogIn} size="sm">
            Clock In
          </LaterButton>
        }
      />

      <BentoGrid>
        {model && !model.linked ? (
          <NotLinkedCard />
        ) : (
          <>
            <BentoCard tone="primary" className="col-span-1 md:col-span-3">
              <BentoStat
                label="Days present"
                value={model ? model.month.present : dash}
                delta={model ? `of ${model.month.recorded} recorded days` : undefined}
                deltaTone="flat"
                onPrimary
              />
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-3">
              <BentoStat label="Average clock-in" value={model?.month.avg_clock_in ?? dash} />
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-3">
              <BentoStat
                label="Late this month"
                value={model ? model.month.late : dash}
                delta={model ? 'this month' : undefined}
                deltaTone="flat"
              />
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-3">
              <BentoStat
                label="Annual leave left"
                value={model?.annual_left ?? dash}
                delta={model?.annual_left != null ? 'days left' : undefined}
                deltaTone="flat"
              />
            </BentoCard>

            <BentoCard
              title="Hours worked"
              subtitle="Last 10 recorded days"
              icon={TrendingUp}
              className="col-span-2 md:col-span-8"
            >
              {!model ? (
                LOAD_FAILED
              ) : model.hours.length === 0 ? (
                <Muted>No completed days recorded yet</Muted>
              ) : (
                <AreaTrend data={model.hours} series={HOURS_SERIES} height={240} />
              )}
            </BentoCard>
            <BentoCard
              title="Attendance pattern"
              subtitle="Hours per day · 8 weeks, by week starting"
              icon={CalendarCheck}
              className="col-span-2 md:col-span-4"
              bodyClassName="flex items-center"
            >
              {!model ? (
                LOAD_FAILED
              ) : model.pattern.values.flat().every((v) => v === 0) ? (
                <Muted>No hours recorded in the last 8 weeks</Muted>
              ) : (
                <HeatGrid
                  xLabels={model.pattern.days}
                  yLabels={model.pattern.weeks}
                  values={model.pattern.values}
                  color="var(--chart-1)"
                />
              )}
            </BentoCard>

            <BentoCard
              title="Leave taken by type"
              subtitle="Approved · this year"
              icon={Umbrella}
              className="col-span-2 md:col-span-4"
            >
              {!model ? (
                LOAD_FAILED
              ) : leaveMix.length === 0 ? (
                <Muted>No approved leave this year</Muted>
              ) : (
                <DonutStat
                  data={leaveMix}
                  height={240}
                  centerValue={String(model.leave_total)}
                  centerLabel="days taken"
                />
              )}
            </BentoCard>

            <BentoCard
              title="Recent clock-ins"
              subtitle="Clock-in and clock-out history"
              icon={Clock}
              flush
              className="col-span-2 md:col-span-8"
            >
              {!model ? (
                LOAD_FAILED
              ) : model.recent.length === 0 ? (
                <Muted>No attendance recorded yet</Muted>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {model.recent.map((row) => (
                        <TableRow key={row.work_date}>
                          <TableCell className="whitespace-nowrap font-medium">
                            <span className="flex items-center gap-2">
                              {row.is_today ? <LiveDot active /> : null}
                              {row.date_label}
                            </span>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            <span className="flex items-center gap-1.5">
                              {row.status === 'late' ? <AlarmClock className="size-3.5 text-amber-600" aria-hidden /> : null}
                              {row.clock_in ?? dash}
                            </span>
                          </TableCell>
                          <TableCell className="tabular-nums">{row.clock_out ?? dash}</TableCell>
                          <TableCell className="tabular-nums">{row.hours === null ? dash : row.hours.toFixed(1)}</TableCell>
                          <TableCell>
                            <StatusPill tone={row.tone}>{row.status_label}</StatusPill>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </BentoCard>
          </>
        )}
      </BentoGrid>
    </ScreenContainer>
  );
}
