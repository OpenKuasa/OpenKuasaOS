'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CrmDealActions, CrmFormAction } from '@/lib/crm/form-state';
import {
  MAX_PIPELINE_STAGES,
  MAX_STAGES_MESSAGE,
  MAX_STAGE_NAME_LENGTH,
  MIN_PIPELINE_STAGES,
  MIN_STAGES_MESSAGE,
  isWonStage,
  stageHasDealsMessage,
  type CrmPipeline,
  type CrmPipelineStage,
} from '@/lib/crm/pipelines';
import { useCrmForm } from './crm-form';

type StageControl = 'up' | 'down' | 'rename' | 'remove';

const GAINS_WON =
  'A stage named Won marks deals as won. Deals moved into this stage from now on will count as won; deals already in it keep their status.';
const LOSES_WON =
  'Deals count as won when they are moved into a stage named Won. With another name, deals moved into this stage will no longer count as won. Deals already won keep their status.';
const REMOVES_WON =
  'Deals count as won when they are moved into a stage named Won. Without it, moving a deal in this pipeline will no longer mark it as won. Deals already won keep their status.';

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** A stage's name in a field, with what the new name does to "Won" said under it. */
function RenameStageForm({
  pipeline,
  stage,
  action,
  onClose,
}: {
  pipeline: CrmPipeline;
  stage: CrmPipelineStage;
  action: CrmFormAction;
  onClose: () => void;
}) {
  // Held here, so the line about Won follows what is typed and a refused
  // name stays in the field.
  const [name, setName] = useState(stage.name);
  const { formAction, pending, error, values } = useCrmForm(action, onClose);
  const inputId = useId();
  const noteId = useId();
  // A refusal is about the name that was sent, so it goes once that changes.
  const shownError = error && values?.name === name ? error : null;

  const typed = name.trim();
  const otherWon = pipeline.stages.some((s) => s.id !== stage.id && isWonStage(s.name));
  const note = !typed
    ? null
    : isWonStage(stage.name) && !isWonStage(typed)
      ? LOSES_WON
      : !isWonStage(stage.name) && isWonStage(typed) && !otherWon
        ? GAINS_WON
        : null;

  return (
    <form
      action={formAction}
      // The button stays enabled so focus stays on it; a second press waits.
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
      className="w-full space-y-2"
    >
      <input type="hidden" name="pipelineId" value={pipeline.id} />
      <input type="hidden" name="stageId" value={stage.id} />
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>New name for {stage.name}</Label>
        <Input
          id={inputId}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_STAGE_NAME_LENGTH}
          aria-describedby={note ? noteId : undefined}
          className="sm:max-w-sm"
          required
          autoFocus
        />
        {note ? (
          <p id={noteId} className="text-xs text-muted-foreground">
            {note}
          </p>
        ) : null}
      </div>
      {shownError ? (
        <p role="alert" className="text-sm text-destructive">
          {shownError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm">
          <Check />
          {pending ? 'Saving…' : 'Save name'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Asks before a stage is removed, or says why it cannot be. */
function RemoveStageConfirm({
  pipeline,
  stage,
  dealCount,
  action,
  onClose,
  onRemoved,
}: {
  pipeline: CrmPipeline;
  stage: CrmPipelineStage;
  /** How many of the loaded deals are in the stage. */
  dealCount: number;
  action: CrmFormAction;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const { formAction, pending, error } = useCrmForm(action, onRemoved);

  // Known before asking. The write checks both again, against every deal.
  const refusal =
    pipeline.stages.length <= MIN_PIPELINE_STAGES
      ? MIN_STAGES_MESSAGE
      : dealCount > 0
        ? stageHasDealsMessage(dealCount)
        : null;

  if (refusal) {
    return (
      <div className="w-full space-y-2">
        <p role="alert" className="text-sm">
          <span className="font-medium">{stage.name}</span> cannot be removed. {refusal}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onClose} autoFocus>
          OK
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
      className="w-full space-y-2"
    >
      <input type="hidden" name="pipelineId" value={pipeline.id} />
      <input type="hidden" name="stageId" value={stage.id} />
      <p className="text-sm">
        Remove <span className="font-medium">{stage.name}</span> from {pipeline.name}? This cannot
        be undone.
      </p>
      {isWonStage(stage.name) ? <p className="text-xs text-muted-foreground">{REMOVES_WON}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" size="sm">
          <Trash2 />
          {pending ? 'Removing…' : 'Remove stage'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={pending}
          autoFocus
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A name field and Add. The new stage goes before Won, or last. */
function AddStageForm({ pipeline, action }: { pipeline: CrmPipeline; action: CrmFormAction }) {
  const [name, setName] = useState('');
  const { formAction, pending, error, values } = useCrmForm(action, () => setName(''));
  const inputId = useId();
  const hintId = useId();
  // A refusal is about the name that was sent, so it goes once that changes.
  const shownError = error && values?.name === name ? error : null;

  if (pipeline.stages.length >= MAX_PIPELINE_STAGES) {
    return <p className="text-xs text-muted-foreground">{MAX_STAGES_MESSAGE}</p>;
  }

  const hasWon = pipeline.stages.some((stage) => isWonStage(stage.name));
  const hint = hasWon
    ? 'It goes just before Won, so Won stays the end of the pipeline.'
    : isWonStage(name)
      ? `It goes last. ${GAINS_WON}`
      : 'It goes last.';

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
      className="space-y-1.5"
    >
      <input type="hidden" name="pipelineId" value={pipeline.id} />
      <Label htmlFor={inputId}>New stage</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={inputId}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Site visit"
          maxLength={MAX_STAGE_NAME_LENGTH}
          aria-describedby={hintId}
          className="min-w-0 flex-1 basis-40 sm:max-w-sm"
          required
        />
        <Button type="submit" size="sm">
          <Plus />
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>
      {shownError ? (
        <p role="alert" className="text-sm text-destructive">
          {shownError}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Opened by a pipeline's Edit stages: its stages in board order, each with
 * Move up, Move down, Rename and Remove, and a field to add another.
 */
export function PipelineStagesEditor({
  pipeline,
  dealCounts,
  actions,
  onClose,
}: {
  pipeline: CrmPipeline;
  /** How many of the loaded deals are in each stage, by stage id. */
  dealCounts: Map<string, number>;
  actions: CrmDealActions;
  onClose: () => void;
}) {
  // One stage at a time is being renamed or asked about.
  const [open, setOpen] = useState<{ kind: 'rename' | 'remove'; stageId: string } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  // The control to put focus on once the page has caught up.
  const focusNext = useRef<{ stageId: string; control: StageControl } | 'done' | null>(null);
  const [, startTransition] = useTransition();

  const move = useCrmForm(actions.moveStage);

  const stages = pipeline.stages;
  const order = stages.map((stage) => stage.id).join(' ');

  // A moved stage's row is put elsewhere in the list, which can drop focus,
  // and the button that was pressed is disabled once the stage reaches an
  // end. Focus goes back to it, or to its opposite. Likewise the button that
  // opened a rename or a confirmation gets focus back when that closes.
  useEffect(() => {
    const target = focusNext.current;
    if (!target || open) return;
    focusNext.current = null;
    if (target === 'done') {
      doneRef.current?.focus();
      return;
    }
    const find = (control: StageControl) =>
      listRef.current?.querySelector<HTMLButtonElement>(
        `[data-stage-id="${target.stageId}"] [data-control="${control}"]`,
      );
    let button = find(target.control);
    if (button?.disabled && (target.control === 'up' || target.control === 'down')) {
      button = find(target.control === 'up' ? 'down' : 'up');
    }
    (button && !button.disabled ? button : doneRef.current)?.focus();
  }, [order, open]);

  // A move that was refused moves nothing, so there is nothing to follow.
  useEffect(() => {
    if (move.error) focusNext.current = null;
  }, [move.error]);

  const sendMove = (stage: CrmPipelineStage, direction: 'up' | 'down') => {
    // A second press while one is on its way is ignored, not queued.
    if (move.pending) return;
    focusNext.current = { stageId: stage.id, control: direction };
    const formData = new FormData();
    formData.set('pipelineId', pipeline.id);
    formData.set('stageId', stage.id);
    formData.set('direction', direction);
    startTransition(() => move.formAction(formData));
  };

  const close = (stageId: string, control: StageControl) => {
    focusNext.current = { stageId, control };
    setOpen(null);
  };

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h4 className="text-sm font-semibold">Stages of {pipeline.name}</h4>
          <p className="text-xs text-muted-foreground">
            In board order. Each stage&apos;s chance of closing is set from its place in the order,
            ending at 100%.
          </p>
        </div>
        <Button ref={doneRef} type="button" variant="outline" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>

      {stages.length > 0 ? (
        <ol ref={listRef} aria-label={`Stages of ${pipeline.name}`} className="space-y-1.5">
          {stages.map((stage, index) => {
            const dealCount = dealCounts.get(stage.id) ?? 0;
            const mode = open?.stageId === stage.id ? open.kind : 'view';
            return (
              <li
                key={stage.id}
                data-stage-id={stage.id}
                className={
                  mode === 'remove'
                    ? 'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5'
                    : 'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-muted/30 p-2.5'
                }
              >
                {mode === 'rename' ? (
                  <RenameStageForm
                    pipeline={pipeline}
                    stage={stage}
                    action={actions.renameStage}
                    onClose={() => close(stage.id, 'rename')}
                  />
                ) : mode === 'remove' ? (
                  <RemoveStageConfirm
                    pipeline={pipeline}
                    stage={stage}
                    dealCount={dealCount}
                    action={actions.removeStage}
                    onClose={() => close(stage.id, 'remove')}
                    onRemoved={() => {
                      // Its row is about to go.
                      focusNext.current = 'done';
                      setOpen(null);
                    }}
                  />
                ) : (
                  <>
                    <div className="flex min-w-0 flex-1 basis-44 items-center gap-2">
                      <span className={`size-2 shrink-0 rounded-full ${stage.dot}`} aria-hidden />
                      <span className="min-w-0 break-words text-sm font-medium">{stage.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {stage.probability}% · {plural(dealCount, 'deal', 'deals')}
                      </span>
                    </div>
                    {/* Each label names its stage; the words show where there is room. */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        data-control="up"
                        aria-label={`Move ${stage.name} up`}
                        title="Move up"
                        disabled={index === 0}
                        onClick={() => sendMove(stage, 'up')}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        data-control="down"
                        aria-label={`Move ${stage.name} down`}
                        title="Move down"
                        disabled={index === stages.length - 1}
                        onClick={() => sendMove(stage, 'down')}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-control="rename"
                        aria-label={`Rename ${stage.name}`}
                        onClick={() => setOpen({ kind: 'rename', stageId: stage.id })}
                      >
                        <Pencil />
                        <span className="hidden sm:inline">Rename</span>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        data-control="remove"
                        aria-label={`Remove ${stage.name}`}
                        onClick={() => setOpen({ kind: 'remove', stageId: stage.id })}
                      >
                        <Trash2 />
                        <span className="hidden sm:inline">Remove</span>
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">No stages yet.</p>
      )}

      {move.pending ? (
        <p role="status" className="text-xs text-muted-foreground">
          Moving…
        </p>
      ) : null}
      {move.error ? (
        <p role="alert" className="text-sm text-destructive">
          {move.error}
        </p>
      ) : null}

      <div className="border-t pt-3">
        <AddStageForm pipeline={pipeline} action={actions.addStage} />
      </div>
    </div>
  );
}
