'use client';

import { type RefObject } from 'react';
import { ClipboardList } from 'lucide-react';
import { BentoCard } from '@/components/bento/bento';
import { Button } from '@/components/ui/button';
import {
  CLOSING_SOON_DAYS,
  formatDay,
  formatRM,
  type DealDailyReport,
} from '@/lib/crm/deal-stats';

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-bold tracking-tight tabular-nums sm:text-xl">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Opened by the Daily Report button: today's figures for the pipeline on the board. */
export function DailyReportCard({
  report,
  pipelineName,
  showDate,
  onClose,
  closeRef,
}: {
  report: DealDailyReport;
  pipelineName: string;
  /** False on the sample view, whose deals carry no dates. */
  showDate: boolean;
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const more = report.closingSoonTotal - report.closingSoon.length;

  return (
    <BentoCard
      title="Daily report"
      subtitle={showDate ? `${formatDay(report.day)} · ${pipelineName}` : pipelineName}
      // The card's icon chip only draws icons from the animated set.
      icon={ClipboardList}
      action={
        <Button ref={closeRef} type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
      className="col-span-2 md:col-span-12"
    >
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Created today" value={String(report.createdToday)} />
        <Figure
          label="Won today"
          value={String(report.wonToday)}
          note={formatRM(report.wonTodayValue)}
        />
        <Figure
          label="Open pipeline value"
          value={formatRM(report.openValue)}
          note={count(report.openDeals, 'open deal', 'open deals')}
        />
        <Figure
          label={`Closing in ${CLOSING_SOON_DAYS} days`}
          value={String(report.closingSoonTotal)}
          note="By expected close date"
        />
      </dl>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Expected to close in the next {CLOSING_SOON_DAYS} days
      </h4>
      {report.closingSoon.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No open deals are expected to close in the next {CLOSING_SOON_DAYS} days.
        </p>
      ) : (
        <ul className="mt-2 divide-y rounded-lg border">
          {report.closingSoon.map((deal) => (
            <li key={deal.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-medium">{deal.title}</p>
                <p className="truncate text-xs text-muted-foreground">{deal.company}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums">{formatRM(deal.value)}</span>
              <span className="w-24 text-right text-xs text-muted-foreground">
                {deal.expectedClose ? formatDay(deal.expectedClose) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          And {count(more, 'more deal', 'more deals')}.
        </p>
      ) : null}
    </BentoCard>
  );
}
