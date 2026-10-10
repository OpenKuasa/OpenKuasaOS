'use client';

import { useState } from 'react';
import { Plus, Search, TrendingUp, PieChart, Undo2 } from 'lucide-react';
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

type RefundStatus = 'Refunded' | 'Pending';

type Refund = {
  id: string;
  date: string;
  customer: string;
  invoice: string;
  reason: string;
  amount: string;
  status: RefundStatus;
};

const REFUNDS: Refund[] = [
  { id: 'r1', date: '08 Oct', customer: 'Nurul Boutique', invoice: 'INV-1033', reason: 'Wrong item delivered', amount: 'RM 680', status: 'Pending' },
  { id: 'r2', date: '06 Oct', customer: 'Aisyah Trading', invoice: 'INV-1042', reason: 'Damaged goods', amount: 'RM 240', status: 'Refunded' },
  { id: 'r3', date: '02 Oct', customer: 'Langkawi Fresh', invoice: 'INV-1036', reason: 'Damaged goods', amount: 'RM 180', status: 'Refunded' },
  { id: 'r4', date: '30 Sep', customer: 'Lim Hardware', invoice: 'INV-1039', reason: 'Overpayment', amount: 'RM 450', status: 'Refunded' },
  { id: 'r5', date: '26 Sep', customer: 'Seri Mutiara Enterprise', invoice: 'INV-1032', reason: 'Order cancelled', amount: 'RM 900', status: 'Refunded' },
  { id: 'r6', date: '22 Sep', customer: 'Siti Decor', invoice: 'INV-1034', reason: 'Order cancelled', amount: 'RM 1,200', status: 'Refunded' },
  { id: 'r7', date: '08 Oct', customer: 'Nusantara Logistics', invoice: 'INV-1030', reason: 'Overpayment', amount: 'RM 320', status: 'Pending' },
];

/* KPI sparkline trends (last 8 months) ------------------------------- */
const SPARK_REFUNDED = [1.2, 1.4, 1.3, 1.5, 1.6, 1.7, 1.8, 1.9];
const SPARK_COMPLETED = [3, 4, 3, 5, 4, 5, 4, 5];
const SPARK_PENDING = [1, 2, 1, 1, 2, 1, 2, 2];
const SPARK_AFFECTED = [4, 5, 5, 6, 5, 7, 6, 7];

/* Refunded over time (RM k) ------------------------------------------ */
const REFUNDED_TREND = [
  { label: 'Mar', refunded: 1.2 },
  { label: 'Apr', refunded: 1.4 },
  { label: 'May', refunded: 1.3 },
  { label: 'Jun', refunded: 1.5 },
  { label: 'Jul', refunded: 1.6 },
  { label: 'Aug', refunded: 1.7 },
  { label: 'Sep', refunded: 1.8 },
  { label: 'Oct', refunded: 1.9 },
];
const REFUNDED_SERIES: Series[] = [
  { key: 'refunded', label: 'Refunded (RM k)', color: 'var(--chart-3)' },
];

/** Refunds by reason (RM YTD) — sums to ~RM 5.7k. */
const REASON_MIX: Slice[] = [
  { key: 'cancelled', label: 'Order cancelled', value: 2100, color: 'var(--chart-1)' },
  { key: 'damaged', label: 'Damaged goods', value: 1420, color: 'var(--chart-4)' },
  { key: 'wrongItem', label: 'Wrong item', value: 1180, color: 'var(--chart-3)' },
  { key: 'overpayment', label: 'Overpayment', value: 980, color: 'var(--chart-5)' },
];

const STATUS_TONE: Record<RefundStatus, string> = {
  Refunded: 'bg-emerald-500/15 text-emerald-600',
  Pending: 'bg-amber-500/15 text-amber-600',
};

function StatusPill({ status }: { status: RefundStatus }) {
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

export default function RefundsScreen() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const rows = filterRows(REFUNDS, query, (r) => `${r.customer} ${r.invoice}`, { status });

  return (
    <ScreenContainer>
      <PageHeader
        title="Refunds"
        subtitle="Refunds issued against customer invoices, Saudara."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            New Refund
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Refunded (MTD)"
            value="RM 1.9k"
            delta="+RM 0.3k"
            deltaTone="down"
            onPrimary
            chart={
              <Sparkline
                data={SPARK_REFUNDED}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Completed"
            value="5"
            delta="+2"
            deltaTone="down"
            chart={<Sparkline data={SPARK_COMPLETED} color="var(--chart-2)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Pending"
            value="2"
            delta="+1"
            deltaTone="down"
            chart={<Sparkline data={SPARK_PENDING} color="var(--chart-4)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Invoices affected"
            value="7"
            delta="+3"
            deltaTone="flat"
            chart={<Sparkline data={SPARK_AFFECTED} color="var(--chart-1)" height={36} />}
          />
        </BentoCard>

        {/* Refunded trend + reason mix */}
        <BentoCard
          title="Refunded over time"
          subtitle="Last 8 months"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend data={REFUNDED_TREND} series={REFUNDED_SERIES} height={240} />
        </BentoCard>
        <BentoCard
          title="Refunds by reason"
          subtitle="YTD"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={REASON_MIX}
            height={240}
            centerValue="RM 5.7k"
            centerLabel="refunded"
          />
        </BentoCard>

        {/* Refunds table */}
        <BentoCard
          title="Recent refunds"
          subtitle="Latest refunds across your book"
          icon={Undo2}
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
                aria-label="Customer / invoice"
                placeholder="Customer / invoice"
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
                <SelectItem value="Refunded">Refunded</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <NoMatchesRow colSpan={6} />}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{r.customer}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.invoice}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.reason}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{r.amount}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <LiveDot active={r.status === 'Refunded'} />
                        <StatusPill status={r.status} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Showing {rows.length} refunds</span>
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
