import {
  Bot,
  CalendarDays,
  Coins,
  Filter,
  HeartPulse,
  Megaphone,
  PieChart,
  TrendingUp,
} from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  AreaTrend,
  BarGroup,
  DonutStat,
  FunnelFlow,
  HeatGrid,
  RadialGauge,
  Sparkline,
  type Series,
  type Slice,
} from '@/components/charts';
import { LiveDot } from '@/components/ui/live-dot';
import { AskJebatHero } from '@/components/reach/ask-jebat-hero';
import { createClient } from '@/lib/supabase/server';
import { isLiveChatAllowed } from '@/lib/ai/access';

/* ---- mock data (Rimba Ventures Sdn Bhd) --------------------------- */

const LEADS_TREND = [
  { label: 'Wk1', leads: 34, qualified: 12 },
  { label: 'Wk2', leads: 41, qualified: 16 },
  { label: 'Wk3', leads: 38, qualified: 15 },
  { label: 'Wk4', leads: 52, qualified: 22 },
  { label: 'Wk5', leads: 48, qualified: 24 },
  { label: 'Wk6', leads: 63, qualified: 29 },
  { label: 'Wk7', leads: 59, qualified: 31 },
  { label: 'Wk8', leads: 72, qualified: 38 },
];
const LEADS_SERIES: Series[] = [
  { key: 'leads', label: 'Leads', color: 'var(--chart-1)' },
  { key: 'qualified', label: 'Qualified', color: 'var(--chart-2)' },
];

const CHANNEL_MIX: Slice[] = [
  { key: 'whatsapp', label: 'WhatsApp', value: 142, color: 'var(--chart-1)' },
  { key: 'facebook', label: 'Facebook', value: 96, color: 'var(--chart-2)' },
  { key: 'instagram', label: 'Instagram', value: 68, color: 'var(--chart-5)' },
  { key: 'tiktok', label: 'TikTok', value: 36, color: 'var(--chart-3)' },
];

const SPEND_BY_CHANNEL = [
  { label: 'WhatsApp', spend: 3400 },
  { label: 'Facebook', spend: 2600 },
  { label: 'Instagram', spend: 1800 },
  { label: 'TikTok', spend: 1140 },
];
const SPEND_SERIES: Series[] = [
  { key: 'spend', label: 'Spend (RM)', color: 'var(--chart-2)' },
];

const FUNNEL: Slice[] = [
  { key: 'leads', label: 'Leads', value: 342, color: 'var(--chart-1)' },
  { key: 'contacted', label: 'Contacted', value: 264, color: 'var(--chart-2)' },
  { key: 'qualified', label: 'Qualified', value: 158, color: 'var(--chart-5)' },
  { key: 'booked', label: 'Booked', value: 96, color: 'var(--chart-3)' },
  { key: 'won', label: 'Won', value: 48, color: 'var(--chart-4)' },
];

const HEAT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HEAT_SLOTS = ['6a', '9a', '12p', '3p', '6p', '9p'];
const HEAT_VALUES = [
  [1, 3, 5, 4, 8, 6],
  [2, 4, 6, 5, 9, 7],
  [1, 3, 5, 6, 8, 6],
  [2, 5, 7, 6, 10, 8],
  [3, 6, 8, 7, 11, 9],
  [4, 7, 9, 10, 12, 11],
  [3, 6, 8, 9, 11, 10],
];

type Campaign = {
  name: string;
  leads: number;
  cpl: string;
  status: 'Active' | 'Paused';
};
const CAMPAIGNS: Campaign[] = [
  { name: 'Ramadan–Raya Promo', leads: 96, cpl: 'RM 12.50', status: 'Active' },
  { name: 'Lead Magnet — eBook', leads: 61, cpl: 'RM 6.88', status: 'Active' },
  { name: 'Retargeting — Cart', leads: 54, cpl: 'RM 11.85', status: 'Active' },
  { name: 'New Product Launch', leads: 70, cpl: 'RM 26.40', status: 'Paused' },
  { name: 'Brand Awareness', leads: 18, cpl: 'RM 50.00', status: 'Paused' },
];

const AGENTS = [
  { name: 'Lead Qualifier', active: true },
  { name: 'Ad Optimizer', active: true },
  { name: 'Follow-up Writer', active: true },
  { name: 'Audience Finder', active: false },
];

const APPOINTMENTS = [
  { name: 'Aisyah Rahim', kind: 'Discovery call', when: 'Today · 2:30pm', via: 'WhatsApp' },
  { name: 'Faiz Hakim', kind: 'Product demo', when: 'Tomorrow · 10:00am', via: 'Zoom' },
  { name: 'Nurul Huda', kind: 'Follow-up', when: 'Thu · 4:00pm', via: 'Call' },
];

