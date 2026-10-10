'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { AlertDialog, Dialog } from 'radix-ui';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createJobAction,
  deleteJobAction,
  setJobStatusAction,
  updateJobAction,
} from '@/app/(app)/hire/actions';
import {
  EMPTY_JOB_FORM,
  allowedMoves,
  formErrors,
  fromJob,
  toInput,
  type JobFormErrors,
  type JobFormValues,
} from '@/lib/hire/job-form';
import type { JobsModel } from '@/lib/hire/lists';
import type { EmploymentType, WorkArrangement } from '@/lib/hire/types';
import { cn } from '@/lib/utils';
import { SELECT_CLASS } from '@/screens/crm/crm-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LiveDot } from '@/components/ui/live-dot';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Row = JobsModel['rows'][number];
type ActionResult = { ok: boolean; error?: string };
type Field = keyof JobFormValues;
type JobInput = ReturnType<typeof toInput>;

const PILL: Record<Row['status'], string> = {
  Open: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  Paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  Closed: 'bg-muted text-muted-foreground',
  Draft: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
};

const ARRANGEMENT_LABEL: Record<WorkArrangement, string> = {
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
};
const TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
};

const HAS_APPLICATIONS = 'This job has applications. Close it instead.';
const NOT_SENT = 'That change could not be sent. Check your connection and try again.';

/** The fields that can be wrong, in the order they appear in the form. */
const FIELD_ORDER = [
  'title',
  'department',
  'employmentType',
  'headcount',
  'location',
  'workArrangement',
  'description',
  'salaryMin',
  'salaryMax',
  'closesOn',
] as const satisfies readonly Field[];
/** Every form value, for telling whether anything changed. */
const FIELD_KEYS = Object.keys(EMPTY_JOB_FORM) as Field[];

// The dialog look of the app's other CRUD screens (see ad-studio-table.tsx).
const OVERLAY_CLASS = 'fixed inset-0 z-50 bg-black/40';
const CONTENT_CLASS =
  'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-lg outline-none max-h-[85vh] overflow-y-auto';
const ALERT_CLASS =
  'rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive';
/** 44 pixels of hit area on every button and field. */
const TARGET = 'min-h-11 min-w-11';
const FIELD_HEIGHT = 'h-11';

/** "Hybrid · 2 openings", or just "1 opening". */
function openings(job: Row['job']): string {
  const count = `${job.headcount} ${job.headcount === 1 ? 'opening' : 'openings'}`;
  return job.work_arrangement ? `${ARRANGEMENT_LABEL[job.work_arrangement]} · ${count}` : count;
}

