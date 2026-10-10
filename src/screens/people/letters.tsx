import { Download, FileText, PieChart, Plus } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { DonutStat } from '@/components/charts';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { Badge } from '@/components/ui/badge';
import { LiveDot } from '@/components/ui/live-dot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { todayInMalaysia } from '@/lib/people/dates';
import { buildLettersModel } from '@/lib/people/documents';
import { EmployeeCell, HR_ONLY, LOAD_FAILED, LaterButton, Muted, StatusPill, loadPeople } from './parts';

/**
 * HR letters. HR sees the team's letters; anyone else sees the letters
 * addressed to them, which the database has already narrowed.
 */
export default async function LettersScreen() {
  const { model } = await loadPeople('letters', async (data, now, ctx) =>
    buildLettersModel(await data.listLetters(), ctx.viewer, todayInMalaysia(now)),
  );

  const totals = model?.totals ?? null;
  const dash = '—';

  return (
    <ScreenContainer>
      <PageHeader
        className="mb-3"
        title="HR Letters"
        subtitle={model && !model.team ? 'Your letters' : 'Letters to employees'}
        actions={
          <LaterButton size="sm" icon={Plus}>
            New letter
          </LaterButton>
        }
      />

      <BentoGrid>
        {model && !model.team ? null : (
          <>
            <BentoCard tone="primary" className="col-span-1 md:col-span-4">
              <BentoStat label="Issued this year" value={totals ? totals.issued_this_year : dash} onPrimary />
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-4">
              <BentoStat label="Drafts" value={totals ? totals.drafts : dash} />
            </BentoCard>
            <BentoCard className="col-span-2 md:col-span-4">
              <BentoStat label="Issued this month" value={totals ? totals.issued_this_month : dash} />
            </BentoCard>
          </>
        )}

        <BentoCard
          title="Letters by type"
          subtitle="Issued this year"
          icon={PieChart}
          className="col-span-2 md:col-span-12"
        >
          {!model ? (
            LOAD_FAILED
          ) : !model.by_type ? (
            HR_ONLY
          ) : model.by_type.length === 0 ? (
            <Muted>No letters issued this year</Muted>
          ) : (
            <DonutStat
              data={model.by_type}
              height={240}
              centerValue={String(totals?.issued_this_year ?? 0)}
              centerLabel="issued"
            />
          )}
        </BentoCard>

        <BentoCard
          title={model && !model.team ? 'Your letters' : 'Recent letters'}
          subtitle="Pulsing dot marks drafts in progress · Download: available in a later update"
          icon={FileText}
          flush
          className="col-span-2 md:col-span-12"
        >
          {!model ? (
            LOAD_FAILED
          ) : model.rows.length === 0 ? (
            <Muted>{model.team ? 'No letters yet' : 'No letters addressed to you yet'}</Muted>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Letter</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {model.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-medium">{row.title}</TableCell>
                      <TableCell>
                        <EmployeeCell name={row.employee_name} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.type_label}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{row.date_label}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <LiveDot active={row.status === 'draft'} />
                          <StatusPill tone={row.status === 'issued' ? 'good' : 'pending'}>
                            {row.status === 'issued' ? 'Issued' : 'Draft'}
                          </StatusPill>
                        </span>
                      </TableCell>
                      <TableCell>
                        <LaterButton variant="ghost" size="sm" icon={Download} compact>
                          Download
                        </LaterButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
