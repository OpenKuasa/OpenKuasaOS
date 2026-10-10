import { CircleCheck, Clock, PieChart, Plus, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { AreaTrend, DonutStat, type Series, type Slice } from '@/components/charts';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, todayInMalaysia } from '@/lib/people/dates';
import { readVouchers } from '@/lib/people/payroll';
import type { PaymentVoucher } from '@/lib/people/types';
import { rm } from '@/lib/reach/format';
import { HrOnlyScreen, LOAD_FAILED, LaterButton, Muted, StatusPill, loadPeople } from './parts';

const ISSUED_SERIES: Series[] = [{ key: 'value', label: 'Amount (RM)', color: 'var(--chart-1)' }];
const TYPE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--muted-foreground)'];

const STATUS: Record<PaymentVoucher['status'], { label: string; tone: 'good' | 'pending' | 'neutral' }> = {
  paid: { label: 'Paid', tone: 'good' },
  issued: { label: 'Issued', tone: 'pending' },
  draft: { label: 'Draft', tone: 'neutral' },
};

/** The payment voucher register. Owners and admins only; nothing here changes data yet. */
export default async function PaymentVouchersScreen() {
  const { model, viewer } = await loadPeople('payment-vouchers', (data, now, ctx) =>
    readVouchers(data, ctx.viewer, todayInMalaysia(now)),
  );
  if (!viewer.isHr && !viewer.isDemo) return <HrOnlyScreen title="Payment Vouchers" />;

  const dash = '—';
  const slices: Slice[] = (model?.by_type ?? []).map((t, index) => ({
    key: t.key,
    label: t.key,
    value: t.value / 100,
    color: TYPE_COLORS[index % TYPE_COLORS.length],
  }));

  return (
    <ScreenContainer>
      <PageHeader
        title="Payment Vouchers"
        subtitle="Every voucher on record, newest first"
        actions={
          <>
            <LaterButton variant="outline" size="sm" compact>Export</LaterButton>
            <LaterButton size="sm" icon={Plus}>New voucher</LaterButton>
          </>
        }
      />

      <BentoGrid>
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Issued this month"
            value={model ? rm(model.month.issued_cents) : dash}
            delta="Issued and paid vouchers"
            deltaTone="flat"
            onPrimary
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Paid this month"
            value={model ? rm(model.month.paid_cents) : dash}
            delta="By voucher date"
            deltaTone="flat"
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Drafts"
            value={model ? model.draft_count : dash}
            delta="Not issued yet"
            deltaTone="flat"
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Outstanding"
            value={model ? rm(model.outstanding_cents) : dash}
            delta={model ? `${model.outstanding_count} issued, not paid` : undefined}
            deltaTone="flat"
          />
        </BentoCard>

        <BentoCard
          title="Amount by month"
          subtitle="Vouchers by their date, last 6 months"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          {!model ? LOAD_FAILED : model.count === 0 ? (
            <Muted>No vouchers yet</Muted>
          ) : (
            <AreaTrend data={model.by_month} series={ISSUED_SERIES} height={220} />
          )}
        </BentoCard>
        <BentoCard
          title="Vouchers by type"
          subtitle="All vouchers"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          {!model ? LOAD_FAILED : model.count === 0 ? (
            <Muted>No vouchers yet</Muted>
          ) : (
            <DonutStat data={slices} height={220} centerValue={rm(model.total_cents)} centerLabel="total" />
          )}
        </BentoCard>

        <BentoCard
          title="Vouchers"
          subtitle="Newest first"
          icon={Receipt}
          flush
          className="col-span-2 md:col-span-12"
        >
          {!model ? LOAD_FAILED : model.rows.length === 0 ? (
            <Muted>No vouchers yet</Muted>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Voucher no</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {model.rows.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="whitespace-nowrap font-medium tabular-nums">{v.voucher_no}</TableCell>
                        <TableCell className="whitespace-nowrap">{v.payee}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{v.voucher_type}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                          {rm(v.amount_cents)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(v.issued_date)}
                        </TableCell>
                        <TableCell>
                          <StatusPill tone={STATUS[v.status].tone}>{STATUS[v.status].label}</StatusPill>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center gap-4 border-t px-4 py-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CircleCheck className="size-4 text-emerald-600" /> {model.paid_count} paid
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-amber-600" /> {model.outstanding_count} issued, not paid
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <Wallet className="size-4" /> {rm(model.total_cents)} in total
                </span>
              </div>
            </>
          )}
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
