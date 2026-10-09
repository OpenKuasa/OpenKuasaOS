import { Plus, TrendingUp, PieChart, Wallet } from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  AreaTrend,
  DonutStat,
  Sparkline,
  type Series,
} from '@/components/charts';
import { LiveDot } from '@/components/ui/live-dot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  loadPaymentsView,
  type Payment,
  type PaymentStatus,
  type PaymentsView,
} from '@/lib/finance/purchases';

/* ---- sample data (Rimba Ventures Sdn Bhd) -------------------------- */
/* Shown when Supabase is not configured or nobody is signed in. */

const COLUMNS = ['Date', 'Supplier', 'Bill', 'Method', 'Amount', 'Status'];

const PAYMENTS: Payment[] = [
  {
    id: 'PAY-0119',
    date: '07 Oct 2026',
    supplier: 'Nusantara Logistics',
    bill: 'BILL-0225',
    method: 'FPX',
    amount: 'RM 1,180.00',
    status: 'Paid',
  },
  {
    id: 'PAY-0118',
    date: '06 Oct 2026',
    supplier: 'Printhub Enterprise',
    bill: 'BILL-0230',
    method: 'Bank Transfer',
    amount: 'RM 1,450.00',
    status: 'Paid',
  },
  {
    id: 'PAY-0117',
    date: '04 Oct 2026',
    supplier: 'Unifi Business (TM)',
    bill: 'BILL-0227',
    method: 'Bank Transfer',
    amount: 'RM 299.00',
    status: 'Paid',
  },
  {
    id: 'PAY-0116',
    date: '02 Oct 2026',
    supplier: 'Kedai Kertas Ah Seng',
    bill: 'BILL-0224',
    method: 'Cash',
    amount: 'RM 1,650.00',
    status: 'Paid',
  },
  {
    id: 'PAY-0115',
    date: '28 Sep 2026',
    supplier: 'Lim Hardware Sdn Bhd',
    bill: 'BILL-0221',
    method: 'Cheque',
    amount: 'RM 4,200.00',
    status: 'Paid',
  },
  {
    id: 'PAY-0114',
    date: '10 Oct 2026',
    supplier: 'Suria Utilities Sdn Bhd',
    bill: 'BILL-0229',
    method: 'Bank Transfer',
    amount: 'RM 1,800.00',
    status: 'Scheduled',
  },
  {
    id: 'PAY-0113',
    date: '12 Oct 2026',
    supplier: 'Syarikat Maju Jaya',
    bill: 'BILL-0228',
    method: 'Bank Transfer',
    amount: 'RM 4,300.00',
    status: 'Pending',
  },
];

const SAMPLE: PaymentsView = {
  stats: [
    { label: 'Paid (MTD)', value: 'RM 12.1k', delta: '+9%', deltaTone: 'up', spark: [8.0, 9.0, 10.0, 11.0, 11.5, 12.0, 12.1, 12.1] },
    { label: 'Payments', value: '38', delta: '+6', deltaTone: 'up', spark: [24, 28, 26, 31, 33, 35, 37, 38] },
    { label: 'Via bank / FPX', value: '86%', delta: '+4%', deltaTone: 'up', spark: [72, 76, 78, 80, 82, 84, 85, 86] },
    { label: 'Scheduled', value: 'RM 1,800', delta: '1 payment', deltaTone: 'flat', spark: [2.2, 1.8, 2.4, 2.0, 1.6, 2.1, 1.9, 1.8] },
  ],
  /* Payments over time (last 8 months, RM k) */
  trend: [
    { label: 'Mar', electronic: 7.2, cash: 2.1 },
    { label: 'Apr', electronic: 8.0, cash: 1.8 },
    { label: 'May', electronic: 8.6, cash: 2.4 },
    { label: 'Jun', electronic: 9.1, cash: 2.0 },
    { label: 'Jul', electronic: 9.8, cash: 1.6 },
    { label: 'Aug', electronic: 10.2, cash: 2.1 },
    { label: 'Sep', electronic: 10.4, cash: 1.9 },
    { label: 'Oct', electronic: 10.4, cash: 1.7 },
  ],
  /** Paid MTD by method (RM k) — sums to 12.1. */
  byMethod: [
    { key: 'bank', label: 'Bank Transfer', value: 6.6, color: 'var(--chart-1)' },
    { key: 'fpx', label: 'FPX', value: 3.8, color: 'var(--chart-2)' },
    { key: 'cash', label: 'Cash', value: 1.3, color: 'var(--chart-3)' },
    { key: 'cheque', label: 'Cheque', value: 0.4, color: 'var(--chart-4)' },
  ],
  paidMtd: 'RM 12.1k',
  payments: PAYMENTS,
};

const STATUS_STYLES: Record<PaymentStatus, string> = {
  Paid: 'bg-emerald-500/15 text-emerald-600',
  Pending: 'bg-amber-500/15 text-amber-600',
  Scheduled: 'bg-muted text-muted-foreground',
};

function StatusPill({ status }: { status: PaymentStatus }) {
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

const SPARK_COLORS = ['var(--primary-foreground)', 'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

const PAID_SERIES: Series[] = [
  { key: 'electronic', label: 'Bank / FPX (RM k)', color: 'var(--chart-1)' },
  { key: 'cash', label: 'Cash / cheque (RM k)', color: 'var(--chart-2)' },
];

/* ------------------------------------------------------------------ */

export default async function PaymentsOutScreen() {
  const view = (await loadPaymentsView()) ?? SAMPLE;

  return (
    <ScreenContainer>
      <PageHeader
        title="Payments Out"
        subtitle="Payments made to suppliers, Saudara."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            Record Payment
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

        {/* Trend + method mix */}
        <BentoCard
          title="Payments over time"
          subtitle="Electronic vs cash · last 8 months"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend data={view.trend} series={PAID_SERIES} height={240} showLegend />
        </BentoCard>
        <BentoCard
          title="Paid by method"
          subtitle="Month to date"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={view.byMethod}
            height={240}
            centerValue={view.paidMtd}
            centerLabel="paid"
          />
        </BentoCard>

        {/* Payments table */}
        <BentoCard
          title="Recent payments"
          subtitle="Latest activity to suppliers"
          icon={Wallet}
          action={
            <Button variant="outline" size="sm">
              View all
            </Button>
          }
          className="col-span-2 md:col-span-12"
        >
          <div className="overflow-x-auto">
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
                {view.payments.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMNS.length}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No payments yet.
                    </TableCell>
                  </TableRow>
                )}
                {view.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {p.date}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {p.supplier}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{p.bill}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.method}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {p.amount}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <LiveDot active={p.status === 'Paid'} />
                        <StatusPill status={p.status} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
