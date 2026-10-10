'use client';

import { useState } from 'react';
import { Plus, Search, TrendingUp, PieChart, FileMinus } from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { filterRows, NoMatchesRow } from '@/components/screen/table-filter';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  AreaTrend,
  DonutStat,
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

type CreditStatus = 'Issued' | 'Draft';

type CreditNote = {
  no: string;
  date: string;
  customer: string;
  invoice: string;
  amount: string;
  status: CreditStatus;
};

const CREDIT_NOTES: CreditNote[] = [
  { no: 'CN-36', date: '08 Oct', customer: 'Seri Mutiara Enterprise', invoice: 'INV-1032', amount: 'RM 320', status: 'Issued' },
  { no: 'CN-35', date: '07 Oct', customer: 'Langkawi Fresh', invoice: 'INV-1036', amount: 'RM 180', status: 'Issued' },
  { no: 'CN-34', date: '06 Oct', customer: 'Aisyah Trading', invoice: 'INV-1042', amount: 'RM 240', status: 'Issued' },
  { no: 'CN-33', date: '30 Sep', customer: 'Lim Hardware', invoice: 'INV-1039', amount: 'RM 450', status: 'Issued' },
  { no: 'CN-32', date: '24 Sep', customer: 'Siti Decor', invoice: 'INV-1038', amount: 'RM 600', status: 'Issued' },
  { no: 'CN-31', date: '18 Sep', customer: 'Nurul Boutique', invoice: 'INV-1031', amount: 'RM 1,150', status: 'Issued' },
  { no: 'CN-30', date: '12 Sep', customer: 'Nusantara Logistics', invoice: 'INV-1029', amount: 'RM 520', status: 'Issued' },
  { no: 'CN-29', date: '—', customer: 'Zaki Enterprise', invoice: 'INV-1041', amount: 'RM 300', status: 'Draft' },
];

/* KPI sparkline trends (last 8 months) ------------------------------- */
const SPARK_CREDITED = [0.9, 1.0, 1.1, 1.0, 1.3, 1.2, 1.4, 1.5];
const SPARK_ISSUED = [4, 5, 4, 6, 5, 7, 6, 7];
const SPARK_DRAFTS = [1, 2, 1, 1, 2, 1, 1, 1];
const SPARK_AFFECTED = [5, 6, 5, 7, 6, 8, 7, 8];

/* Credited over time (RM k) ------------------------------------------ */
const CREDITED_TREND = [
  { label: 'Mar', credited: 0.9 },
  { label: 'Apr', credited: 1.0 },
  { label: 'May', credited: 1.1 },
  { label: 'Jun', credited: 1.0 },
  { label: 'Jul', credited: 1.3 },
  { label: 'Aug', credited: 1.2 },
  { label: 'Sep', credited: 1.4 },
  { label: 'Oct', credited: 1.5 },
];
const CREDITED_SERIES: Series[] = [
  { key: 'credited', label: 'Credited (RM k)', color: 'var(--chart-3)' },
];

/** Credits by reason (RM YTD) — sums to ~RM 5.1k. */
const REASON_MIX: Slice[] = [
  { key: 'returns', label: 'Returns', value: 2100, color: 'var(--chart-1)' },
  { key: 'pricing', label: 'Pricing adjustment', value: 1450, color: 'var(--chart-4)' },
  { key: 'overbilling', label: 'Overbilling', value: 980, color: 'var(--chart-3)' },
  { key: 'goodwill', label: 'Goodwill', value: 560, color: 'var(--chart-5)' },
];

const STATUS_TONE: Record<CreditStatus, string> = {
  Issued: 'bg-emerald-500/15 text-emerald-600',
  Draft: 'bg-muted text-muted-foreground',
};

function StatusPill({ status }: { status: CreditStatus }) {
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

export default function CreditNotesScreen() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const rows = filterRows(CREDIT_NOTES, query, (c) => `${c.no} ${c.customer} ${c.invoice}`, { status });

  return (
    <ScreenContainer>
      <PageHeader
        title="Credit Notes"
        subtitle="Credits issued against customer invoices, Saudara."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            New Credit Note
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Credited (MTD)"
            value="RM 1.5k"
            delta="+RM 0.2k"
            deltaTone="down"
            onPrimary
            chart={
              <Sparkline
                data={SPARK_CREDITED}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Issued"
            value="7"
            delta="+2"
            deltaTone="down"
            chart={<Sparkline data={SPARK_ISSUED} color="var(--chart-3)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Drafts"
            value="1"
            delta="unchanged"
            deltaTone="flat"
            chart={<Sparkline data={SPARK_DRAFTS} color="var(--chart-5)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Invoices affected"
            value="8"
            delta="+1"
            deltaTone="flat"
            chart={<Sparkline data={SPARK_AFFECTED} color="var(--chart-1)" height={36} />}
          />
        </BentoCard>

        {/* Credited trend + reason mix */}
        <BentoCard
          title="Credited over time"
          subtitle="Last 8 months"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend data={CREDITED_TREND} series={CREDITED_SERIES} height={240} />
        </BentoCard>
        <BentoCard
          title="Credits by reason"
          subtitle="YTD"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={REASON_MIX}
            height={240}
            centerValue="RM 5.1k"
            centerLabel="credited"
          />
        </BentoCard>

        {/* Credit notes table */}
        <BentoCard
          title="Recent credit notes"
          subtitle="Latest credits across your book"
          icon={FileMinus}
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
                <SelectItem value="Issued">Issued</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
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
                  <TableHead>Against Invoice</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <NoMatchesRow colSpan={6} />}
                {rows.map((c) => (
                  <TableRow key={c.no}>
                    <TableCell className="whitespace-nowrap font-medium">{c.no}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{c.date}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.customer}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.invoice}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{c.amount}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <LiveDot active={c.status === 'Issued'} />
                        <StatusPill status={c.status} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Showing {rows.length} credit notes</span>
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
