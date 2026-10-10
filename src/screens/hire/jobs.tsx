import { BarChart3, Briefcase, PieChart, Plus, Search } from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  BarGroup,
  DonutStat,
  type Series,
  type Slice,
} from '@/components/charts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LiveDot } from '@/components/ui/live-dot';
import { buildJobsModel } from '@/lib/hire/lists';
import { cn } from '@/lib/utils';
import { LOAD_FAILED, Muted, NOT_AVAILABLE, loadHire } from '@/screens/hire/parts';

/* ---- static config ------------------------------------------------ */

type JobStatus = 'Open' | 'Paused' | 'Closed' | 'Draft';

const APPLICANTS_SERIES: Series[] = [
  { key: 'applicants', label: 'Applicants', color: 'var(--chart-2)' },
];

const STATUS_COLOR: Record<string, string> = {
  open: 'var(--chart-1)',
  paused: 'var(--chart-3)',
  closed: 'var(--chart-4)',
  draft: 'var(--chart-2)',
};

const PILL: Record<JobStatus, string> = {
  Open: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  Paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  Closed: 'bg-muted text-muted-foreground',
  Draft: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
};

/* ------------------------------------------------------------------ */

export default async function JobsScreen() {
  const { model } = await loadHire('jobs', buildJobsModel);
  const statusMix: Slice[] = (model?.statusMix ?? []).map((s) => ({
    ...s,
    color: STATUS_COLOR[s.key],
  }));

  const departments = [...new Set((model?.rows ?? []).map((r) => r.dept))].filter((d) => d !== '—');

  return (
    <ScreenContainer>
      <PageHeader
        title="Jobs"
        subtitle="Your open positions, Saudara."
        actions={
          <Button size="sm" disabled title="Coming soon">
            <Plus className="size-4" />
            Post a Job
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Open roles"
            value={model ? String(model.openJobs) : '—'}
            onPrimary
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Total applicants"
            value={model ? String(model.totalApplicants) : '—'}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <p className="text-sm text-muted-foreground">Avg time-to-fill</p>
          {NOT_AVAILABLE}
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <p className="text-sm text-muted-foreground">Filled · YTD</p>
          {NOT_AVAILABLE}
        </BentoCard>

        {/* Applicants by job + status mix */}
        <BentoCard
          title="Applicants by job"
          subtitle="Open roles"
          icon={BarChart3}
          className="col-span-2 md:col-span-8"
        >
          {!model ? LOAD_FAILED : model.byJob.length === 0 ? (
            <Muted>No open jobs yet</Muted>
          ) : (
            <BarGroup
              data={model.byJob}
              series={APPLICANTS_SERIES}
              horizontal
              height={240}
            />
          )}
        </BentoCard>
        <BentoCard
          title="Jobs by status"
          subtitle="All postings"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          {!model ? LOAD_FAILED : model.isEmpty ? (
            <Muted>No jobs yet</Muted>
          ) : (
            <DonutStat
              data={statusMix}
              height={240}
              centerValue={String(model.rows.length)}
              centerLabel="jobs"
            />
          )}
        </BentoCard>

        {/* Jobs table */}
        <BentoCard
          title="All jobs"
          subtitle="Positions & applicants"
          icon={Briefcase}
          flush
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search jobs…" className="pl-9" disabled title="Coming soon" />
            </div>
            <Select defaultValue="all" disabled>
              <SelectTrigger className="w-44" title="Coming soon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select defaultValue="all" disabled>
              <SelectTrigger className="w-40" title="Coming soon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!model ? LOAD_FAILED : model.isEmpty ? (
            <Muted>No jobs yet</Muted>
          ) : (
            <>
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Role</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Applicants</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Posted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {model.rows.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="whitespace-nowrap font-medium">
                          <span className="flex items-center gap-2.5">
                            <LiveDot active={job.status === 'Open'} />
                            {job.title}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {job.dept}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {job.applicants}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                              PILL[job.status],
                            )}
                          >
                            {job.status}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {job.posted}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t px-4 py-3 text-sm text-muted-foreground">
                Showing {model.rows.length} jobs · {model.totalApplicants} applicants
              </div>
            </>
          )}
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
