'use client';

import { useState } from 'react';
import { Plus, Search, TrendingUp, PieChart, Receipt } from 'lucide-react';
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

type InvoiceStatus = 'Paid' | 'Sent' | 'Overdue' | 'Draft';
type EInvoice = 'Validated' | 'Pending' | null;

type Invoice = {
  no: string;
  date: string;
  customer: string;
  total: string;
  balance: string;
  status: InvoiceStatus;
  eInvoice: EInvoice;
};

/** Whole book is 114 invoices this FY; the table shows the latest. */
const TOTAL_INVOICES = 114;

const INVOICES: Invoice[] = [
  { no: 'INV-1043', date: '08 Oct', customer: 'Seri Mutiara Enterprise', total: 'RM 2,750', balance: 'RM 2,750', status: 'Draft', eInvoice: null },
  { no: 'INV-1042', date: '07 Oct', customer: 'Aisyah Trading', total: 'RM 1,240', balance: 'RM 0', status: 'Paid', eInvoice: 'Validated' },
  { no: 'INV-1041', date: '05 Oct', customer: 'Zaki Enterprise', total: 'RM 3,500', balance: 'RM 3,500', status: 'Sent', eInvoice: 'Pending' },
  { no: 'INV-1040', date: '01 Oct', customer: 'Nurul Boutique', total: 'RM 8,900', balance: 'RM 8,900', status: 'Overdue', eInvoice: 'Validated' },
  { no: 'INV-1039', date: '28 Sep', customer: 'Lim Hardware', total: 'RM 2,100', balance: 'RM 0', status: 'Paid', eInvoice: 'Validated' },
  { no: 'INV-1038', date: '25 Sep', customer: 'Siti Decor', total: 'RM 4,200', balance: 'RM 0', status: 'Paid', eInvoice: 'Validated' },
  { no: 'INV-1037', date: '20 Sep', customer: 'Nusantara Logistics', total: 'RM 6,400', balance: 'RM 6,400', status: 'Sent', eInvoice: 'Pending' },
  { no: 'INV-1036', date: '14 Sep', customer: 'Langkawi Fresh', total: 'RM 5,600', balance: 'RM 0', status: 'Paid', eInvoice: 'Validated' },
  { no: 'INV-1035', date: '10 Sep', customer: 'Lim Hardware', total: 'RM 3,180', balance: 'RM 3,180', status: 'Overdue', eInvoice: 'Validated' },
];

const CUSTOMERS = [
  'Aisyah Trading',
  'Zaki Enterprise',
  'Nurul Boutique',
  'Lim Hardware',
  'Siti Decor',
  'Nusantara Logistics',
  'Langkawi Fresh',
  'Seri Mutiara Enterprise',
];

/* KPI sparkline trends (last 8 months, RM k) ------------------------- */
const SPARK_INVOICED = [34, 38, 36, 43, 46, 48, 53, 49];
const SPARK_PAID = [30, 33, 34, 38, 40, 43, 46, 42];
const SPARK_OUTSTANDING = [12, 13, 14, 14, 16, 16, 17, 17];
const SPARK_OVERDUE = [5, 6, 7, 8, 9, 10, 11, 12];

/* Invoiced vs paid over time ----------------------------------------- */
const INVOICED_TREND = [
  { label: 'Mar', invoiced: 34, paid: 30 },
  { label: 'Apr', invoiced: 38, paid: 33 },
  { label: 'May', invoiced: 36, paid: 34 },
  { label: 'Jun', invoiced: 43, paid: 38 },
  { label: 'Jul', invoiced: 46, paid: 40 },
  { label: 'Aug', invoiced: 48, paid: 43 },
  { label: 'Sep', invoiced: 53, paid: 46 },
  { label: 'Oct', invoiced: 49, paid: 42 },
];
const INVOICED_SERIES: Series[] = [
  { key: 'invoiced', label: 'Invoiced (RM k)', color: 'var(--chart-1)' },
  { key: 'paid', label: 'Paid (RM k)', color: 'var(--chart-2)' },
];

