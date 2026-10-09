import { Plus, Search, ChartColumn, PieChart, FileText } from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  BarGroup,
  DonutStat,
  Sparkline,
  type Series,
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

import {
  loadBillsView,
  type Bill,
  type BillStatus,
  type BillsView,
} from '@/lib/finance/purchases';

/* ---- sample data (Rimba Ventures Sdn Bhd) -------------------------- */
/* Shown when Supabase is not configured or nobody is signed in. */

const COLUMNS = ['No.', 'Date', 'Supplier', 'Due', 'Total', 'Balance', 'Status'];

const BILLS: Bill[] = [
  {
    id: 'BILL-0232',
    date: '08 Oct 2026',
    supplier: 'Nusantara Logistics',
    due: '13 Oct 2026',
    total: 'RM 2,600.00',
    balance: 'RM 2,600.00',
    status: 'Pending',
  },
  {
    id: 'BILL-0231',
    date: '05 Oct 2026',
    supplier: 'Lim Hardware Sdn Bhd',
    due: '04 Nov 2026',
    total: 'RM 3,200.00',
    balance: 'RM 3,200.00',
    status: 'Pending',
  },
  {
    id: 'BILL-0230',
    date: '30 Sep 2026',
    supplier: 'Printhub Enterprise',
    due: '30 Oct 2026',
    total: 'RM 1,450.00',
    balance: 'RM 0.00',
    status: 'Paid',
  },
  {
    id: 'BILL-0229',
    date: '22 Sep 2026',
    supplier: 'Suria Utilities Sdn Bhd',
    due: '06 Oct 2026',
    total: 'RM 1,800.00',
    balance: 'RM 1,800.00',
    status: 'Overdue',
  },
  {
    id: 'BILL-0228',
    date: '18 Sep 2026',
    supplier: 'Syarikat Maju Jaya',
    due: '18 Oct 2026',
    total: 'RM 4,300.00',
    balance: 'RM 4,300.00',
    status: 'Pending',
  },
  {
    id: 'BILL-0227',
    date: '10 Sep 2026',
    supplier: 'Unifi Business (TM)',
    due: '10 Oct 2026',
    total: 'RM 299.00',
    balance: 'RM 0.00',
    status: 'Paid',
  },
  {
    id: 'BILL-0226',
    date: '07 Oct 2026',
    supplier: 'Kedai Kertas Ah Seng',
    due: '06 Nov 2026',
    total: 'RM 780.00',
    balance: 'RM 780.00',
    status: 'Draft',
  },
];

const SAMPLE: BillsView = {
  stats: [
    { label: 'Total payable', value: 'RM 12.7k', delta: '+RM 2.6k', deltaTone: 'up', spark: [9.8, 10.5, 11.2, 10.9, 11.8, 12.0, 12.4, 12.7] },
    { label: 'Due this week', value: 'RM 2,600', delta: '1 bill', deltaTone: 'flat', spark: [1.2, 2.0, 1.6, 2.8, 2.2, 2.6, 2.4, 2.6] },
    { label: 'Overdue', value: 'RM 1,800', delta: '1 bill', deltaTone: 'down', spark: [0.5, 0.8, 1.1, 0.9, 1.3, 1.5, 1.7, 1.8] },
    { label: 'Paid (MTD)', value: 'RM 12.1k', delta: '+9%', deltaTone: 'up', spark: [8.0, 9.0, 10.0, 11.0, 11.5, 12.0, 12.1, 12.1] },
  ],
  /** Outstanding balance by supplier (RM). */
  bySupplier: [
    { label: 'Maju Jaya', value: 4300 },
    { label: 'Lim Hardware', value: 3200 },
    { label: 'Nusantara', value: 2600 },
    { label: 'TNB', value: 1800 },
    { label: 'Ah Seng', value: 780 },
  ],
  /** Bills by status — sums to 7. */
  byStatus: [
    { key: 'pending', label: 'Pending', value: 3, color: 'var(--chart-1)' },
    { key: 'paid', label: 'Paid', value: 2, color: 'var(--chart-2)' },
    { key: 'overdue', label: 'Overdue', value: 1, color: 'var(--chart-4)' },
    { key: 'draft', label: 'Draft', value: 1, color: 'var(--chart-3)' },
  ],
  bills: BILLS,
  billCount: 231,
};

const STATUS_STYLES: Record<BillStatus, string> = {
  Paid: 'bg-emerald-500/15 text-emerald-600',
  Pending: 'bg-amber-500/15 text-amber-600',
  Overdue: 'bg-red-500/15 text-red-600',
  Draft: 'bg-muted text-muted-foreground',
};

function StatusPill({ status }: { status: BillStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

const SPARK_COLORS = ['var(--primary-foreground)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-2)'];

const SUPPLIER_SERIES: Series[] = [
  { key: 'value', label: 'Outstanding (RM)', color: 'var(--chart-1)' },
];

/* ------------------------------------------------------------------ */

export default async function SupplierBillsScreen() {
  const view = (await loadBillsView()) ?? SAMPLE;
  const billTotal = view.byStatus.reduce((n, s) => n + s.value, 0);

  return (
    <ScreenContainer>
      <PageHeader
        title="Supplier Bills"
        subtitle="Bills payable to your suppliers, Saudara."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            New Bill
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        {view.stats.map((s, i) => (
          <BentoCard
            key={s.label}
            tone={i === 0 ? 'primary' : 'default'}
            className="col-span-1 md:col-span-3"
          >
            <BentoStat
              label={s.label}
              value={s.value}
              delta={s.delta}
              deltaTone={s.deltaTone}
              onPrimary={i === 0}
              chart={
                s.spark && <Sparkline data={s.spark} color={SPARK_COLORS[i]} height={36} />
              }
            />
          </BentoCard>
        ))}

        {/* Payable by supplier + status mix */}
        <BentoCard
          title="Payable by supplier"
          subtitle="Outstanding balance"
          icon={ChartColumn}
          className="col-span-2 md:col-span-8"
        >
          <BarGroup
            data={view.bySupplier}
            series={SUPPLIER_SERIES}
            horizontal
            height={220}
          />
        </BentoCard>
        <BentoCard
          title="Bills by status"
          subtitle="Current book"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={view.byStatus}
            height={220}
            centerValue={String(billTotal)}
            centerLabel="bills"
          />
        </BentoCard>

        {/* Bills table */}
        <BentoCard
          title="Recent bills"
          subtitle="Latest activity from suppliers"
          icon={FileText}
          flush
          action={
            <Button variant="outline" size="sm">
              View all
            </Button>
          }
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search bills or suppliers…" className="w-full pl-9" />
            </div>
            <Select defaultValue="all">
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  {COLUMNS.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.bills.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMNS.length}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No supplier bills yet.
                    </TableCell>
                  </TableRow>
                )}
                {view.bills.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.id}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {b.date}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{b.supplier}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {b.due}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {b.total}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {b.balance}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <LiveDot active={b.status === 'Paid'} />
                        <StatusPill status={b.status} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              Showing {view.bills.length} of {view.billCount} bills
            </span>
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
