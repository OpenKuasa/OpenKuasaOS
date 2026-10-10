import { CalendarDays, Moon } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SHIFT_LABEL, buildShiftCalendar, currentWeek } from '@/lib/people/attendance';
import { formatDay, todayInMalaysia } from '@/lib/people/dates';
import type { ShiftKind } from '@/lib/people/types';
import { cn } from '@/lib/utils';
import { EmployeeCell, LOAD_FAILED, Muted, loadPeople } from './parts';

const SHIFT_CLASS: Record<ShiftKind, string> = {
  morning: 'bg-primary/10 text-primary',
  night: 'bg-slate-500/10 text-slate-600',
  off: 'bg-muted text-muted-foreground',
};

/** The current week's roster. HR and the demo see everyone; anyone else sees only their own shifts. */
export default async function ShiftCalendarScreen() {
  const { model } = await loadPeople('shift-calendar', async (data, now, ctx) => {
    const today = todayInMalaysia(now);
    const week = currentWeek(today);
    const [shifts, employees] = await Promise.all([data.listShifts(week.start, week.end), data.listEmployees()]);
    return buildShiftCalendar({ shifts, employees, viewer: ctx.viewer, today });
  });

  const dash = '—';
  const team = model?.team ?? true;

  return (
    <ScreenContainer>
      <PageHeader
        title="Shift Calendar"
        subtitle={
          model
            ? `${team ? 'Weekly shift schedule' : 'Your shifts'} · week of ${formatDay(model.week_start)} to ${formatDay(model.week_end)}`
            : 'Weekly shift schedule'
        }
      />

      <BentoGrid>
        {team ? (
          <>
            <BentoCard tone="primary" className="col-span-1 md:col-span-6">
              <BentoStat label="Morning shifts this week" value={model ? model.morning_count : dash} onPrimary />
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-6">
              <BentoStat label="Night shifts this week" value={model ? model.night_count : dash} />
            </BentoCard>
          </>
        ) : null}

        <BentoCard
          title="Shift grid"
          subtitle={team ? 'Monday to Sunday' : 'Your records · Monday to Sunday'}
          icon={CalendarDays}
          flush
          className="col-span-2 md:col-span-12"
        >
          {!model ? (
            LOAD_FAILED
          ) : model.rows.length === 0 ? (
            <Muted>No shifts are set for this week</Muted>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Employee</TableHead>
                    {model.days.map((d) => (
                      <TableHead key={d.date}>{d.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {model.rows.map((row) => (
                    <TableRow key={row.employee_id}>
                      <TableCell>
                        <EmployeeCell name={row.name} sub={row.department} />
                      </TableCell>
                      {row.cells.map((cell, i) => (
                        <TableCell key={model.days[i].date}>
                          {cell ? (
                            <span
                              className={cn(
                                'inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium',
                                SHIFT_CLASS[cell],
                              )}
                            >
                              {SHIFT_LABEL[cell]}
                            </span>
                          ) : null}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </BentoCard>

        <BentoCard title="Shift types" subtitle="Used in this roster" icon={Moon} className="col-span-2 md:col-span-12">
          <ul className="flex flex-wrap gap-2">
            {(Object.keys(SHIFT_LABEL) as ShiftKind[]).map((kind) => (
              <li
                key={kind}
                className={cn('inline-flex items-center rounded px-2 py-1 text-xs font-medium', SHIFT_CLASS[kind])}
              >
                {SHIFT_LABEL[kind]}
              </li>
            ))}
          </ul>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
