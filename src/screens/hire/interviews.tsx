import {
  BarChart3,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  MapPin,
  Phone,
  Plus,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import { BarGroup, type Series } from '@/components/charts';
import { LiveDot } from '@/components/ui/live-dot';
import { Badge } from '@/components/ui/badge';
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
import { ROWS_SHOWN, buildInterviewsModel, type InterviewsModel } from '@/lib/hire/lists';
import { LOAD_FAILED, Muted, loadHire } from '@/screens/hire/parts';

type Interview = InterviewsModel['rows'][number];

const STATUS_STYLES: Record<Interview['status'], string> = {
  Scheduled: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  Completed: 'bg-muted text-muted-foreground',
  Cancelled: 'bg-red-500/15 text-red-600 dark:text-red-400',
  'No-show': 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const TYPE_ICONS: Record<Interview['type'], LucideIcon> = {
  Video,
  Onsite: MapPin,
  Phone,
};

const WEEK_SERIES: Series[] = [
  { key: 'count', label: 'Interviews', color: 'var(--chart-1)' },
];

function UpcomingRow({ interview }: { interview: Interview }) {
  const TypeIcon = TYPE_ICONS[interview.type];
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-primary/10 px-2 py-1 text-primary">
        <span className="text-[10px] font-medium uppercase">
          {interview.date.split(' ')[1]}
        </span>
        <span className="text-base font-bold leading-none tabular-nums">
          {interview.date.split(' ')[0]}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <LiveDot active />
          <p className="truncate text-sm font-semibold">{interview.name}</p>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {interview.role} · {interview.interviewer}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums">
          {interview.time}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <TypeIcon className="size-3" />
          {interview.type}
        </span>
      </div>
    </li>
  );
}

export default async function InterviewsScreen() {
  const { model } = await loadHire('interviews', buildInterviewsModel);
  const upcoming = model?.rows.filter((r) => r.status === 'Scheduled') ?? [];

  return (
    <ScreenContainer>
      <PageHeader
        title="Interviews"
        subtitle="Your upcoming and recent interviews, Saudara."
        actions={
          <Button size="sm" disabled title="Coming soon">
            <Plus className="size-4" />
            Schedule Interview
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row: headline figures only, the tables hold no history to chart */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat label="Scheduled" value={model ? model.scheduled : '—'} onPrimary />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Next 7 days" value={model ? model.next7Days : '—'} />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Completed" value={model ? model.completed : '—'} />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="No-shows" value={model ? model.noShow : '—'} />
        </BentoCard>

        {/* Upcoming list + week load */}
        <BentoCard
          title="Upcoming interviews"
          subtitle={model ? `${model.scheduled} scheduled` : undefined}
          icon={CalendarClock}
          className="col-span-2 md:col-span-8"
        >
          {!model ? LOAD_FAILED : upcoming.length === 0 ? (
            <Muted>No interviews scheduled</Muted>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((interview) => (
                <UpcomingRow key={interview.id} interview={interview} />
              ))}
            </ul>
          )}
        </BentoCard>
        <BentoCard
          title="Next 7 days"
          subtitle="Interviews by weekday (Mon–Fri)"
          icon={BarChart3}
          className="col-span-2 md:col-span-4"
        >
          {!model ? LOAD_FAILED : model.next7Days === 0 ? (
            <Muted>No interviews in the next 7 days</Muted>
          ) : (
            <BarGroup data={model.weekLoad} series={WEEK_SERIES} height={240} />
          )}
        </BentoCard>

        {/* All interviews table */}
        <BentoCard
          title="All interviews"
          subtitle="Upcoming first"
          icon={CalendarDays}
          flush
          className="col-span-2 md:col-span-12"
        >
          {!model ? LOAD_FAILED : model.rows.length === 0 ? (
            <Muted>No interviews yet</Muted>
          ) : (
          <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Candidate</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Interviewer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {model.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <LiveDot active={r.status === 'Scheduled'} />
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {r.name.charAt(0)}
                        </span>
                        <span className="whitespace-nowrap font-medium">
                          {r.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.role}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {r.time}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.interviewer}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_STYLES[r.status],
                        )}
                      >
                        {r.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              {model.rows.length >= ROWS_SHOWN
                ? `Showing the first ${model.rows.length} interviews`
                : `Showing ${model.rows.length} interviews`}
            </span>
            <span className="flex items-center gap-2">
              <CalendarCheck className="size-4" />
              {model.completed} completed
            </span>
          </div>
          </>
          )}
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