export function JobsTable({ rows, canEdit, today }: { rows: Row[]; canEdit: boolean; today: string }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Whether the open form differs from what it started with. */
  const [dirty, setDirty] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const reasonId = useId();

  function act(promise: Promise<ActionResult>, onOk: () => void) {
    setNotice(null);
    start(async () => {
      try {
        const result = await promise;
        if (result.ok) {
          setError(null);
          onOk();
        } else {
          setError(result.error ?? 'Something went wrong.');
        }
      } catch {
        setError(NOT_SENT);
      }
    });
  }

  const formOpen = canEdit && (creating || editing !== null);

  function openForm(row: Row | null) {
    setError(null);
    setDirty(false);
    setEditing(row);
    setCreating(row === null);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setDirty(false);
    setConfirmingDiscard(false);
    setError(null);
  }

  /** Cancel, Escape and a click outside all come here. */
  function requestClose() {
    if (pending) return;
    if (dirty) setConfirmingDiscard(true);
    else closeForm();
  }

  return (
    <div className="mt-3">
      {/* The live region is always in the page, so a change to its text is announced. */}
      <div className={cn('flex items-center gap-3 px-4', canEdit && 'min-h-11 pb-3')}>
        <p aria-live="polite" className="sr-only sm:not-sr-only sm:text-sm sm:text-muted-foreground">
          {notice}
        </p>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            className={cn(TARGET, 'ml-auto')}
            onClick={() => openForm(null)}
            disabled={pending}
          >
            <Plus className="size-4" />
            Post a Job
          </Button>
        )}
      </div>
      {error && !formOpen && (
        <p role="alert" className={cn(ALERT_CLASS, 'mx-4 mb-3')}>
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="grid min-h-24 place-items-center text-center text-sm text-muted-foreground">
          No jobs yet
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Applicants</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Posted</TableHead>
                {canEdit && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const blocked = row.applicants > 0;
                const blockedId = `${reasonId}-${row.id}`;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      <span className="flex items-center gap-2.5 font-medium">
                        <LiveDot active={row.status === 'Open'} />
                        {row.title}
                      </span>
                      <span className="mt-0.5 block pl-[18px] text-xs text-muted-foreground">
                        {openings(row.job)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{row.dept}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.applicants}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                          PILL[row.status],
                        )}
                      >
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{row.posted}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={TARGET}
                            aria-label={`Edit ${row.title}`}
                            disabled={pending}
                            onClick={() => openForm(row)}
                          >
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                          {allowedMoves(row.job.status).map((move) => (
                            <Button
                              key={move.to}
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={TARGET}
                              aria-label={`${move.label} ${row.title}`}
                              disabled={pending}
                              onClick={() =>
                                act(setJobStatusAction({ id: row.id, status: move.to }), () =>
                                  setNotice(`${row.title} is now ${move.to}.`),
                                )
                              }
                            >
                              {move.label}
                            </Button>
                          ))}
                          {/* The wrapper carries the reason too: a disabled button shows no tooltip of its own. */}
                          <span title={blocked ? HAS_APPLICATIONS : undefined}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn(TARGET, 'text-destructive hover:text-destructive')}
                              aria-label={`Delete ${row.title}`}
                              aria-describedby={blocked ? blockedId : undefined}
                              title={blocked ? HAS_APPLICATIONS : undefined}
                              disabled={pending || blocked}
                              onClick={() => setDeleting(row)}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </Button>
                            {blocked && (
                              <span id={blockedId} className="sr-only">
                                {HAS_APPLICATIONS}
                              </span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog.Root
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={OVERLAY_CLASS} />
          <AlertDialog.Content className={cn(CONTENT_CLASS, 'max-w-sm')}>
            <AlertDialog.Title className="text-base font-semibold break-words">
              Delete “{deleting?.title}”?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-1 text-sm text-muted-foreground">
              This can&apos;t be undone.
            </AlertDialog.Description>
            <div className="mt-5 flex items-center justify-between gap-6">
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="outline" size="sm" className={TARGET} autoFocus>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className={TARGET}
                  disabled={pending}
                  onClick={() => {
                    if (!deleting) return;
                    const { id, title } = deleting;
                    act(deleteJobAction({ id }), () => setNotice(`${title} was deleted.`));
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete job
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* Job form */}
      <Dialog.Root
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={OVERLAY_CLASS} />
          <Dialog.Content className={cn(CONTENT_CLASS, 'max-w-lg')}>
            <Dialog.Title className="text-base font-semibold">
              {editing ? 'Edit job' : 'Post a job'}
            </Dialog.Title>
            <Dialog.Description className="mb-4 text-sm text-muted-foreground">
              {editing
                ? 'Update this job’s details.'
                : 'A new job is saved as a draft. Open it when you are ready for applications.'}
            </Dialog.Description>
            {formOpen && (
              <JobForm
                key={editing?.id ?? 'new'}
                row={editing}
                today={today}
                pending={pending}
                error={error}
                onDirtyChange={setDirty}
                onCancel={requestClose}
                onSubmit={(input) =>
                  act(
                    editing ? updateJobAction({ id: editing.id, ...input }) : createJobAction(input),
                    () => {
                      closeForm();
                      setNotice(editing ? 'Changes saved.' : 'Job saved as a draft.');
                    },
                  )
                }
              />
            )}

            {/* Unsaved changes */}
            <AlertDialog.Root open={confirmingDiscard} onOpenChange={setConfirmingDiscard}>
              <AlertDialog.Portal>
                <AlertDialog.Overlay className={OVERLAY_CLASS} />
                <AlertDialog.Content className={cn(CONTENT_CLASS, 'max-w-sm')}>
                  <AlertDialog.Title className="text-base font-semibold">
                    Discard your changes?
                  </AlertDialog.Title>
                  <AlertDialog.Description className="mt-1 text-sm text-muted-foreground">
                    What you typed has not been saved.
                  </AlertDialog.Description>
                  <div className="mt-5 flex items-center justify-between gap-6">
                    <AlertDialog.Cancel asChild>
                      <Button type="button" variant="outline" size="sm" className={TARGET} autoFocus>
                        Keep editing
                      </Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className={TARGET}
                        onClick={closeForm}
                      >
                        Discard
                      </Button>
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function JobForm({
  row,
  today,
  pending,
  error,
  onDirtyChange,
  onCancel,
  onSubmit,
}: {
  /** The job being edited, or null for a new one. */
  row: Row | null;
  today: string;
  pending: boolean;
  /** A refusal from the server, shown at the top. */
  error: string | null;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSubmit: (input: JobInput) => void;
}) {
  const stored = row?.job;
  const [initial] = useState<JobFormValues>(() => (stored ? fromJob(stored) : EMPTY_JOB_FORM));
  const [values, setValues] = useState<JobFormValues>(initial);
  const [errors, setErrors] = useState<JobFormErrors>({});
  const [touched, setTouched] = useState<ReadonlySet<Field>>(() => new Set());
  // The inputs by field name, so a failed save can focus the first one that is wrong.
  const inputs = useRef<Partial<Record<Field, HTMLElement | null>>>({});
  const serverError = useRef<HTMLParagraphElement>(null);
  const base = useId();

  // The form scrolls inside the dialog, so a refusal at the top may be out of sight.
  useEffect(() => {
    if (error) serverError.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  function set<K extends Field>(field: K, value: JobFormValues[K]) {
    const next = { ...values, [field]: value };
    setValues(next);
    onDirtyChange(FIELD_KEYS.some((key) => next[key] !== initial[key]));
  }

  /** A field is checked when the user leaves it, not on every keystroke. */
  function blur(field: Field) {
    const found = formErrors(values, today, stored);
    setErrors(found);
    setTouched((prev) => {
      const next = new Set(prev).add(field);
      // "Maximum can't be lower than the minimum" sits under the maximum, whichever of the two was edited.
      if (field === 'salaryMin' && values.salaryMax.trim() !== '') next.add('salaryMax');
      return next;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const found = formErrors(values, today, stored);
    setErrors(found);
    const firstWrong = FIELD_ORDER.find((field) => found[field]);
    if (firstWrong) {
      setTouched(new Set(FIELD_ORDER));
      inputs.current[firstWrong]?.focus();
      return;
    }
    onSubmit(toInput(values));
  }

  const id = (field: Field) => `${base}-${field}`;
  const errorId = (field: Field) => `${base}-${field}-error`;
  const shown = (field: Field) => (touched.has(field) ? errors[field] : undefined);
  const salaryHelpId = `${base}-salary-help`;

  /** The error under a field, announced when it appears. */
  const errorOf = (field: Field) =>
    shown(field) ? (
      <p id={errorId(field)} role="alert" className="text-sm text-destructive">
        {shown(field)}
      </p>
    ) : null;

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      {error && (
        <p ref={serverError} role="alert" className={ALERT_CLASS}>
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">* Required</p>

      <fieldset className="min-w-0 space-y-3">
        <legend className="mb-2 text-sm font-semibold">Role</legend>
        <div className="space-y-1.5">
          <Label htmlFor={id('title')}>
            <span>
              Job title <span aria-hidden="true">*</span>
            </span>
          </Label>
          <Input
            id={id('title')}
            ref={(element) => {
              inputs.current.title = element;
            }}
            className={FIELD_HEIGHT}
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            onBlur={() => blur('title')}
            placeholder="For example, Sales Executive"
            aria-required="true"
            aria-invalid={shown('title') ? true : undefined}
            aria-describedby={shown('title') ? errorId('title') : undefined}
          />
          {errorOf('title')}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={id('department')}>Department</Label>
            <Input
              id={id('department')}
              ref={(element) => {
                inputs.current.department = element;
              }}
              className={FIELD_HEIGHT}
              value={values.department}
              onChange={(e) => set('department', e.target.value)}
              onBlur={() => blur('department')}
              placeholder="For example, Sales"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('employmentType')}>Employment type</Label>
            <select
              id={id('employmentType')}
              ref={(element) => {
                inputs.current.employmentType = element;
              }}
              className={cn(SELECT_CLASS, FIELD_HEIGHT)}
              value={values.employmentType}
              onChange={(e) => set('employmentType', e.target.value as EmploymentType)}
              onBlur={() => blur('employmentType')}
            >
              {(Object.keys(TYPE_LABEL) as EmploymentType[]).map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id('headcount')}>Headcount</Label>
          <Input
            id={id('headcount')}
            ref={(element) => {
              inputs.current.headcount = element;
            }}
            className={cn(FIELD_HEIGHT, 'w-28')}
            inputMode="numeric"
            value={values.headcount}
            onChange={(e) => set('headcount', e.target.value)}
            onBlur={() => blur('headcount')}
            aria-invalid={shown('headcount') ? true : undefined}
            aria-describedby={shown('headcount') ? errorId('headcount') : undefined}
          />
          {errorOf('headcount')}
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-3">
        <legend className="mb-2 text-sm font-semibold">Where</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={id('location')}>Location</Label>
            <Input
              id={id('location')}
              ref={(element) => {
                inputs.current.location = element;
              }}
              className={FIELD_HEIGHT}
              value={values.location}
              onChange={(e) => set('location', e.target.value)}
              onBlur={() => blur('location')}
              placeholder="For example, Shah Alam"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('workArrangement')}>Work arrangement</Label>
            <select
              id={id('workArrangement')}
              ref={(element) => {
                inputs.current.workArrangement = element;
              }}
              className={cn(SELECT_CLASS, FIELD_HEIGHT)}
              value={values.workArrangement}
              onChange={(e) => set('workArrangement', e.target.value as WorkArrangement | '')}
              onBlur={() => blur('workArrangement')}
            >
              <option value="">Not set</option>
              {(Object.keys(ARRANGEMENT_LABEL) as WorkArrangement[]).map((arrangement) => (
                <option key={arrangement} value={arrangement}>
                  {ARRANGEMENT_LABEL[arrangement]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-3">
        <legend className="mb-2 text-sm font-semibold">Details</legend>
        <div className="space-y-1.5">
          <Label htmlFor={id('description')}>Description</Label>
          <Textarea
            id={id('description')}
            ref={(element) => {
              inputs.current.description = element;
            }}
            rows={6}
            className="min-h-36"
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            onBlur={() => blur('description')}
            aria-invalid={shown('description') ? true : undefined}
            aria-describedby={shown('description') ? errorId('description') : undefined}
          />
          {errorOf('description')}
        </div>
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['salaryMin', 'Minimum salary'],
                ['salaryMax', 'Maximum salary'],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="min-w-0 space-y-1.5">
                <Label htmlFor={id(field)}>{label}</Label>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>RM</span>
                  <Input
                    id={id(field)}
                    ref={(element) => {
                      inputs.current[field] = element;
                    }}
                    className={cn(FIELD_HEIGHT, 'flex-1 px-2 text-foreground')}
                    inputMode="numeric"
                    value={values[field]}
                    onChange={(e) => set(field, e.target.value)}
                    onBlur={() => blur(field)}
                    aria-invalid={shown(field) ? true : undefined}
                    aria-describedby={shown(field) ? `${errorId(field)} ${salaryHelpId}` : salaryHelpId}
                  />
                  <span className="shrink-0 text-xs whitespace-nowrap">a month</span>
                </div>
                {errorOf(field)}
              </div>
            ))}
          </div>
          <p id={salaryHelpId} className="text-xs text-muted-foreground">
            Leave blank if you&apos;d rather not say.
          </p>
        </div>
        <div className="flex min-h-11 items-center gap-2">
          <Checkbox
            id={id('showSalary')}
            checked={values.showSalary}
            onCheckedChange={(checked) => set('showSalary', checked === true)}
          />
          <Label htmlFor={id('showSalary')} className="min-h-11">
            Show salary publicly
          </Label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id('closesOn')}>Closing date</Label>
          <Input
            id={id('closesOn')}
            ref={(element) => {
              inputs.current.closesOn = element;
            }}
            className={cn(FIELD_HEIGHT, 'w-44')}
            type="date"
            min={today}
            value={values.closesOn}
            onChange={(e) => set('closesOn', e.target.value)}
            onBlur={() => blur('closesOn')}
            aria-invalid={shown('closesOn') ? true : undefined}
            aria-describedby={shown('closesOn') ? errorId('closesOn') : undefined}
          />
          {errorOf('closesOn')}
        </div>
      </fieldset>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={TARGET}
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" className={TARGET} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
