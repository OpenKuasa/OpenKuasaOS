'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Check, Pencil, Plus, Star, Trash2, Workflow } from 'lucide-react';
import { BentoCard } from '@/components/bento/bento';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CrmDeal } from '@/lib/crm/deals';
import type { CrmDealActions, CrmFormAction } from '@/lib/crm/form-state';
import {
  DEFAULT_STAGE_LIST,
  LAST_PIPELINE_MESSAGE,
  MAX_PIPELINE_NAME_LENGTH,
  pipelineHasDealsMessage,
  type CrmPipeline,
} from '@/lib/crm/pipelines';
import { useCrmForm } from './crm-form';

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Adds a pipeline: its name, and its stages typed on one line. */
function NewPipelineForm({
  action,
  onCreated,
}: {
  action: CrmFormAction;
  onCreated: (id: string) => void;
}) {
  const { formAction, pending, error, values } = useCrmForm(action, (id) => {
    if (id) onCreated(id);
  });

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-12">
      <div className="space-y-1.5 md:col-span-4">
        <Label htmlFor="pipeline-name">Name</Label>
        <Input
          id="pipeline-name"
          name="name"
          placeholder="Partner deals"
          defaultValue={values?.name}
          maxLength={MAX_PIPELINE_NAME_LENGTH}
          required
        />
      </div>
      <div className="space-y-1.5 md:col-span-8">
        <Label htmlFor="pipeline-stages">Stages, separated by commas</Label>
        <Input
          id="pipeline-stages"
          name="stages"
          defaultValue={values?.stages ?? DEFAULT_STAGE_LIST}
          aria-describedby="pipeline-stages-hint"
          required
        />
        <p id="pipeline-stages-hint" className="text-xs text-muted-foreground">
          Two to twelve, in board order. A deal moved into a stage named Won counts as won.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-12">
        <Button type="submit" className="w-full md:w-auto" disabled={pending}>
          <Plus className="size-4" />
          {pending ? 'Creating…' : 'Create pipeline'}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** One pipeline in the list, with what can be done to it. */
function PipelineRow({
  pipeline,
  isDefault,
  dealCount,
  only,
  actions,
  onDeleted,
}: {
  pipeline: CrmPipeline;
  /** True for the pipeline the page opens on. */
  isDefault: boolean;
  /** How many of the loaded deals are in it. */
  dealCount: number;
  /** True when it is the workspace's only pipeline. */
  only: boolean;
  actions: CrmDealActions;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const nameId = useId();
  const renameInputId = useId();
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  // The button to go back to once what it opened has closed.
  const returnTo = useRef<'rename' | 'delete' | null>(null);

  const close = () => {
    returnTo.current = mode === 'view' ? null : mode;
    setMode('view');
  };

  const rename = useCrmForm(actions.renamePipeline, close);
  // Its button goes once this is the default, so focus moves along the row.
  const makeDefault = useCrmForm(actions.makeDefaultPipeline, () =>
    renameButtonRef.current?.focus(),
  );
  const remove = useCrmForm(actions.removePipeline, () => onDeleted(pipeline.id));

  useEffect(() => {
    if (mode !== 'view' || !returnTo.current) return;
    (returnTo.current === 'rename' ? renameButtonRef : deleteButtonRef).current?.focus();
    returnTo.current = null;
  }, [mode]);

  // Known before asking: the loaded deals show it cannot be deleted.
  const refusal = only
    ? LAST_PIPELINE_MESSAGE
    : dealCount > 0
      ? pipelineHasDealsMessage(dealCount)
      : null;

  return (
    <li className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p id={nameId} className="min-w-0 break-words text-sm font-semibold">
              {pipeline.name}
            </p>
            {isDefault ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Default
              </span>
            ) : null}
            <span className="shrink-0 text-xs text-muted-foreground">
              {plural(dealCount, 'deal', 'deals')}
            </span>
          </div>
          {pipeline.stages.length > 0 ? (
            <ul aria-label={`Stages of ${pipeline.name}`} className="flex flex-wrap gap-1.5">
              {pipeline.stages.map((stage) => (
                <li
                  key={stage.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  <span className={`size-1.5 shrink-0 rounded-full ${stage.dot}`} aria-hidden />
                  {stage.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No stages.</p>
          )}
        </div>

        {mode === 'view' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              ref={renameButtonRef}
              type="button"
              variant="outline"
              size="sm"
              aria-describedby={nameId}
              onClick={() => setMode('rename')}
            >
              <Pencil />
              Rename
            </Button>
            {isDefault ? null : (
              <form action={makeDefault.formAction}>
                <input type="hidden" name="pipelineId" value={pipeline.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  aria-describedby={nameId}
                  disabled={makeDefault.pending}
                >
                  <Star />
                  {makeDefault.pending ? 'Saving…' : 'Make default'}
                </Button>
              </form>
            )}
            <Button
              ref={deleteButtonRef}
              type="button"
              variant="destructive"
              size="sm"
              aria-describedby={nameId}
              onClick={() => setMode('delete')}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      {mode === 'view' && makeDefault.error ? (
        <p role="alert" className="text-sm text-destructive">
          {makeDefault.error}
        </p>
      ) : null}

      {mode === 'rename' ? (
        <form action={rename.formAction} className="space-y-2">
          <input type="hidden" name="pipelineId" value={pipeline.id} />
          <div className="space-y-1.5">
            <Label htmlFor={renameInputId}>New name</Label>
            <Input
              id={renameInputId}
              name="name"
              defaultValue={rename.values?.name ?? pipeline.name}
              maxLength={MAX_PIPELINE_NAME_LENGTH}
              className="bg-background sm:max-w-sm"
              required
              autoFocus
            />
          </div>
          {rename.error ? (
            <p role="alert" className="text-sm text-destructive">
              {rename.error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={rename.pending}>
              <Check />
              {rename.pending ? 'Saving…' : 'Save name'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={close}
              disabled={rename.pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {mode === 'delete' && refusal ? (
        <div className="space-y-2 rounded-lg border bg-background p-3">
          <p role="alert" className="text-sm">
            <span className="font-medium">{pipeline.name}</span> cannot be deleted. {refusal}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={close} autoFocus>
            OK
          </Button>
        </div>
      ) : null}

      {mode === 'delete' && !refusal ? (
        <form
          action={remove.formAction}
          className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
        >
          <input type="hidden" name="pipelineId" value={pipeline.id} />
          <p className="text-sm">
            Delete <span className="font-medium">{pipeline.name}</span>? Its{' '}
            {plural(pipeline.stages.length, 'stage is', 'stages are')} deleted too.
            {isDefault ? ' Another pipeline becomes the default.' : ''} This cannot be undone.
          </p>
          {remove.error ? (
            <p role="alert" className="text-sm text-destructive">
              {remove.error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={remove.pending}>
              <Trash2 />
              {remove.pending ? 'Deleting…' : 'Delete pipeline'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={close}
              disabled={remove.pending}
              autoFocus
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

/** Opened by Manage pipelines: the workspace's pipelines, and a form for another. */
export function ManagePipelinesCard({
  pipelines,
  deals,
  dealsCapped,
  actions,
  onCreated,
  onDeleted,
  onClose,
  closeRef,
}: {
  /** The default first, as the page lists them. */
  pipelines: CrmPipeline[];
  /** The loaded deals, across every pipeline. */
  deals: CrmDeal[];
  /** True when the workspace has more deals than were loaded. */
  dealsCapped: boolean;
  actions: CrmDealActions;
  /** Called with the id of a pipeline that has just been made. */
  onCreated: (id: string) => void;
  /** Called with the id of a pipeline that has just been deleted. */
  onDeleted: (id: string) => void;
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const counts = new Map<string, number>();
  for (const deal of deals) counts.set(deal.pipelineId, (counts.get(deal.pipelineId) ?? 0) + 1);
  // The one the page opens on. With two marked by mistake, the first.
  const defaultId = pipelines.find((pipeline) => pipeline.isDefault)?.id ?? null;

  return (
    <BentoCard
      title="Pipelines"
      subtitle="Add, rename or delete"
      // The card's icon chip only draws icons from the animated set.
      icon={Workflow}
      action={
        <Button ref={closeRef} type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <ul aria-label="Pipelines" className="space-y-2">
          {pipelines.map((pipeline) => (
            <PipelineRow
              key={pipeline.id}
              pipeline={pipeline}
              isDefault={pipeline.id === defaultId}
              dealCount={counts.get(pipeline.id) ?? 0}
              only={pipelines.length === 1}
              actions={actions}
              onDeleted={(id) => {
                // Its row is about to go.
                closeRef.current?.focus();
                onDeleted(id);
              }}
            />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          The default pipeline is the one this page opens on.
          {dealsCapped ? ` Deal counts cover the ${deals.length} most recent deals.` : ''}
        </p>
        <div className="space-y-3 border-t pt-4">
          <h4 className="text-sm font-semibold">New pipeline</h4>
          <NewPipelineForm action={actions.createPipeline} onCreated={onCreated} />
        </div>
      </div>
    </BentoCard>
  );
}
