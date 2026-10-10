'use client';

import type { RefObject } from 'react';
import { Search, Settings2 } from 'lucide-react';
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
  ALL_OWNERS,
  DEAL_STATUS_VIEWS,
  type DealFilters,
  type DealStatusView,
} from '@/lib/crm/deal-filters';
import type { CrmPipeline } from '@/lib/crm/pipelines';

/** The row of controls above the board: search, pipeline, owner and status view. */
export function DealsToolbar({
  filters,
  onChange,
  pipelines,
  pipelineId,
  onPipelineChange,
  owners,
  managing = false,
  onManage,
  manageButtonRef,
}: {
  filters: DealFilters;
  onChange: (next: DealFilters) => void;
  pipelines: Pick<CrmPipeline, 'id' | 'name'>[];
  pipelineId: string;
  onPipelineChange: (id: string) => void;
  /** Every owner with a deal in this pipeline. */
  owners: string[];
  /** True while the Manage pipelines card is open. */
  managing?: boolean;
  /** Opens or closes that card. Present only for people who may change pipelines. */
  onManage?: () => void;
  manageButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search deals"
          placeholder="Search deals across all stages…"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          className="pl-9"
        />
      </div>
      <Select value={pipelineId} onValueChange={onPipelineChange}>
        <SelectTrigger aria-label="Pipeline" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pipelines.map((pipeline) => (
            <SelectItem key={pipeline.id} value={pipeline.id}>
              {pipeline.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onManage ? (
        <Button
          ref={manageButtonRef}
          type="button"
          variant="outline"
          aria-expanded={managing}
          onClick={onManage}
        >
          <Settings2 />
          Manage pipelines
        </Button>
      ) : null}
      <Select value={filters.owner} onValueChange={(owner) => onChange({ ...filters, owner })}>
        <SelectTrigger aria-label="Owner" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_OWNERS}>All owners</SelectItem>
          {owners.map((owner) => (
            <SelectItem key={owner} value={owner}>
              {owner}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.status}
        onValueChange={(status) => onChange({ ...filters, status: status as DealStatusView })}
      >
        <SelectTrigger aria-label="Status view" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DEAL_STATUS_VIEWS.map((view) => (
            <SelectItem key={view.key} value={view.key}>
              {view.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
