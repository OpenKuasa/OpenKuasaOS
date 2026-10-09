import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChartColumn,
  Moon,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import { BarGroup, Sparkline, type Series } from '@/components/charts';
import { LiveDot } from '@/components/ui/live-dot';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/* ---- mock data (Rimba Ventures Sdn Bhd) --------------------------- */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Shift = 'M' | 'N' | 'O';

const SHIFTS: Record<Shift, { label: string; className: string }> = {
  M: { label: 'Morning (9–5)', className: 'bg-primary/10 text-primary' },
  N: { label: 'Night (10–6)', className: 'bg-slate-500/10 text-slate-600' },
  O: { label: 'Off', className: 'bg-muted text-muted-foreground' },
};

const ROWS: { name: string; shifts: Shift[] }[] = [
  { name: 'Aisyah Rahim', shifts: ['M', 'M', 'M', 'M', 'M', 'O', 'O'] },
  { name: 'Faiz Hakim', shifts: ['M', 'M', 'O', 'M', 'M', 'M', 'O'] },
  { name: 'Ahmad Zaki', shifts: ['N', 'N', 'N', 'O', 'N', 'N', 'O'] },
  { name: 'Nurul Huda', shifts: ['M', 'O', 'M', 'M', 'M', 'O', 'M'] },
  { name: 'Lim Wei Jie', shifts: ['O', 'N', 'N', 'N', 'O', 'M', 'M'] },
];

const SHIFTS_FILLED = ROWS.reduce(
  (acc, r) => acc + r.shifts.filter((s) => s !== 'O').length,
  0,
); // 25

/* Coverage by day — morning vs night staff on shift ----------------- */
const COVERAGE_BY_DAY = DAYS.map((label, i) => ({
  label,
  morning: ROWS.filter((r) => r.shifts[i] === 'M').length,
  night: ROWS.filter((r) => r.shifts[i] === 'N').length,
}));
const COVERAGE_SERIES: Series[] = [
  { key: 'morning', label: 'Morning', color: 'var(--chart-1)' },
  { key: 'night', label: 'Night', color: 'var(--chart-4)' },
];

/* Open / to-fill shift slots — LiveDot active when covered ---------- */
type SlotStatus = { slot: string; role: string; filled: boolean; who: string };
const OPEN_SHIFTS: SlotStatus[] = [
  { slot: 'Sun · Night', role: 'Ops on-call', filled: false, who: 'Unassigned' },
  { slot: 'Wed · Morning', role: 'Front desk', filled: false, who: 'Unassigned' },
  { slot: 'Fri · Night', role: 'Security', filled: false, who: 'Unassigned' },
  { slot: 'Sat · Morning', role: 'Retail floor', filled: true, who: 'Lim Wei Jie' },
  { slot: 'Thu · Night', role: 'Warehouse', filled: true, who: 'Lim Wei Jie' },
];
const OPEN_COUNT = OPEN_SHIFTS.filter((s) => !s.filled).length; // 3

/* KPI sparkline trends (last 8 weeks) ------------------------------- */
const SPARK_SHIFTS = [23, 24, 22, 25, 24, 26, 25, 25];
const SPARK_COVERAGE = [82, 84, 83, 86, 85, 88, 87, 88];
const SPARK_OPEN = [6, 5, 7, 4, 5, 3, 4, 3];
const SPARK_NIGHT = [7, 8, 7, 9, 8, 8, 9, 8];

export default function ShiftCalendarScreen() {
  return (
    <ScreenContainer>
      <PageHeader
        title="Shift Calendar"
        subtitle="Weekly shift schedule, Saudara."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Week of 05–11 Oct 2026
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Previous week">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next week">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Shifts this week"
            value={SHIFTS_FILLED}
            delta="+2"
            onPrimary
            chart={
              <Sparkline
                data={SPARK_SHIFTS}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Coverage"
            value="88%"
            delta="+1%"
            deltaTone="up"
            chart={<Sparkline data={SPARK_COVERAGE} color="var(--chart-2)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Open shifts"
            value={OPEN_COUNT}
            delta="-1"
            deltaTone="up"
            chart={<Sparkline data={SPARK_OPEN} color="var(--chart-3)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Night shifts"
            value="8"
            delta="0"
            deltaTone="flat"
            chart={<Sparkline data={SPARK_NIGHT} color="var(--chart-4)" height={36} />}
          />
        </BentoCard>

        {/* Shift grid */}
        <BentoCard
          title="Shift grid"
          subtitle="Mon–Sun · 5 members"
          icon={CalendarDays}
          flush
          className="col-span-2 md:col-span-12"
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Employee</TableHead>
                  {DAYS.map((d) => (
                    <TableHead key={d}>{d}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROWS.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="whitespace-nowrap font-medium">
                      <div className="flex items-center gap-3">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {r.name.charAt(0)}
                        </span>
                        {r.name}
                      </div>
                    </TableCell>
                    {r.shifts.map((s, i) => (
                      <TableCell key={DAYS[i]}>
                        <span
                          className={cn(
                            'inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium',
                            SHIFTS[s].className,
                          )}
                        >
                          {SHIFTS[s].label}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </BentoCard>

        {/* Coverage chart + open shifts list */}
        <BentoCard
          title="Coverage by day"
          subtitle="Staff on shift · morning vs night"
          icon={ChartColumn}
          className="col-span-2 md:col-span-8"
        >
          <BarGroup
            data={COVERAGE_BY_DAY}
            series={COVERAGE_SERIES}
            height={220}
            showLegend
          />
        </BentoCard>
        <BentoCard
          title="Open & upcoming slots"
          subtitle={`${OPEN_COUNT} still to fill`}
          icon={ShieldAlert}
          className="col-span-2 md:col-span-4"
        >
          <ul className="divide-y">
            {OPEN_SHIFTS.map((s) => (
              <li key={`${s.slot}-${s.role}`} className="flex items-center gap-3 py-2.5">
                <LiveDot active={s.filled} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.slot}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.role}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    s.filled
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-amber-500/15 text-amber-600',
                  )}
                >
                  {s.filled ? 'Filled' : 'Open'}
                </span>
              </li>
            ))}
          </ul>
        </BentoCard>

        {/* Shift type legend */}
        <BentoCard
          title="Shift types"
          subtitle="This roster"
          icon={Moon}
          className="col-span-2 md:col-span-6"
        >
          <ul className="flex flex-wrap gap-2">
            {(Object.keys(SHIFTS) as Shift[]).map((s) => (
              <li
                key={s}
                className={cn(
                  'inline-flex items-center rounded px-2 py-1 text-xs font-medium',
                  SHIFTS[s].className,
                )}
              >
                {SHIFTS[s].label}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Rest days follow Akta Kerja 1955 — one rest day per week per employee.
          </p>
        </BentoCard>
        <BentoCard
          title="On shift now"
          subtitle="Currently clocked in"
          icon={Users}
          className="col-span-2 md:col-span-6"
        >
          <BentoStat label="Members" value="3" delta="live" deltaTone="up" />
          <p className="mt-2 text-xs text-muted-foreground">
            Aisyah Rahim, Faiz Hakim and Nurul Huda on the morning shift.
          </p>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
