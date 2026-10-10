import {
  Activity,
  Filter,
  Flame,
  Gauge,
  ListChecks,
  PieChart,
  TrendingUp,
  Users,
} from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  AreaTrend,
  BarGroup,
  DonutStat,
  FunnelFlow,
  RadialGauge,
  Sparkline,
  type Series,
  type Slice,
} from '@/components/charts';
import { LiveDot } from '@/components/ui/live-dot';
import { createClient } from '@/lib/supabase/server';
import { isLiveChatAllowed } from '@/lib/ai/access';
import { cn } from '@/lib/utils';
import { AskKasturiHero } from './ask-kasturi-hero';

/* ---- mock data (Rimba Ventures Sdn Bhd) --------------------------- */

const REVENUE_TREND = [
  { label: 'Mar', revenue: 78, deals: 9 },
  { label: 'Apr', revenue: 92, deals: 11 },
  { label: 'May', revenue: 85, deals: 10 },
  { label: 'Jun', revenue: 104, deals: 14 },
  { label: 'Jul', revenue: 96, deals: 12 },
  { label: 'Aug', revenue: 118, deals: 16 },
  { label: 'Sep', revenue: 112, deals: 15 },
  { label: 'Oct', revenue: 128, deals: 18 },
];
const REVENUE_SERIES: Series[] = [
  { key: 'revenue', label: 'Revenue won (RM K)', color: 'var(--chart-1)' },
  { key: 'deals', label: 'Deals won', color: 'var(--chart-2)' },
];

const STAGE_MIX: Slice[] = [
  { key: 'lead', label: 'Lead', value: 12, color: 'var(--chart-1)' },
  { key: 'qualified', label: 'Qualified', value: 9, color: 'var(--chart-2)' },
  { key: 'proposal', label: 'Proposal', value: 8, color: 'var(--chart-5)' },
  { key: 'negotiation', label: 'Negotiation', value: 6, color: 'var(--chart-3)' },
  { key: 'won', label: 'Won', value: 3, color: 'var(--chart-4)' },
];

const PIPELINE: Slice[] = [
  { key: 'lead', label: 'Lead', value: 120, color: 'var(--chart-1)' },
  { key: 'qualified', label: 'Qualified', value: 78, color: 'var(--chart-2)' },
  { key: 'proposal', label: 'Proposal', value: 52, color: 'var(--chart-5)' },
  { key: 'negotiation', label: 'Negotiation', value: 34, color: 'var(--chart-3)' },
  { key: 'won', label: 'Won', value: 18, color: 'var(--chart-4)' },
];

const DEALS_BY_OWNER = [
  { label: 'Aisyah', deals: 12 },
  { label: 'Faiz', deals: 9 },
  { label: 'Nurul', deals: 8 },
  { label: 'Zaki', deals: 9 },
];
const OWNER_SERIES: Series[] = [
  { key: 'deals', label: 'Open deals', color: 'var(--chart-2)' },
];

type ClosingDeal = {
  name: string;
  value: number;
  stage: string;
  hot: boolean;
};
const CLOSING_SOON: ClosingDeal[] = [
  { name: 'Lim Hardware — Fitout', value: 15000, stage: 'Negotiation', hot: true },
  { name: 'Aisyah Trading — Bulk order', value: 12000, stage: 'Proposal', hot: true },
  { name: 'Nurul Boutique — POS setup', value: 8900, stage: 'Qualified', hot: true },
  { name: 'Siti Decor — Event', value: 7200, stage: 'Proposal', hot: false },
  { name: 'Faiz Studio — Branding', value: 5400, stage: 'Qualified', hot: false },
];

const ACTIVITY = [
  { text: 'Aisyah Rahim replied on WhatsApp', when: '8m' },
  { text: 'Proposal sent to Lim Hardware', when: '1h' },
  { text: 'Call booked with Nurul Huda', when: '3h' },
  { text: 'Zaki Enterprise moved to Negotiation', when: '5h' },
  { text: 'Rahman Logistics marked Won — RM 24,000', when: '1d' },
];

const TASKS = [
  { text: 'Follow up with Aisyah Trading on bulk order', when: '10:00am', done: true },
  { text: 'Send revised quote to Lim Hardware', when: '11:30am', done: false },
  { text: 'Call Nurul Huda re: POS setup', when: '2:00pm', done: false },
  { text: 'Prepare proposal for Siti Decor event', when: '4:00pm', done: false },
];

// Each is answered by a lookup Kasturi has, on the workspace's own data.
const PROMPTS = [
  'How much is my pipeline worth?',
  'Which stage holds the most deals?',
  'Show my newest contacts',
];

