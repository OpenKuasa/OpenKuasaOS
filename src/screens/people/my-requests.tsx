import { ClipboardList, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { LiveDot } from '@/components/ui/live-dot';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { REQUEST_STATUS_LABEL } from '@/lib/people/own';
import type { RequestStatus } from '@/lib/people/types';
import { LOAD_FAILED, LaterButton, Muted, NotLinkedCard, StatusPill, requestTone } from './parts';

/** The status column: a live dot while a request waits, then the pill. */
export function StatusCell({ status }: { status: RequestStatus }) {
  return (
    <span className="flex items-center gap-2">
      <LiveDot active={status === 'pending'} />
      <StatusPill tone={requestTone(status)}>{REQUEST_STATUS_LABEL[status]}</StatusPill>
    </span>
  );
}

export type RequestKpi = { label: string; value: ReactNode; caption?: string };

export type RequestTableRow = {
  key: string;
  /** One node per column. The cell for the first column is shown in bold. */
  cells: ReactNode[];
};

/**
 * The layout the four "my requests" screens share: a header with one control
 * that is not built yet, four figures, two summary cards, and the person's
 * own requests. `model` is null when the read failed; `linked` is false when
 * the account is linked to no employee record.
 */
export function MyRequestsScreen({
  title,
  subtitle,
  laterLabel,
  model,
  kpis,
  summary,
  tableSubtitle,
  columns,
  rows,
  emptyText,
}: {
  title: string;
  subtitle: string;
  laterLabel: string;
  /** Null when the read failed. */
  model: { linked: boolean } | null;
  kpis: RequestKpi[];
  /** The two summary cards, as BentoCards with their own grid spans. */
  summary: ReactNode;
  tableSubtitle: string;
  columns: string[];
  rows: RequestTableRow[];
  emptyText: string;
}) {
  const header = (
    <PageHeader
      className="mb-3"
      title={title}
      subtitle={subtitle}
      actions={
        <LaterButton icon={Plus} size="sm">
          {laterLabel}
        </LaterButton>
      }
    />
  );

  if (!model) {
    return (
      <ScreenContainer>
        {header}
        <BentoGrid>
          <BentoCard className="col-span-2 md:col-span-12">{LOAD_FAILED}</BentoCard>
        </BentoGrid>
      </ScreenContainer>
    );
  }

  if (!model.linked) {
    return (
      <ScreenContainer>
        {header}
        <BentoGrid>
          <NotLinkedCard />
        </BentoGrid>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {header}
      <BentoGrid>
        {kpis.map((kpi, index) => (
          <BentoCard key={kpi.label} tone={index === 0 ? 'primary' : 'default'} className={kpis.length === 3 ? 'col-span-1 md:col-span-4' : 'col-span-1 md:col-span-3'}>
            <BentoStat
              label={kpi.label}
              value={kpi.value}
              delta={kpi.caption}
              deltaTone="flat"
              onPrimary={index === 0}
            />
          </BentoCard>
        ))}

        {summary}

        <BentoCard
          title="My requests"
          subtitle={tableSubtitle}
          icon={ClipboardList}
          flush
          className="col-span-2 md:col-span-12"
        >
          {rows.length === 0 ? (
            <Muted>{emptyText}</Muted>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {columns.map((column) => (
                      <TableHead key={column} className="whitespace-nowrap">
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.key}>
                      {row.cells.map((cell, index) => (
                        <TableCell
                          key={columns[index]}
                          className={index === 0 ? 'whitespace-nowrap font-medium' : 'whitespace-nowrap'}
                        >
                          {cell}
                        </TableCell>
                      ))}
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
