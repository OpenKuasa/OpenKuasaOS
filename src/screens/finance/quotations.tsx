'use client';

import { useState } from 'react';
import { Plus, Search, TrendingUp, Filter } from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { filterRows, NoMatchesRow } from '@/components/screen/table-filter';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type QuoteStatus = 'Accepted' | 'Sent' | 'Expired' | 'Draft';

type Quotation = {
  no: string;
  date: string;
  customer: string;
  total: string;
  validUntil: string;
  status: QuoteStatus;
};

const QUOTATIONS: Quotation[] = [
  { no: 'QT-227', date: '08 Oct', customer: 'Seri Mutiara Enterprise', total: 'RM 6,200', validUntil: '08 Nov', status: 'Sent' },
  { no: 'QT-226', date: '07 Oct', customer: 'Langkawi Fresh', total: 'RM 4,800', validUntil: '07 Nov', status: 'Sent' },
  { no: 'QT-225', date: '06 Oct', customer: 'Aisyah Trading', total: 'RM 12,000', validUntil: '06 Nov', status: 'Accepted' },
  { no: 'QT-224', date: '04 Oct', customer: 'Zaki Enterprise', total: 'RM 9,500', validUntil: '04 Nov', status: 'Sent' },
  { no: 'QT-223', date: '29 Sep', customer: 'Lim Hardware', total: 'RM 7,500', validUntil: '29 Oct', status: 'Accepted' },
  { no: 'QT-222', date: '12 Sep', customer: 'Siti Decor', total: 'RM 3,200', validUntil: '27 Sep', status: 'Expired' },
  { no: 'QT-221', date: '02 Sep', customer: 'Nusantara Logistics', total: 'RM 5,800', validUntil: '17 Sep', status: 'Expired' },
  { no: 'QT-220', date: '20 Sep', customer: 'Aisyah Trading', total: 'RM 8,400', validUntil: '20 Oct', status: 'Accepted' },
  { no: 'QT-219', date: '—', customer: 'Nurul Boutique', total: 'RM 2,400', validUntil: '—', status: 'Draft' },
];

const CUSTOMERS = [
  'Aisyah Trading',
  'Zaki Enterprise',
  'Lim Hardware',
  'Siti Decor',
  'Nusantara Logistics',
  'Langkawi Fresh',
  'Seri Mutiara Enterprise',
  'Nurul Boutique',
];

/* KPI sparkline trends (last 8 months) ------------------------------- */
const SPARK_OPEN = [12, 15, 14, 18, 17, 20, 19, 21];
const SPARK_ACCEPTED = [14, 18, 16, 22, 24, 27, 29, 28];
const SPARK_CONVERSION = [44, 48, 46, 51, 52, 54, 55, 54];
const SPARK_VALUE = [28, 34, 31, 40, 44, 47, 52, 60];

/* Quoted vs accepted value over time (RM k) -------------------------- */
const QUOTE_TREND = [
  { label: 'Mar', quoted: 28, accepted: 14 },
  { label: 'Apr', quoted: 34, accepted: 18 },
  { label: 'May', quoted: 31, accepted: 16 },
  { label: 'Jun', quoted: 40, accepted: 22 },
  { label: 'Jul', quoted: 44, accepted: 24 },
  { label: 'Aug', quoted: 47, accepted: 27 },
  { label: 'Sep', quoted: 52, accepted: 29 },
  { label: 'Oct', quoted: 60, accepted: 32 },
];
const QUOTE_SERIES: Series[] = [
  { key: 'quoted', label: 'Quoted (RM k)', color: 'var(--chart-1)' },
  { key: 'accepted', label: 'Accepted (RM k)', color: 'var(--chart-2)' },
];

/* Acceptance funnel — whole book this quarter ------------------------ */
const FUNNEL: Slice[] = [
  { key: 'drafted', label: 'Drafted', value: 64, color: 'var(--chart-5)' },
  { key: 'sent', label: 'Sent', value: 52, color: 'var(--chart-1)' },
  { key: 'viewed', label: 'Viewed', value: 41, color: 'var(--chart-4)' },
  { key: 'accepted', label: 'Accepted', value: 28, color: 'var(--chart-2)' },
];

const STATUS_TONE: Record<QuoteStatus, string> = {
  Accepted: 'bg-emerald-500/15 text-emerald-600',
  Sent: 'bg-amber-500/15 text-amber-600',
  Expired: 'bg-red-500/15 text-red-600',
  Draft: 'bg-muted text-muted-foreground',
};

function StatusPill({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        STATUS_TONE[status],
      )}
    >
      {status}
    </span>
  );
}

export default function QuotationsScreen() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [customer, setCustomer] = useState('all');
  const rows = filterRows(QUOTATIONS, query, (q) => `${q.no} ${q.customer}`, { status, customer });

  return (
    <ScreenContainer>
      <PageHeader
        title="Quotations"
        subtitle="Quotes, proposals and acceptance, Saudara."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            New Quotation
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Open quotes"
            value="RM 20.5k"
            delta="3 open"
            deltaTone="flat"
            onPrimary
            chart={
              <Sparkline
                data={SPARK_OPEN}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Accepted (MTD)"
            value="RM 27.9k"
            delta="+11%"
            deltaTone="up"
            chart={<Sparkline data={SPARK_ACCEPTED} color="var(--chart-2)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Conversion"
            value="54%"
            delta="+3 pts"
            deltaTone="up"
            chart={<Sparkline data={SPARK_CONVERSION} color="var(--chart-1)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Pipeline value"
            value="RM 59.8k"
            delta="+RM 7.8k"
            deltaTone="up"
            chart={<Sparkline data={SPARK_VALUE} color="var(--chart-3)" height={36} />}
          />
        </BentoCard>

        {/* Value trend + acceptance funnel */}
        <BentoCard
          title="Quoted value over time"
          subtitle="Quoted vs accepted · last 8 months"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend
            data={QUOTE_TREND}
            series={QUOTE_SERIES}
            height={240}
            showLegend
          />
        </BentoCard>
        <BentoCard
          title="Acceptance funnel"
          subtitle="This quarter"
          icon={Filter}
          className="col-span-2 md:col-span-4"
        >
          <FunnelFlow data={FUNNEL} height={240} />
        </BentoCard>

        {/* Quotations table */}
        <BentoCard
          title="Recent quotations"
          subtitle="Latest quotes across your book"
          icon={Filter}
          flush
          action={
            <Button variant="outline" size="sm">
              Export
            </Button>
          }
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Doc no. / customer"
                placeholder="Doc no. / customer"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Accepted">Accepted</SelectItem>
                <SelectItem value="Sent">Sent</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select value={customer} onValueChange={setCustomer}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                {CUSTOMERS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <NoMatchesRow colSpan={6} />}
                {rows.map((q) => (
                  <TableRow key={q.no}>
                    <TableCell className="whitespace-nowrap font-medium">{q.no}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{q.date}</TableCell>
                    <TableCell className="whitespace-nowrap">{q.customer}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{q.total}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{q.validUntil}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <LiveDot active={q.status === 'Accepted'} />
                        <StatusPill status={q.status} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Showing {rows.length} quotations</span>
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
