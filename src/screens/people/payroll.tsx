import { PieChart, ReceiptText, TrendingUp, Users } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { AreaTrend, DonutStat, type Series, type Slice } from '@/components/charts';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { readPayroll } from '@/lib/people/payroll';
import { rm } from '@/lib/reach/format';
import { HrOnlyScreen, LOAD_FAILED, LaterButton, Muted, StatusPill, loadPeople } from './parts';

const COST_SERIES: Series[] = [{ key: 'value', label: 'Gross (RM)', color: 'var(--chart-1)' }];
const DEDUCTION_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];

const STATUS_LABEL = { draft: 'Draft', paid: 'Paid', pending: 'Pending' } as const;

/** The latest payroll run and its payslips, as recorded. Owners and admins only; nothing here changes data yet. */
export default async function PayrollScreen() {
  const { model, viewer } = await loadPeople('payroll', (data, _now, ctx) => readPayroll(data, ctx.viewer));
  if (!viewer.isHr && !viewer.isDemo) return <HrOnlyScreen title="Payroll" />;

  const latest = model?.latest ?? null;
  const dash = '—';
  const slices: Slice[] = (model?.deductions ?? []).map((d, index) => ({
    key: d.key,
    label: d.label,
    value: d.value / 100,
    color: DEDUCTION_COLORS[index % DEDUCTION_COLORS.length],
  }));
  const noRun = <Muted>No payroll run yet</Muted>;

  return (
    <ScreenContainer>
      <PageHeader
        title="Payroll"
        subtitle={latest ? `${latest.label} · ${STATUS_LABEL[latest.status]}` : 'Monthly payroll runs'}
        actions={
          <>
            <LaterButton variant="outline" size="sm" compact>Export</LaterButton>
            <LaterButton size="sm">Run payroll</LaterButton>
          </>
        }
      />

      <BentoGrid>
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Gross payroll"
            value={model ? (latest ? rm(latest.gross_cents) : dash) : dash}
            delta={latest?.label}
            deltaTone="flat"
            onPrimary
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Net pay"
            value={model ? (latest ? rm(latest.net_cents) : dash) : dash}
            delta={latest ? STATUS_LABEL[latest.status] : undefined}
            deltaTone="flat"
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Deductions"
            value={model ? (latest ? rm(latest.deductions_cents) : dash) : dash}
            delta={latest ? 'EPF, SOCSO, EIS, PCB' : undefined}
            deltaTone="flat"
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Headcount paid"
            value={model ? (latest ? latest.headcount : dash) : dash}
            delta={latest ? `${latest.paid_count} of ${latest.headcount} payslips paid` : undefined}
            deltaTone="flat"
          />
        </BentoCard>

        <BentoCard
          title="Gross payroll by month"
          subtitle="The runs on record"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          {!model ? LOAD_FAILED : model.by_month.length === 0 ? noRun : (
            <AreaTrend data={model.by_month} series={COST_SERIES} height={240} />
          )}
        </BentoCard>
        <BentoCard
          title="Deductions breakdown"
          subtitle={latest ? latest.label : 'Latest run'}
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          {!model ? LOAD_FAILED : !latest || latest.deductions_cents === 0 ? (
            <Muted>No deductions recorded</Muted>
          ) : (
            <DonutStat
              data={slices}
              height={240}
              centerValue={rm(latest.deductions_cents)}
              centerLabel="deductions"
            />
          )}
        </BentoCard>

        <BentoCard
          title="Payslips"
          subtitle={latest ? `${latest.label} · as recorded on each payslip` : 'Latest run'}
          icon={ReceiptText}
          flush
          className="col-span-2 md:col-span-12"
        >
          {!model ? LOAD_FAILED : !latest ? noRun : latest.slips.length === 0 ? (
            <Muted>This run has no payslips</Muted>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">EPF</TableHead>
                      <TableHead className="text-right">SOCSO</TableHead>
                      <TableHead className="text-right">EIS</TableHead>
                      <TableHead className="text-right">PCB</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latest.slips.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="whitespace-nowrap font-medium">{s.employee_name}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{rm(s.gross_cents)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                          {rm(s.epf_cents)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                          {rm(s.socso_cents)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                          {rm(s.eis_cents)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                          {rm(s.pcb_cents)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {rm(s.deductions_cents)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                          {rm(s.net_cents)}
                        </TableCell>
                        <TableCell>
                          <StatusPill tone={s.status === 'paid' ? 'good' : 'pending'}>
                            {STATUS_LABEL[s.status]}
                          </StatusPill>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
                <Users className="size-4" />
                <span>
                  {latest.slips.length} {latest.slips.length === 1 ? 'payslip' : 'payslips'} in this run
                </span>
              </div>
            </>
          )}
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
