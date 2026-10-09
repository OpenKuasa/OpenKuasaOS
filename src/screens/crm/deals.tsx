import { Filter, Plus, Search, TrendingUp } from 'lucide-react';
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

/* ---- mock data (Rimba Ventures Sdn Bhd — sales pipeline) ---------- */

type Deal = {
  id: string;
  company: string;
  summary: string;
  value: number;
  owner: string;
  lastTouch: string;
  tag?: string;
};

type Stage = {
  name: string;
  dot: string;
  deals: Deal[];
};

const STAGES: Stage[] = [
  {
    name: 'Lead',
    dot: 'bg-primary',
    deals: [
      {
        id: 'd1',
        company: 'Seri Mutiara Enterprise',
        summary: 'POS rollout — 4 outlets',
        value: 18000,
        owner: 'Aisyah Rahim',
        lastTouch: '3h ago',
        tag: 'Inbound',
      },
      {
        id: 'd2',
        company: 'Teratak Kopi',
        summary: 'Loyalty + WhatsApp CRM',
        value: 6400,
        owner: 'Faiz Hakim',
        lastTouch: '1d ago',
      },
    ],
  },
  {
    name: 'Qualified',
    dot: 'bg-blue-500',
    deals: [
      {
        id: 'd3',
        company: 'Langkawi Fresh Sdn Bhd',
        summary: 'Cold-chain order tracking',
        value: 24500,
        owner: 'Nurul Huda',
        lastTouch: '5h ago',
        tag: 'Referral',
      },
      {
        id: 'd4',
        company: 'Bumi Hijau Trading',
        summary: 'Inventory sync + billing',
        value: 9800,
        owner: 'Ahmad Zaki',
        lastTouch: '2d ago',
      },
    ],
  },
  {
    name: 'Proposal',
    dot: 'bg-slate-500',
    deals: [
      {
        id: 'd5',
        company: 'Nusantara Logistics',
        summary: 'Fleet & dispatch dashboard',
        value: 42000,
        owner: 'Aisyah Rahim',
        lastTouch: '1d ago',
        tag: 'High value',
      },
      {
        id: 'd6',
        company: 'Cahaya Tekstil',
        summary: 'E-invoice (LHDN) setup',
        value: 12200,
        owner: 'Faiz Hakim',
        lastTouch: '4h ago',
      },
    ],
  },
  {
    name: 'Negotiation',
    dot: 'bg-amber-500',
    deals: [
      {
        id: 'd7',
        company: 'Delima Properties',
        summary: 'Annual CRM retainer',
        value: 36000,
        owner: 'Nurul Huda',
        lastTouch: '2d ago',
        tag: 'Renewal',
      },
      {
        id: 'd8',
        company: 'Zamrud Hardware',
        summary: 'Multi-store POS + stock',
        value: 15600,
        owner: 'Ahmad Zaki',
        lastTouch: '6h ago',
      },
    ],
  },
  {
    name: 'Won',
    dot: 'bg-emerald-500',
    deals: [
      {
        id: 'd9',
        company: 'Warung Selera Group',
        summary: 'Franchise CRM — 9 branches',
        value: 28000,
        owner: 'Aisyah Rahim',
        lastTouch: '3d ago',
        tag: 'Closed',
      },
      {
        id: 'd10',
        company: 'Kedai Runcit Maju',
        summary: 'Billing & receipts module',
        value: 7900,
        owner: 'Faiz Hakim',
        lastTouch: '1w ago',
      },
    ],
  },
];

const DEALS_TREND = [
  { label: 'Wk1', created: 9, won: 3 },
  { label: 'Wk2', created: 12, won: 4 },
  { label: 'Wk3', created: 10, won: 4 },
  { label: 'Wk4', created: 14, won: 6 },
  { label: 'Wk5', created: 11, won: 5 },
  { label: 'Wk6', created: 15, won: 7 },
  { label: 'Wk7', created: 13, won: 6 },
  { label: 'Wk8', created: 17, won: 8 },
];
const DEALS_SERIES: Series[] = [
  { key: 'created', label: 'Created', color: 'var(--chart-1)' },
  { key: 'won', label: 'Won', color: 'var(--chart-2)' },
];

