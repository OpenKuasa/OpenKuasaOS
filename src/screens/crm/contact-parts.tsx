'use client';

import { useActionState, type RefObject } from 'react';
import { Check, FileText, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { BentoCard } from '@/components/bento/bento';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/lib/crm/contacts';
import type { CrmFollowUp } from '@/lib/crm/follow-ups';
import type { CrmFormAction, CrmFormState } from '@/lib/crm/form-state';

/**
 * Runs a form action and calls `onDone` once it has succeeded, so the caller
 * can close whatever the form was shown in.
 */
function useCrmForm(action: CrmFormAction, onDone?: () => void) {
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    async (prev, formData) => {
      const next = await action(prev, formData);
      if (next?.ok) onDone?.();
      return next;
    },
    undefined,
  );
  // An old message is not shown while the next attempt is still running.
  const error = state && !state.ok && !pending ? state.error : null;
  const values = state && !state.ok ? state.values : null;
  return { formAction, pending, error, values };
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** The card above the table: adds a contact, or edits the one picked from a row. */
export function ContactFormCard({
  action,
  editing,
  onSaved,
  onClose,
  firstFieldRef,
}: {
  action: CrmFormAction;
  /** The contact being edited; null to add a new one. */
  editing: CrmContact | null;
  /** Called after a save has gone through. */
  onSaved: () => void;
  /** Cancel when editing, Close when adding. */
  onClose: () => void;
  firstFieldRef: RefObject<HTMLInputElement | null>;
}) {
  const { formAction, pending, error, values } = useCrmForm(action, onSaved);
  const v = values ?? editing?.form ?? {};


  return (
    <BentoCard
      title={editing ? 'Edit contact' : 'Add contact'}
      subtitle={
        editing
          ? `Changing ${editing.email || editing.first}`
          : 'Create a Kasturi contact for this workspace'
      }
      // The card's icon chip only draws icons from the animated set.
      icon={editing ? FileText : Plus}
      className="col-span-2 md:col-span-12"
    >
      <form action={formAction} className="grid gap-3 md:grid-cols-12">
        {editing ? <input type="hidden" name="contactId" value={editing.id} /> : null}
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            ref={firstFieldRef}
            id="firstName"
            name="firstName"
            placeholder="Aisyah"
            defaultValue={v.firstName}
            required
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" placeholder="Rahim" defaultValue={v.lastName} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="aisyah@example.com"
            defaultValue={v.email}
            required
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" placeholder="+60123456789" defaultValue={v.phone} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            name="company"
            placeholder="Rimba Ventures"
            defaultValue={v.company}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="country">Country code</Label>
          <Input
            id="country"
            name="country"
            defaultValue={v.country || 'MY'}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            title="Two-letter country code, such as MY"
            className="uppercase"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={v.status || 'lead'}
            className={SELECT_CLASS}
          >
            <option value="lead">New lead</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="customer">Customer</option>
            {/* Archiving is something you do to a contact you already have. */}
            {editing ? <option value="archived">Archived</option> : null}
          </select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="leadScore">Lead score</Label>
          <Input
            id="leadScore"
            name="leadScore"
            type="number"
            min="0"
            max="100"
            defaultValue={v.leadScore || '0'}
          />
        </div>
        <div className="space-y-1.5 md:col-span-6">
          <Label htmlFor="tags">Tags</Label>
          <Input
            id="tags"
            name="tags"
            placeholder="vip, wholesale, penang"
            defaultValue={v.tags}
            aria-describedby="tags-hint"
          />
          <p id="tags-hint" className="sr-only">
            Separate tags with commas.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 md:col-span-12">
          <Button type="submit" className="w-full md:w-auto" disabled={pending}>
            {editing ? <Check className="size-4" /> : <Plus className="size-4" />}
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Save contact'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {editing ? 'Cancel' : 'Close'}
          </Button>
          {error ? (
            <p role="alert" className="pb-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </BentoCard>
  );
}

/** A contact's tags, shown under their email. */
export function ContactTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="mt-0.5 flex flex-wrap gap-1" aria-label="Tags">
      {tags.map((tag) => (
        <li
          key={tag}
          className="rounded-full bg-muted px-1.5 py-px text-[0.7rem] font-medium text-muted-foreground"
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

/** The "⋯" menu at the end of a contact's row. */
export function ContactRowMenu({
  label,
  onEdit,
  onDelete,
  onClosed,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  /** Called once the menu has gone, when focus is free to move. */
  onClosed: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${label}`}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      {/* Focus goes to what the choice opened, not back to this button. */}
      <DropdownMenuContent
        align="end"
        className="w-36"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed();
        }}
      >
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Replaces a contact's row while asking whether to really delete it. */
export function DeleteContactRow({
  contact,
  action,
  colSpan,
  onClose,
}: {
  contact: CrmContact;
  action: CrmFormAction;
  colSpan: number;
  onClose: () => void;
}) {
  const { formAction, pending, error } = useCrmForm(action, onClose);
  const name = contact.email || `${contact.first} ${contact.last}`.trim();

  return (
    <TableRow className="bg-destructive/5 hover:bg-destructive/5">
      <TableCell colSpan={colSpan}>
        <form action={formAction} className="flex flex-wrap items-center gap-3 py-1">
          <input type="hidden" name="contactId" value={contact.id} />
          <p className="min-w-0 flex-1 text-sm">
            Delete <span className="font-medium">{name}</span>? Its deals, notes and
            follow-ups are deleted too. This cannot be undone.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="destructive" size="sm" disabled={pending}>
            <Trash2 className="size-4" />
            {pending ? 'Deleting…' : 'Delete contact'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </form>
      </TableCell>
    </TableRow>
  );
}

function FollowUpItem({
  item,
  complete,
}: {
  item: CrmFollowUp;
  complete?: CrmFormAction;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <span className="min-w-0 truncate">{item.title}</span>
      {item.due ? (
        <span className={cn('text-muted-foreground', item.overdue && 'font-medium text-destructive')}>
          {item.overdue ? `Overdue · ${item.due}` : item.due}
        </span>
      ) : null}
      {complete ? <CompleteFollowUp id={item.id} title={item.title} action={complete} /> : null}
    </li>
  );
}

function CompleteFollowUp({
  id,
  title,
  action,
}: {
  id: string;
  title: string;
  action: CrmFormAction;
}) {
  const { formAction, pending, error } = useCrmForm(action);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="followUpId" value={id} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Mark "${title}" as done`}
        className="font-medium uppercase tracking-wide text-primary hover:underline disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Done'}
      </button>
      {error ? (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      ) : null}
    </form>
  );
}

function AddFollowUpForm({
  contactId,
  action,
  onClose,
}: {
  contactId: string;
  action: CrmFormAction;
  onClose: () => void;
}) {
  const { formAction, pending, error, values } = useCrmForm(action, onClose);
  return (
    <form action={formAction} className="mt-1.5 flex flex-wrap items-center gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <Input
        name="title"
        aria-label="What to follow up on"
        placeholder="Call back about the quote"
        defaultValue={values?.title}
        maxLength={200}
        required
        autoFocus
        className="h-8 w-56"
      />
      <Input
        name="dueDate"
        type="date"
        aria-label="Due date"
        defaultValue={values?.dueDate}
        className="h-8 w-40"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
        Cancel
      </Button>
      {error ? (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** A contact's open follow-ups, with the form to add one, under their email. */
export function ContactFollowUps({
  contactId,
  items,
  add,
  complete,
  adding,
  onAdd,
  onClose,
}: {
  contactId: string;
  items: CrmFollowUp[];
  /** Absent for people who can only read. */
  add?: CrmFormAction;
  complete?: CrmFormAction;
  adding: boolean;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {items.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5">
          {items.map((item) => (
            <FollowUpItem key={item.id} item={item} complete={complete} />
          ))}
        </ul>
      ) : null}
      {add ? (
        adding ? (
          <AddFollowUpForm contactId={contactId} action={add} onClose={onClose} />
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="text-xs font-medium uppercase tracking-wide text-primary hover:underline"
          >
            + Add follow-up
          </button>
        )
      ) : null}
    </>
  );
}
