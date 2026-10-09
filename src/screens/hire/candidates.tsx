import { Filter, Plus, Search, Star, TrendingUp, Users } from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  AreaTrend,
  FunnelFlow,
  Sparkline,
  type Series,
  type Slice,
} from '@/components/charts';
import { LiveDot } from '@/components/ui/live-dot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/* ---- mock data (Rimba Ventures Sdn Bhd — hiring pipeline) --------- */

type Candidate = {
  id: string;
  name: string;
  role: string;
  source: string;
  rating: number;
  lastTouch: string;
  active: boolean;
};

type Stage = {
  name: string;
  dot: string;
  candidates: Candidate[];
};

const STAGES: Stage[] = [
  {
    name: 'Applied',
    dot: 'bg-primary',
    candidates: [
      {
        id: 'c1',
        name: 'Aisyah Rahim',
        role: 'Sales Executive',
        source: 'JobStreet',
        rating: 4,
        lastTouch: '3h ago',
        active: true,
      },
      {
        id: 'c2',
        name: 'Faiz Hakim',
        role: 'Product Designer',
        source: 'LinkedIn',
        rating: 3,
        lastTouch: '8h ago',
        active: true,
      },
      {
        id: 'c3',
        name: 'Ahmad Zaki',
        role: 'Operations',
        source: 'Careers page',
        rating: 3,
        lastTouch: '1d ago',
        active: false,
      },
      {
        id: 'c4',
        name: 'Mei Ling Tan',
        role: 'Software Engineer',
        source: 'Referral',
        rating: 4,
        lastTouch: '1d ago',
        active: true,
      },
    ],
  },
  {
    name: 'Screening',
    dot: 'bg-amber-500',
    candidates: [
      {
        id: 'c5',
        name: 'Nurul Huda',
        role: 'Account Manager',
        source: 'JobStreet',
        rating: 4,
        lastTouch: '5h ago',
        active: true,
      },
      {
        id: 'c6',
        name: 'Siti Aminah',
        role: 'Customer Support',
        source: 'Careers page',
        rating: 3,
        lastTouch: '2d ago',
        active: false,
      },
      {
        id: 'c7',
        name: 'Rajesh Kumar',
        role: 'Software Engineer',
        source: 'LinkedIn',
        rating: 5,
        lastTouch: '6h ago',
        active: true,
      },
    ],
  },
  {
    name: 'Interview',
    dot: 'bg-slate-500',
    candidates: [
      {
        id: 'c8',
        name: 'Lim Wei Jie',
        role: 'Operations',
        source: 'Referral',
        rating: 4,
        lastTouch: '1d ago',
        active: true,
      },
      {
        id: 'c9',
        name: 'Nabila Idris',
        role: 'Product Designer',
        source: 'JobStreet',
        rating: 4,
        lastTouch: '3h ago',
        active: true,
      },
      {
        id: 'c10',
        name: 'Hafiz Omar',
        role: 'Sales Executive',
        source: 'LinkedIn',
        rating: 3,
        lastTouch: '4d ago',
        active: false,
      },
    ],
  },
  {
    name: 'Offer',
    dot: 'bg-blue-500',
    candidates: [
      {
        id: 'c11',
        name: 'Rajesh Nair',
        role: 'Sales Executive',
        source: 'Referral',
        rating: 5,
        lastTouch: '2d ago',
        active: true,
      },
      {
        id: 'c12',
        name: 'Chong Ai Wei',
        role: 'Account Manager',
        source: 'JobStreet',
        rating: 4,
        lastTouch: '1d ago',
        active: true,
      },
    ],
  },
  {
    name: 'Hired',
    dot: 'bg-emerald-500',
    candidates: [
      {
        id: 'c13',
        name: 'Wong Li Fen',
        role: 'Customer Support',
        source: 'Careers page',
        rating: 5,
        lastTouch: '1w ago',
        active: false,
      },
      {
        id: 'c14',
        name: 'Zulkifli Anuar',
        role: 'Software Engineer',
        source: 'LinkedIn',
        rating: 4,
        lastTouch: '2w ago',
        active: false,
      },
    ],
  },
];

const APPLICATIONS_TREND = [
  { label: 'Wk1', applied: 18, shortlisted: 6 },
  { label: 'Wk2', applied: 24, shortlisted: 8 },
  { label: 'Wk3', applied: 21, shortlisted: 7 },
  { label: 'Wk4', applied: 29, shortlisted: 11 },
  { label: 'Wk5', applied: 26, shortlisted: 9 },
  { label: 'Wk6', applied: 33, shortlisted: 13 },
  { label: 'Wk7', applied: 30, shortlisted: 12 },
  { label: 'Wk8', applied: 38, shortlisted: 15 },
];
const APPLICATIONS_SERIES: Series[] = [
  { key: 'applied', label: 'Applied', color: 'var(--chart-1)' },
  { key: 'shortlisted', label: 'Shortlisted', color: 'var(--chart-2)' },
];

