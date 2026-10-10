'use client';

import {
  type FormEvent,
  type ReactNode,
  type RefObject,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  Check,
  FileText,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { PageHeader } from '@/components/screen/page-header';
import { BentoCard, BentoGrid } from '@/components/bento/bento';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LiveDot } from '@/components/ui/live-dot';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FORM_CATEGORY_MAX,
  FORM_NAME_MAX,
  FORM_SLUG_MAX,
  FORM_STATUSES,
  FORM_STATUS_LABEL,
  type FormFieldInput,
  type FormFilters,
  NO_FORM_FILTERS,
  filterForms,
  formCategoriesInUse,
  formCategorySuggestions,
  formatFormDate,
  hasFormFilters,
  parseFormFields,
  slugifyFormName,
} from '@/lib/reach/forms';
import type { Form, FormStatus } from '@/lib/reach/types';

/** What every lead form action answers with. */
export type LeadFormResult = { ok: boolean; error?: string };

/**
 * The writes this screen can make. The page hands them in (they are server
 * actions over the reach capabilities); people who can only read get none, and
 * with none there is no Create button and no row menu.
 */
export type LeadFormActions = {
  create: (input: FormFieldInput) => Promise<LeadFormResult>;
  update: (input: FormFieldInput & { id: string }) => Promise<LeadFormResult>;
  setStatus: (input: { id: string; status: FormStatus }) => Promise<LeadFormResult>;
  remove: (input: { id: string }) => Promise<LeadFormResult>;
};

const FALLBACK_ERROR = 'That change could not be saved. Please try again.';
/** Radix selects cannot hold an empty value, so "all" needs one of its own. */
const ALL = '__all__';

const NATIVE_SELECT_CLASS =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30';

/** Active pulses green, paused is amber, a draft is neutral. */
function StatusDot({ status }: { status: FormStatus }) {
  if (status === 'paused') {
    return <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-500" />;
  }
  return <LiveDot active={status === 'active'} />;
}