/** Whole-book status mix — sums to TOTAL_INVOICES. */
const STATUS_MIX: Slice[] = [
  { key: 'paid', label: 'Paid', value: 84, color: 'var(--chart-2)' },
  { key: 'sent', label: 'Sent', value: 18, color: 'var(--chart-4)' },
  { key: 'overdue', label: 'Overdue', value: 9, color: 'var(--chart-3)' },
  { key: 'draft', label: 'Draft', value: 3, color: 'var(--chart-5)' },
];

const STATUS_TONE: Record<InvoiceStatus, string> = {
  Paid: 'bg-emerald-500/15 text-emerald-600',
  Sent: 'bg-amber-500/15 text-amber-600',
  Overdue: 'bg-red-500/15 text-red-600',
  Draft: 'bg-muted text-muted-foreground',
};

function StatusPill({ status }: { status: InvoiceStatus }) {
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

function EInvoicePill({ value }: { value: EInvoice }) {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        value === 'Validated'
          ? 'bg-emerald-500/15 text-emerald-600'
          : 'bg-amber-500/15 text-amber-600',
      )}
    >
      {value}
    </span>
  );
}

export default function InvoicesScreen() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [customer, setCustomer] = useState('all');
  const rows = filterRows(INVOICES, query, (i) => `${i.no} ${i.customer}`, { status, customer });

  return (
    <ScreenContainer>
      <PageHeader
        title="Invoices"
        subtitle="Sales invoices & e-Invois LHDN status, Saudara."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            New Invoice
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Total invoiced (MTD)"
            value="RM 42.8k"
            delta="+12%"
            onPrimary
            chart={
              <Sparkline
                data={SPARK_INVOICED}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Paid (MTD)"
            value="RM 25.9k"
            delta="+9%"
            deltaTone="up"
            chart={<Sparkline data={SPARK_PAID} color="var(--chart-2)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Outstanding"
            value="RM 16.9k"
            delta="+RM 4.1k"
            deltaTone="down"
            chart={<Sparkline data={SPARK_OUTSTANDING} color="var(--chart-4)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Overdue"
            value="RM 12.1k"
            delta="+2 invoices"
            deltaTone="down"
            chart={<Sparkline data={SPARK_OVERDUE} color="var(--chart-3)" height={36} />}
          />
        </BentoCard>

        {/* Invoiced trend + status mix */}
        <BentoCard
          title="Invoiced over time"
          subtitle="Invoiced vs paid · last 8 months"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend
            data={INVOICED_TREND}
            series={INVOICED_SERIES}
            height={240}
            showLegend
          />
        </BentoCard>
        <BentoCard
          title="Invoices by status"
          subtitle="Current book"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={STATUS_MIX}
            height={240}
            centerValue={TOTAL_INVOICES.toString()}
            centerLabel="invoices"
          />
        </BentoCard>

        {/* Invoices table */}
        <BentoCard
          title="Recent invoices"
          subtitle="Latest activity across your book"
          icon={Receipt}
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
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Sent">Sent</SelectItem>
                <SelectItem value="Overdue">Overdue</SelectItem>
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
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>e-Invois</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <NoMatchesRow colSpan={7} />}
                {rows.map((i) => (
                  <TableRow key={i.no}>
                    <TableCell className="whitespace-nowrap font-medium">{i.no}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{i.date}</TableCell>
                    <TableCell className="whitespace-nowrap">{i.customer}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{i.total}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">{i.balance}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <LiveDot active={i.status === 'Paid'} />
                        <StatusPill status={i.status} />
                      </span>
                    </TableCell>
                    <TableCell>
                      <EInvoicePill value={i.eInvoice} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              Showing {rows.length} of {TOTAL_INVOICES} invoices
            </span>
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