const PROMPTS = [
  'Draft a Raya promo campaign',
  'Which ad is performing best?',
  'Lower my cost per lead',
];

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
        {/* Ask-Jebat hero */}
        <BentoCard tone="primary" className="col-span-2 md:col-span-12">
          <AskJebatHero prompts={PROMPTS} isDemo={isDemo} />
        </BentoCard>

        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Leads this month"
            value="342"
            delta="+12%"
            onPrimary
            chart={
              <Sparkline
                data={[34, 41, 38, 52, 48, 63, 59, 72]}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Ad spend"
            value="RM 8,940"
            delta="+4%"
            deltaTone="flat"
            chart={<Sparkline data={[6.1, 6.4, 6.0, 7.2, 7.8, 8.1, 8.6, 8.9]} height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Cost / lead"
            value="RM 6.10"
            delta="−8%"
            deltaTone="up"
            chart={
              <Sparkline
                data={[7.4, 7.1, 7.3, 6.8, 6.6, 6.4, 6.2, 6.1]}
                color="var(--chart-3)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Conversion"
            value="4.8%"
            delta="+0.6pt"
            deltaTone="up"
            chart={
              <Sparkline
                data={[3.9, 4.0, 4.1, 4.3, 4.4, 4.5, 4.7, 4.8]}
                color="var(--chart-2)"
                height={36}
              />
            }
          />
        </BentoCard>

        {/* Leads over time + channel mix */}
        <BentoCard
          title="Leads over time"
          subtitle="Last 8 weeks"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend data={LEADS_TREND} series={LEADS_SERIES} height={240} showLegend />
        </BentoCard>
        <BentoCard
          title="Leads by channel"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={CHANNEL_MIX}
            height={240}
            centerValue="342"
            centerLabel="leads"
          />
        </BentoCard>

        {/* Spend + funnel + health */}
        <BentoCard
          title="Spend by channel"
          subtitle="This month (RM)"
          icon={Coins}
          className="col-span-2 md:col-span-4"
        >
          <BarGroup
            data={SPEND_BY_CHANNEL}
            series={SPEND_SERIES}
            horizontal
            height={200}
          />
        </BentoCard>
        <BentoCard
          title="Lead funnel"
          subtitle="Lead → won"
          icon={Filter}
          className="col-span-2 md:col-span-4"
        >
          <FunnelFlow data={FUNNEL} height={200} />
        </BentoCard>
        <BentoCard
          title="Ad engine health"
          subtitle="Setup & delivery"
          icon={HeartPulse}
          className="col-span-2 md:col-span-4"
        >
          <RadialGauge value={86} label="healthy" valueLabel="86%" height={200} />
        </BentoCard>

        {/* Campaigns + best time */}
        <BentoCard
          title="Top campaigns"
          subtitle="By leads this month"
          icon={Megaphone}
          className="col-span-2 md:col-span-8"
        >
          <ul className="divide-y">
            {CAMPAIGNS.map((c) => (
              <li key={c.name} className="flex items-center gap-3 py-2.5">
                <LiveDot active={c.status === 'Active'} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {c.name}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {c.leads} leads
                </span>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                  {c.cpl}
                </span>
              </li>
            ))}
          </ul>
        </BentoCard>
        <BentoCard
          title="Best time to engage"
          subtitle="Lead replies by slot"
          icon={CalendarDays}
          className="col-span-2 md:col-span-4"
        >
          <HeatGrid xLabels={HEAT_SLOTS} yLabels={HEAT_DAYS} values={HEAT_VALUES} />
        </BentoCard>

        {/* Agents + appointments */}
        <BentoCard
          title="AI agents"
          subtitle="Your always-on crew"
          icon={Bot}
          className="col-span-2 md:col-span-6"
        >
          <div className="grid grid-cols-2 gap-2">
            {AGENTS.map((a) => (
              <div
                key={a.name}
                className="flex items-center gap-2 rounded-lg border bg-background/50 px-3 py-2"
              >
                <LiveDot active={a.active} />
                <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.active ? 'Active' : 'Paused'}
                </span>
              </div>
            ))}
          </div>
        </BentoCard>
        <BentoCard
          title="Upcoming appointments"
          icon={CalendarDays}
          className="col-span-2 md:col-span-6"
        >
          <ul className="space-y-2">
            {APPOINTMENTS.map((a) => (
              <li
                key={a.name}
                className="flex items-center gap-3 rounded-lg border bg-background/50 px-3 py-2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {a.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.kind}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium">{a.when}</p>
                  <p className="text-xs text-muted-foreground">{a.via}</p>
                </div>
              </li>
            ))}
          </ul>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