const formatRM = (n: number) => `RM ${n.toLocaleString('en-MY')}`;

/* ------------------------------------------------------------------ */

export default async function OverviewScreen() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isDemo = !isLiveChatAllowed(user);

  return (
    <ScreenContainer>
      <BentoGrid>
        {/* Ask-Kasturi hero */}
        <BentoCard tone="primary" className="col-span-2 md:col-span-12">
          <AskKasturiHero prompts={PROMPTS} isDemo={isDemo} />
        </BentoCard>

        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Pipeline value"
            value="RM 486K"
            delta="+9%"
            onPrimary
            chart={
              <Sparkline
                data={[380, 410, 395, 430, 445, 460, 472, 486]}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Open deals"
            value="38"
            delta="+4"
            deltaTone="up"
            chart={<Sparkline data={[28, 30, 31, 33, 34, 36, 37, 38]} height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Win rate"
            value="32%"
            delta="+3pt"
            deltaTone="up"
            chart={
              <Sparkline
                data={[25, 26, 27, 28, 29, 30, 31, 32]}
                color="var(--chart-5)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Revenue won · MTD"
            value="RM 128K"
            delta="+15%"
            deltaTone="up"
            chart={
              <Sparkline
                data={[78, 92, 85, 104, 96, 118, 112, 128]}
                color="var(--chart-2)"
                height={36}
              />
            }
          />
        </BentoCard>

        {/* Revenue trend + stage mix */}
        <BentoCard
          title="Revenue & deals over time"
          subtitle="Won · last 8 months"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend data={REVENUE_TREND} series={REVENUE_SERIES} height={240} showLegend />
        </BentoCard>
        <BentoCard title="Deals by stage" icon={PieChart} className="col-span-2 md:col-span-4">
          <DonutStat data={STAGE_MIX} height={240} centerValue="38" centerLabel="open" />
        </BentoCard>

        {/* Pipeline funnel + owners + win rate */}
        <BentoCard
          title="Pipeline"
          subtitle="Lead → won"
          icon={Filter}
          className="col-span-2 md:col-span-4"
        >
          <FunnelFlow data={PIPELINE} height={200} />
        </BentoCard>
        <BentoCard
          title="Deals by owner"
          subtitle="Open deals per rep"
          icon={Users}
          className="col-span-2 md:col-span-4"
        >
          <BarGroup data={DEALS_BY_OWNER} series={OWNER_SERIES} horizontal height={200} />
        </BentoCard>
        <BentoCard
          title="Win rate"
          subtitle="Closed-won share"
          icon={Gauge}
          className="col-span-2 md:col-span-4"
        >
          <RadialGauge value={32} label="won" valueLabel="32%" height={200} />
        </BentoCard>

        {/* Deals closing soon + recent activity */}
        <BentoCard
          title="Deals closing soon"
          subtitle="Next 14 days"
          icon={Flame}
          className="col-span-2 md:col-span-8"
        >
          <ul className="divide-y">
            {CLOSING_SOON.map((d) => (
              <li key={d.name} className="flex items-center gap-3 py-2.5">
                <LiveDot active={d.hot} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {d.name}
                </span>
                <span className="hidden shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary sm:inline-block">
                  {d.stage}
                </span>
                <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {formatRM(d.value)}
                </span>
              </li>
            ))}
          </ul>
        </BentoCard>
        <BentoCard
          title="Recent activity"
          subtitle="Across your deals"
          icon={Activity}
          className="col-span-2 md:col-span-4"
        >
          <ul className="space-y-2.5">
            {ACTIVITY.map((a) => (
              <li key={a.text} className="flex items-start gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 flex-1 text-sm leading-snug">{a.text}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {a.when}
                </span>
              </li>
            ))}
          </ul>
        </BentoCard>

        {/* Today's tasks */}
        <BentoCard
          title="Today's tasks"
          subtitle="Follow-ups & actions"
          icon={ListChecks}
          className="col-span-2 md:col-span-12"
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {TASKS.map((t) => (
              <li
                key={t.text}
                className="flex items-center gap-3 rounded-lg border bg-background/50 px-3 py-2"
              >
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-md border text-[10px]',
                    t.done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-muted-foreground/40 text-transparent',
                  )}
                  aria-hidden
                >
                  ✓
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm',
                    t.done && 'text-muted-foreground line-through',
                  )}
                >
                  {t.text}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {t.when}
                </span>
              </li>
            ))}
          </ul>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