const PIPELINE_FUNNEL: Slice[] = [
  { key: 'lead', label: 'Lead', value: 48, color: 'var(--chart-1)' },
  { key: 'qualified', label: 'Qualified', value: 32, color: 'var(--chart-2)' },
  { key: 'proposal', label: 'Proposal', value: 21, color: 'var(--chart-5)' },
  { key: 'negotiation', label: 'Negotiation', value: 13, color: 'var(--chart-3)' },
  { key: 'won', label: 'Won', value: 9, color: 'var(--chart-4)' },
];

const formatRM = (n: number) => `RM ${n.toLocaleString('en-MY')}`;

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);

const totalDeals = STAGES.reduce((sum, s) => sum + s.deals.length, 0);

function DealCard({ deal }: { deal: Deal }) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
          {deal.company}
        </p>
        {deal.tag ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {deal.tag}
          </span>
        ) : null}
      </div>
      <p className="truncate text-xs text-muted-foreground">{deal.summary}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatRM(deal.value)}
        </span>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            {initials(deal.owner)}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {deal.owner}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Last touch · {deal.lastTouch}
      </p>
    </div>
  );
}

export default function DealsScreen() {
  return (
    <ScreenContainer>
      <PageHeader
        title="Deals"
        subtitle="Your sales pipeline — move deals toward close, Saudara."
        actions={
          <>
            <Button variant="outline" size="sm">
              Daily Report
            </Button>
            <Button size="sm">
              <Plus className="size-4" />
              New Deal
            </Button>
          </>
        }
      />

      <BentoGrid className="mb-6">
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Pipeline value"
            value="RM 164.5k"
            delta="+9%"
            onPrimary
            chart={
              <Sparkline
                data={[118, 126, 131, 140, 149, 155, 160, 164.5]}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Open deals"
            value="8"
            delta="+2"
            deltaTone="up"
            chart={
              <Sparkline
                data={[5, 6, 6, 7, 7, 8, 8, 8]}
                color="var(--chart-2)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Avg deal size"
            value="RM 20.6k"
            delta="+6%"
            deltaTone="up"
            chart={
              <Sparkline
                data={[16.2, 17.1, 17.8, 18.5, 19.2, 19.8, 20.1, 20.6]}
                color="var(--chart-5)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Win rate"
            value="38%"
            delta="+3pt"
            deltaTone="up"
            chart={
              <Sparkline
                data={[31, 33, 32, 34, 35, 36, 37, 38]}
                color="var(--chart-3)"
                height={36}
              />
            }
          />
        </BentoCard>

        {/* Trend + pipeline funnel */}
        <BentoCard
          title="Deals created vs won"
          subtitle="Last 8 weeks"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend
            data={DEALS_TREND}
            series={DEALS_SERIES}
            height={240}
            showLegend
          />
        </BentoCard>
        <BentoCard
          title="Pipeline by stage"
          subtitle="Deals in flight"
          icon={Filter}
          className="col-span-2 md:col-span-4"
        >
          <FunnelFlow data={PIPELINE_FUNNEL} height={240} />
        </BentoCard>
      </BentoGrid>

      {/* Pipeline board */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <LiveDot active />
        <h2 className="text-sm font-semibold">Pipeline board</h2>
        <span className="text-xs text-muted-foreground">
          5 stages · {totalDeals} deals
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search deals across all stages…"
            className="pl-9"
          />
        </div>
        <Select defaultValue="default">
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default pipeline</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="all">
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const total = stage.deals.reduce((sum, d) => sum + d.value, 0);
          return (
            <div
              key={stage.name}
              className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 p-2"
            >
              <div className="mb-2 px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${stage.dot}`} />
                  <span className="text-sm font-semibold">{stage.name}</span>
                  <span className="ml-auto rounded-full bg-background px-2 text-xs text-muted-foreground">
                    {stage.deals.length}
                  </span>
                </div>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {formatRM(total)}
                </p>
              </div>
              <div className="space-y-2">
                {stage.deals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ScreenContainer>
  );
}
