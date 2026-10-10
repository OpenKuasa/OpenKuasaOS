import { CalendarClock, Download, FileSignature, FileText, PieChart, Upload } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { DonutStat } from '@/components/charts';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { LiveDot } from '@/components/ui/live-dot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { todayInMalaysia } from '@/lib/people/dates';
import { buildDocumentsModel } from '@/lib/people/documents';
import type { DocumentStatus } from '@/lib/people/types';
import { LOAD_FAILED, LaterButton, Muted, NotLinkedCard, StatusPill, loadPeople } from './parts';

const STATUS_TONE: Record<DocumentStatus, 'good' | 'pending' | 'bad' | 'neutral'> = {
  signed: 'good',
  pending_signature: 'pending',
  available: 'neutral',
  expiring: 'bad',
};

/** The signed-in employee's own document library. Records only: no file is stored yet. */
export default async function MyDocumentsScreen() {
  const { model } = await loadPeople('my-documents', async (data, now, ctx) =>
    buildDocumentsModel(await data.listDocuments(), ctx.viewer, todayInMalaysia(now)),
  );

  const header = (
    <PageHeader
      title="My Documents"
      subtitle="Your payslips, EA form, contract and letters."
      actions={
        <LaterButton variant="outline" size="sm" icon={Upload}>
          Upload
        </LaterButton>
      }
    />
  );

  if (model && !model.linked) {
    return (
      <ScreenContainer>
        {header}
        <BentoGrid>
          <NotLinkedCard />
        </BentoGrid>
      </ScreenContainer>
    );
  }
  const loaded = model && model.linked ? model : null;

  return (
    <ScreenContainer>
      {header}

      <BentoGrid>
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat label="Documents" value={loaded ? loaded.total : '—'} onPrimary />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Pending signature" value={loaded ? loaded.pending_signature : '—'} />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Expiring within 90 days" value={loaded ? loaded.expiring_soon : '—'} />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Payslips" value={loaded ? loaded.payslips : '—'} />
        </BentoCard>

        <BentoCard title="By type" subtitle="Your document library" icon={PieChart} className="col-span-2 md:col-span-4">
          {!loaded ? (
            LOAD_FAILED
          ) : loaded.by_type.length === 0 ? (
            <Muted>No documents on file yet</Muted>
          ) : (
            <DonutStat
              data={loaded.by_type}
              height={240}
              centerValue={String(loaded.total)}
              centerLabel="documents"
            />
          )}
        </BentoCard>

        <BentoCard
          title="All documents"
          subtitle="Most recent first · Download: available in a later update"
          icon={FileText}
          flush
          className="col-span-2 md:col-span-8"
        >
          {!loaded ? (
            LOAD_FAILED
          ) : loaded.rows.length === 0 ? (
            <Muted>No documents on file yet</Muted>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loaded.rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                              {row.pending_signature ? (
                                <FileSignature className="size-4" />
                              ) : (
                                <FileText className="size-4" />
                              )}
                            </span>
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-medium">{row.title}</span>
                              {row.pending_signature ? <LiveDot active /> : null}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{row.type_label}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{row.date_label}</TableCell>
                        <TableCell>
                          <StatusPill tone={STATUS_TONE[row.status]}>{row.status_label}</StatusPill>
                        </TableCell>
                        <TableCell className="text-right">
                          <LaterButton variant="ghost" size="sm" icon={Download} compact>
                            Download
                          </LaterButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
                <span>
                  {loaded.total} documents · {loaded.payslips} payslips
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="size-4" />
                  {loaded.pending_signature} awaiting your signature
                </span>
              </div>
            </>
          )}
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