const HIRING_FUNNEL: Slice[] = [
  { key: 'applied', label: 'Applied', value: 218, color: 'var(--chart-1)' },
  { key: 'screening', label: 'Screening', value: 96, color: 'var(--chart-2)' },
  { key: 'interview', label: 'Interview', value: 41, color: 'var(--chart-5)' },
  { key: 'offer', label: 'Offer', value: 14, color: 'var(--chart-3)' },
  { key: 'hired', label: 'Hired', value: 8, color: 'var(--chart-4)' },
];

const stageCount = (name: string) =>
  STAGES.find((s) => s.name === name)?.candidates.length ?? 0;

const totalCandidates = STAGES.reduce((sum, s) => sum + s.candidates.length, 0);
const hiredCount = stageCount('Hired');
const inPipeline = totalCandidates - hiredCount;
const interviewing = stageCount('Interview');
const offers = stageCount('Offer');

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`Rating ${rating}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            'size-3',
            i < rating
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/30',
          )}
        />
      ))}
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
          {candidate.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {candidate.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {candidate.role}
          </p>
        </div>
        <LiveDot active={candidate.active} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Stars rating={candidate.rating} />
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {candidate.source}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Last touch · {candidate.lastTouch}
      </p>
    </div>
  );
}

export default function CandidatesScreen() {
  return (
    <ScreenContainer>
      <PageHeader
        title="Candidates"
        subtitle="Move candidates through your hiring pipeline, Saudara."
        actions={
          <>
            <Button variant="outline" size="sm">
              Export
            </Button>
            <Button size="sm">
              <Plus className="size-4" />
              Add Candidate
            </Button>
          </>
        }
      />

      <BentoGrid className="mb-6">
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Candidates"
            value={totalCandidates}
            delta="+12"
            onPrimary
            chart={
              <Sparkline
                data={[6, 8, 9, 10, 11, 12, 13, totalCandidates]}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="In pipeline"
            value={inPipeline}
            delta="+5"
            deltaTone="up"
            chart={
              <Sparkline
                data={[7, 8, 9, 9, 10, 11, 11, inPipeline]}
                color="var(--chart-2)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Interviewing"
            value={interviewing}
            delta="+1"
            deltaTone="up"
            chart={
              <Sparkline
                data={[1, 2, 2, 2, 3, 3, 3, interviewing]}
                color="var(--chart-5)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Offers"
            value={offers}
            delta="+1"
            deltaTone="up"
            chart={
              <Sparkline
                data={[0, 1, 1, 1, 1, 2, 2, offers]}
                color="var(--chart-3)"
                height={36}
              />
            }
          />
        </BentoCard>

        {/* Trend + hiring funnel */}
        <BentoCard
          title="Applications over time"
          subtitle="Last 8 weeks"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend
            data={APPLICATIONS_TREND}
            series={APPLICATIONS_SERIES}
            height={240}
            showLegend
          />
        </BentoCard>
        <BentoCard
          title="Hiring funnel"
          subtitle="Applied → Hired"
          icon={Filter}
          className="col-span-2 md:col-span-4"
        >
          <FunnelFlow data={HIRING_FUNNEL} height={240} />
        </BentoCard>
      </BentoGrid>

      {/* Pipeline board */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <LiveDot active />
        <h2 className="text-sm font-semibold">Pipeline board</h2>
        <span className="text-xs text-muted-foreground">
          5 stages · {totalCandidates} candidates
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search candidates across all stages…"
            className="pl-9"
          />
        </div>
        <Select defaultValue="all">
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jobs</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="all-sources">
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-sources">All sources</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <div
            key={stage.name}
            className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 p-2"
          >
            <div className="mb-2 flex items-center gap-2 px-2 py-1.5">
              <span className={`size-2 rounded-full ${stage.dot}`} />
              <span className="text-sm font-semibold">{stage.name}</span>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-background px-2 text-xs text-muted-foreground">
                <Users className="size-3" />
                {stage.candidates.length}
              </span>
            </div>
            <div className="space-y-2">
              {stage.candidates.map((candidate) => (
                <CandidateCard key={candidate.id} candidate={candidate} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScreenContainer>
  );
}
