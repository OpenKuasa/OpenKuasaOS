'use client';

import { useState } from 'react';
import { Plus, Search, TrendingUp, PieChart, Banknote } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
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

type PaymentStatus = 'Allocated' | 'Pending';
type PaymentMethod = 'FPX' | 'Bank Transfer' | 'Cash' | 'Card';

type Payment = {
  id: string;
  date: string;
  customer: string;
  invoice: string;
  method: PaymentMethod;
  amount: string;
  status: PaymentStatus;
};

/** Book total for the month; the table shows the latest receipts. */
const TOTAL_PAYMENTS = 42;

const PAYMENTS: Payment[] = [
  { id: 'p1', date: '08 Oct', customer: 'Aisyah Trading', invoice: 'INV-1042', method: 'FPX', amount: 'RM 1,240', status: 'Allocated' },
  { id: 'p2', date: '07 Oct', customer: 'Langkawi Fresh', invoice: 'INV-1036', method: 'FPX', amount: 'RM 5,600', status: 'Allocated' },
  { id: 'p3', date: '05 Oct', customer: 'Lim Hardware', invoice: 'INV-1039', method: 'Bank Transfer', amount: 'RM 2,100', status: 'Allocated' },
  { id: 'p4', date: '04 Oct', customer: 'Siti Decor', invoice: 'INV-1038', method: 'Card', amount: 'RM 4,200', status: 'Allocated' },
  { id: 'p5', date: '03 Oct', customer: 'Seri Mutiara Enterprise', invoice: 'INV-1032', method: 'FPX', amount: 'RM 3,180', status: 'Allocated' },
  { id: 'p6', date: '02 Oct', customer: 'Nurul Boutique', invoice: 'INV-1033', method: 'Cash', amount: 'RM 850', status: 'Allocated' },
  { id: 'p7', date: '30 Sep', customer: 'Nusantara Logistics', invoice: 'INV-1030', method: 'Bank Transfer', amount: 'RM 6,800', status: 'Allocated' },
  { id: 'p8', date: '08 Oct', customer: 'Zaki Enterprise', invoice: 'INV-1041', method: 'FPX', amount: 'RM 1,000', status: 'Pending' },
];

/* KPI sparkline trends (last 8 months) ------------------------------- */
const SPARK_RECEIVED = [18, 20, 21, 23, 24, 25, 27, 26];
const SPARK_COUNT = [31, 34, 33, 38, 37, 40, 41, 42];
const SPARK_AVG = [0.58, 0.59, 0.6, 0.61, 0.6, 0.62, 0.63, 0.62];
const SPARK_DIGITAL = [68, 70, 71, 73, 74, 76, 77, 78];

/* Received over time (RM k) ------------------------------------------ */
const RECEIVED_TREND = [
  { label: 'Mar', received: 18 },
  { label: 'Apr', received: 20 },
  { label: 'May', received: 21 },
  { label: 'Jun', received: 23 },
  { label: 'Jul', received: 24 },
  { label: 'Aug', received: 25 },
  { label: 'Sep', received: 27 },
  { label: 'Oct', received: 26 },
];
const RECEIVED_SERIES: Series[] = [
  { key: 'received', label: 'Received (RM k)', color: 'var(--chart-2)' },
];

/** Received by method (RM k MTD) — sums to RM 25.9k. */
const METHOD_MIX: Slice[] = [
  { key: 'fpx', label: 'FPX', value: 14.2, color: 'var(--chart-1)' },
  { key: 'bankTransfer', label: 'Maybank / CIMB transfer', value: 6.1, color: 'var(--chart-2)' },
  { key: 'card', label: 'Card', value: 4.3, color: 'var(--chart-4)' },
  { key: 'cash', label: 'Cash', value: 1.3, color: 'var(--chart-5)' },
];

const STATUS_TONE: Record<PaymentStatus, string> = {
  Allocated: 'bg-emerald-500/15 text-emerald-600',
  Pending: 'bg-amber-500/15 text-amber-600',
};

function StatusPill({ status }: { status: PaymentStatus }) {
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

export default function PaymentsInScreen() {
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('all');
  const rows = filterRows(PAYMENTS, query, (p) => `${p.customer} ${p.invoice}`, { method });

  return (
    <ScreenContainer>
      <PageHeader
        title="Payments In"
        subtitle="Customer payments received via FPX, Maybank & more, Saudara."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            Record Payment
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Received (MTD)"
            value="RM 25.9k"
            delta="+9%"
            onPrimary
            chart={
              <Sparkline
                data={SPARK_RECEIVED}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Payments"
            value="42"
            delta="+6"
            deltaTone="up"
            chart={<Sparkline data={SPARK_COUNT} color="var(--chart-2)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Avg payment"
            value="RM 617"
            delta="+RM 40"
            deltaTone="up"
            chart={<Sparkline data={SPARK_AVG} color="var(--chart-1)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Via FPX & bank"
            value="78%"
            delta="+5 pts"
            deltaTone="up"
            chart={<Sparkline data={SPARK_DIGITAL} color="var(--chart-3)" height={36} />}
          />
        </BentoCard>

        {/* Received trend + method mix */}
        <BentoCard
          title="Received over time"
          subtitle="Last 8 months"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend data={RECEIVED_TREND} series={RECEIVED_SERIES} height={240} />
        </BentoCard>
        <BentoCard
          title="Received by method"
          subtitle="This month"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={METHOD_MIX}
            height={240}
            centerValue="RM 25.9k"
            centerLabel="received"
          />
        </BentoCard>

        {/* Payments table */}
        <BentoCard
          title="Recent payments"
          subtitle="Latest receipts across your book"
          icon={Banknote}
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
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                <SelectItem value="FPX">FPX</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Card">Card</SelectItem>
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
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <NoMatchesRow colSpan={6} />}
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{p.date}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{p.customer}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.invoice}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.method}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{p.amount}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <LiveDot active={p.status === 'Allocated'} />
                        <StatusPill status={p.status} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              Showing {rows.length} of {TOTAL_PAYMENTS} payments
            </span>
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