export function LeadFormsView({
  forms,
  actions,
  top,
  bottom,
}: {
  forms: Form[];
  /** Absent for viewers and demo guests, who can only read. */
  actions?: LeadFormActions;
  /** KPI cards and charts shown above the table. */
  top?: ReactNode;
  /** Charts shown below the table. */
  bottom?: ReactNode;
}) {
  const canEdit = actions != null;
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FormFilters>(NO_FORM_FILTERS);

  // One-click row changes (activate, pause) report here; the card and the
  // delete confirmation show their own errors beside their buttons.
  const [rowPending, startRow] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const editing = editingId ? (forms.find((f) => f.id === editingId) ?? null) : null;
  const formOpen = canEdit && (creating || editing != null);

  const categories = useMemo(() => formCategoriesInUse(forms), [forms]);
  const suggestions = useMemo(() => formCategorySuggestions(forms), [forms]);
  // A category that has since been renamed away no longer narrows the list.
  const category = categories.includes(filters.category) ? filters.category : '';
  const applied = useMemo(() => ({ ...filters, category }), [filters, category]);
  const shown = useMemo(() => filterForms(forms, applied), [forms, applied]);
  const narrowed = hasFormFilters(applied);
  const columns = canEdit ? 7 : 6;

  /* ---- focus ------------------------------------------------------- */

  const nameRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const menuButtons = useRef(new Map<string, HTMLButtonElement>());
  // A row whose "⋯" button should take focus as soon as it is back on screen.
  const focusMenuWhenBack = useRef<string | null>(null);
  // A menu holds on to focus until it has closed, so what it opened is focused then.
  const afterMenu = useRef<'form' | 'delete' | null>(null);

  const focusName = () => {
    nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameRef.current?.focus({ preventScroll: true });
  };
  const focusMenu = (id: string) => {
    const button = menuButtons.current.get(id);
    if (button) button.focus();
    else focusMenuWhenBack.current = id;
  };
  const registerMenu = (id: string) => (button: HTMLButtonElement | null) => {
    if (!button) {
      menuButtons.current.delete(id);
      return;
    }
    menuButtons.current.set(id, button);
    if (focusMenuWhenBack.current === id) {
      focusMenuWhenBack.current = null;
      button.focus();
    }
  };
  /** Runs once a row menu has closed. True when focus was moved somewhere new. */
  const menuClosed = (): boolean => {
    const next = afterMenu.current;
    afterMenu.current = null;
    if (next === 'form') focusName();
    else if (next === 'delete') cancelDeleteRef.current?.focus();
    return next != null;
  };

  /* ---- opening and closing ----------------------------------------- */

  const startCreate = () => {
    setRowError(null);
    setDeletingId(null);
    setEditingId(null);
    if (creating) focusName();
    // Otherwise the card mounts with the name field focused.
    setCreating(true);
  };
  const startEdit = (id: string) => {
    setRowError(null);
    setDeletingId(null);
    setCreating(false);
    setEditingId(id);
    afterMenu.current = 'form';
  };
  const startDelete = (id: string) => {
    setRowError(null);
    setCreating(false);
    setEditingId(null);
    setDeletingId(id);
    afterMenu.current = 'delete';
  };
  const closeForm = () => {
    const backTo = editingId;
    setCreating(false);
    setEditingId(null);
    if (backTo) focusMenu(backTo);
    else createRef.current?.focus();
  };
  const closeDelete = (deleted: boolean) => {
    const id = deletingId;
    setDeletingId(null);
    if (deleted || !id) createRef.current?.focus();
    else focusMenu(id);
  };

  const changeStatus = (form: Form, status: FormStatus) => {
    // One change at a time; the menu button stays enabled so focus can return to it.
    if (!actions || rowPending) return;
    setRowError(null);
    setBusyId(form.id);
    startRow(async () => {
      const result = await actions.setStatus({ id: form.id, status });
      setBusyId(null);
      if (!result.ok) setRowError(result.error ?? FALLBACK_ERROR);
    });
  };

  return (
    <ScreenContainer>
      <PageHeader
        className="mb-3"
        title="Lead Forms"
        subtitle="Manage all your lead-generation forms."
        actions={canEdit ? <CreateFormButton ref={createRef} onClick={startCreate} /> : undefined}
      />

      <BentoGrid>
        {top}

        {formOpen && actions ? (
          <LeadFormCard
            // A different form (or a new one) starts from a clean card.
            key={editing?.id ?? 'new'}
            editing={editing}
            suggestions={suggestions}
            nameRef={nameRef}
            save={(input) =>
              editing ? actions.update({ id: editing.id, ...input }) : actions.create(input)
            }
            onClose={closeForm}
          />
        ) : null}

        <BentoCard
          title="Your forms"
          subtitle={forms.length === 1 ? '1 form' : `${forms.length} forms`}
          icon={FileText}
          flush
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search forms by name or link"
                placeholder="Search form title…"
                className="pl-9"
                value={filters.query}
                onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              />
            </div>
            <Select
              value={category || ALL}
              onValueChange={(v) => setFilters({ ...filters, category: v === ALL ? '' : v })}
            >
              <SelectTrigger aria-label="Filter by category" className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.status || ALL}
              onValueChange={(v) =>
                setFilters({ ...filters, status: v === ALL ? '' : (v as FormStatus) })
              }
            >
              <SelectTrigger aria-label="Filter by status" className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rowError && !rowPending ? (
            <p
              role="alert"
              className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {rowError}
            </p>
          ) : null}

          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="whitespace-nowrap">Form details</TableHead>
                  <TableHead className="whitespace-nowrap">URL / Slug</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Views</TableHead>
                  <TableHead className="whitespace-nowrap">Contacts</TableHead>
                  <TableHead className="whitespace-nowrap">Created at</TableHead>
                  {canEdit ? <TableHead className="whitespace-nowrap">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((f) =>
                  actions && deletingId === f.id ? (
                    <DeleteFormRow
                      key={f.id}
                      form={f}
                      colSpan={columns}
                      cancelRef={cancelDeleteRef}
                      remove={() => actions.remove({ id: f.id })}
                      onClose={closeDelete}
                    />
                  ) : (
                    <TableRow key={f.id} aria-busy={busyId === f.id || undefined}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                            <FileText className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{f.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {f.category || 'No category'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        /{f.slug}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm">
                          <StatusDot status={f.status} />
                          {FORM_STATUS_LABEL[f.status]}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {f.views_count.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {f.submissions_count.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatFormDate(f.created_at)}
                      </TableCell>
                      {canEdit ? (
                        <TableCell>
                          <FormRowMenu
                            form={f}
                            buttonRef={registerMenu(f.id)}
                            onEdit={() => startEdit(f.id)}
                            onStatus={(status) => changeStatus(f, status)}
                            onDelete={() => startDelete(f.id)}
                            onClosed={menuClosed}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ),
                )}
                {shown.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columns} className="py-10 text-center">
                      {forms.length === 0 ? (
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-sm text-muted-foreground">No forms yet.</p>
                          {canEdit ? <CreateFormButton onClick={startCreate} /> : null}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-sm text-muted-foreground">
                            No forms match your search or filters.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setFilters(NO_FORM_FILTERS)}
                          >
                            Clear filters
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span aria-live="polite">
              Showing {shown.length} of {forms.length} {forms.length === 1 ? 'form' : 'forms'}
              {narrowed ? ' (filtered)' : ''}
            </span>
          </div>
        </BentoCard>

        {bottom}
      </BentoGrid>
    </ScreenContainer>
  );
}

function CreateFormButton({
  ref,
  onClick,
}: {
  ref?: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) {
  return (
    <Button ref={ref} type="button" size="sm" onClick={onClick}>
      <Plus className="size-4" />
      Create new form
    </Button>
  );
}

/** The card above the table: adds a form, or edits the one picked from a row. */
function LeadFormCard({
  editing,
  suggestions,
  nameRef,
  save,
  onClose,
}: {
  /** The form being edited; null to add a new one. */
  editing: Form | null;
  suggestions: string[];
  nameRef: RefObject<HTMLInputElement | null>;
  save: (input: FormFieldInput) => Promise<LeadFormResult>;
  /** Called after a save has gone through, and by Close or Cancel. */
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(editing?.name ?? '');
  const [category, setCategory] = useState(editing?.category ?? '');
  const [slug, setSlug] = useState(editing?.slug ?? '');
  // The link follows the name until the person types a link of their own. An
  // existing form keeps its link: changing it would break what points at it.
  const [slugEdited, setSlugEdited] = useState(editing != null);
  const [status, setStatus] = useState<FormStatus>(editing?.status ?? 'draft');
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  // An old message is not shown while the next attempt is still running.
  const error = pending ? null : failure;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    // Handled here rather than as a form action, so the fields are never reset
    // and a rejected form keeps everything that was typed.
    event.preventDefault();
    const parsed = parseFormFields({ name, category, slug, status });
    if (!parsed.ok) {
      setFailure(parsed.error);
      return;
    }
    start(async () => {
      const result = await save(parsed.input);
      if (result.ok) onClose();
      else setFailure(result.error ?? FALLBACK_ERROR);
    });
  };

  return (
    <BentoCard
      title={editing ? 'Edit form' : 'Create form'}
      subtitle={editing ? `Changing ${editing.name}` : 'Add a lead form to this workspace'}
      // The card's icon chip only draws icons from the animated set.
      icon={editing ? FileText : Plus}
      className="col-span-2 md:col-span-12"
    >
      <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-12">
        <div className="space-y-1.5 md:col-span-4">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input
            ref={nameRef}
            id={`${id}-name`}
            name="name"
            placeholder="Raya promo signup"
            value={name}
            maxLength={FORM_NAME_MAX}
            autoComplete="off"
            // Opened from the Create button, the card takes focus as it appears.
            autoFocus
            required
            onChange={(e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(slugifyFormName(e.target.value));
            }}
          />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-category`}>Category</Label>
          <Input
            id={`${id}-category`}
            name="category"
            list={`${id}-categories`}
            placeholder="Promotions"
            value={category}
            maxLength={FORM_CATEGORY_MAX}
            autoComplete="off"
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id={`${id}-categories`}>
            {suggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-slug`}>Link</Label>
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground"
            >
              /
            </span>
            <Input
              id={`${id}-slug`}
              name="slug"
              placeholder="raya-promo"
              className="pl-6 font-mono"
              value={slug}
              maxLength={FORM_SLUG_MAX + 1}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={`${id}-slug-hint`}
              onChange={(e) => {
                // The "/" is already shown in front of the field.
                const typed = e.target.value.replace(/^\/+/, '');
                setSlug(typed);
                // Emptying the field hands the link back to the name.
                setSlugEdited(typed !== '');
              }}
            />
          </div>
          <p id={`${id}-slug-hint`} className="text-xs text-muted-foreground">
            Lower-case letters, numbers and hyphens. Leave empty to use the name.
          </p>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={`${id}-status`}>Status</Label>
          <select
            id={`${id}-status`}
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as FormStatus)}
            className={NATIVE_SELECT_CLASS}
          >
            {FORM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FORM_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-12">
          <Button type="submit" className="w-full md:w-auto" disabled={pending}>
            {editing ? <Check className="size-4" /> : <Plus className="size-4" />}
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Save form'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full md:w-auto"
            onClick={onClose}
            disabled={pending}
          >
            {editing ? 'Cancel' : 'Close'}
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </BentoCard>
  );
}

/** The "⋯" menu at the end of a form's row. */
function FormRowMenu({
  form,
  buttonRef,
  onEdit,
  onStatus,
  onDelete,
  onClosed,
}: {
  form: Form;
  buttonRef: (button: HTMLButtonElement | null) => void;
  onEdit: () => void;
  onStatus: (status: FormStatus) => void;
  onDelete: () => void;
  /** Called once the menu has gone; answers whether it moved focus itself. */
  onClosed: () => boolean;
}) {
  const live = form.status === 'active';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        ref={buttonRef}
        aria-label={`Actions for ${form.name}`}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      {/* Focus goes to what the choice opened; otherwise back to this button. */}
      <DropdownMenuContent
        align="end"
        className="w-36"
        onCloseAutoFocus={(event) => {
          if (onClosed()) event.preventDefault();
        }}
      >
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onStatus(live ? 'paused' : 'active')}>
          {live ? <Pause /> : <Play />}
          {live ? 'Pause' : 'Activate'}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Replaces a form's row while asking whether to really delete it. */
function DeleteFormRow({
  form,
  colSpan,
  cancelRef,
  remove,
  onClose,
}: {
  form: Form;
  colSpan: number;
  cancelRef: RefObject<HTMLButtonElement | null>;
  remove: () => Promise<LeadFormResult>;
  /** Told whether the form was deleted, or the question was called off. */
  onClose: (deleted: boolean) => void;
}) {
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);
  const error = pending ? null : failure;

  const confirm = () =>
    start(async () => {
      const result = await remove();
      if (result.ok) onClose(true);
      else setFailure(result.error ?? FALLBACK_ERROR);
    });

  return (
    <TableRow className="bg-destructive/5 hover:bg-destructive/5">
      <TableCell colSpan={colSpan}>
        <div
          role="group"
          aria-label={`Delete ${form.name}`}
          // Stays in view when the table has been scrolled sideways on a phone.
          className="sticky left-2 flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-3 py-1 whitespace-normal md:max-w-none"
        >
          <p className="min-w-48 flex-1 text-sm">
            Delete <span className="font-medium">{form.name}</span>? Its link{' '}
            <span className="font-mono text-xs">/{form.slug}</span> will be free to use again.
            This cannot be undone.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="button" variant="destructive" size="sm" onClick={confirm} disabled={pending}>
            <Trash2 className="size-4" />
            {pending ? 'Deleting…' : 'Delete form'}
          </Button>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onClose(false)}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
