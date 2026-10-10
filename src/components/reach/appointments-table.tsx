'use client';

import { useState, useTransition } from 'react';
import { Dialog } from 'radix-ui';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  APPOINTMENT_STATUSES,
  type Appointment,
  type AppointmentStatus,
} from '@/lib/reach/types';
import {
  createAppointmentAction,
  deleteAppointmentAction,
  setAppointmentStatusAction,
  updateAppointmentAction,
} from '@/app/(app)/reach/actions';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

type FormValues = {
  contact_name: string;
  kind: string;
  scheduled_at: string;
  via?: string;
  status: AppointmentStatus;
};

type ActionResult = { ok: boolean; error?: string };

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-MY', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kuala_Lumpur',
      });
}

/** ISO (UTC) -> `YYYY-MM-DDTHH:mm` in local time, as a datetime-local input wants. */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentsTable({
  appointments,
  canEdit,
}: {
  appointments: Appointment[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState(false);

  function act(p: Promise<ActionResult>) {
    start(async () => {
      const res = await p;
      setError(res.ok ? null : (res.error ?? 'Something went wrong.'));
      if (res.ok) {
        setEditing(null);
        setCreating(false);
      }
    });
  }

  const formOpen = canEdit && (creating || editing !== null);

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setError(null);
              setCreating(true);
            }}
            disabled={pending}
          >
            <Plus className="size-4" />
            New appointment
          </Button>
        </div>
      )}
      {error && !formOpen && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Contact</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Via</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap font-medium">{a.contact_name}</TableCell>
                <TableCell className="whitespace-nowrap">{a.kind}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatWhen(a.scheduled_at)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{a.via || '—'}</TableCell>
                <TableCell>
                  {canEdit ? (
                    <Select
                      value={a.status}
                      disabled={pending}
                      onValueChange={(v) => {
                        if (v === a.status) return;
                        act(
                          setAppointmentStatusAction({
                            id: a.id,
                            status: v as AppointmentStatus,
                          }),
                        );
                      }}
                    >
                      <SelectTrigger
                        aria-label={`Status for ${a.contact_name}`}
                        size="sm"
                        className="w-36"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {APPOINTMENT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm">{STATUS_LABEL[a.status] ?? a.status}</span>
                  )}
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setError(null);
                          setEditing(a);
                        }}
                        disabled={pending}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                      {confirmingId === a.id ? (
                        <>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              setConfirmingId(null);
                              act(deleteAppointmentAction({ id: a.id }));
                            }}
                          >
                            <Trash2 className="size-4" />
                            Confirm?
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={pending}
                          aria-label="Delete"
                          onClick={() => setConfirmingId(a.id)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {appointments.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 6 : 5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No appointments yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog.Root
        open={formOpen}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-lg outline-none">
            <Dialog.Title className="text-base font-semibold">
              {editing ? 'Edit appointment' : 'New appointment'}
            </Dialog.Title>
            <Dialog.Description className="mb-4 text-sm text-muted-foreground">
              {editing ? 'Update or reschedule this appointment.' : 'Book an appointment.'}
            </Dialog.Description>
            {formOpen && (
              <AppointmentForm
                key={editing?.id ?? 'new'}
                initial={editing}
                disabled={pending}
                error={error}
                onCancel={() => {
                  setCreating(false);
                  setEditing(null);
                }}
                onSubmit={(values) =>
                  act(
                    editing
                      ? updateAppointmentAction({ id: editing.id, ...values })
                      : createAppointmentAction(values),
                  )
                }
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function AppointmentForm({
  initial,
  disabled,
  error,
  onCancel,
  onSubmit,
}: {
  initial: Appointment | null;
  disabled: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (v: FormValues) => void;
}) {
  const [contactName, setContactName] = useState(initial?.contact_name ?? '');
  const [kind, setKind] = useState(initial?.kind ?? '');
  const [when, setWhen] = useState(initial ? toDatetimeLocalValue(initial.scheduled_at) : '');
  const [via, setVia] = useState(initial?.via ?? '');
  const [status, setStatus] = useState<AppointmentStatus>(initial?.status ?? 'scheduled');
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const date = new Date(when);
        if (!when || Number.isNaN(date.getTime())) {
          setLocalError('Pick a valid date and time.');
          return;
        }
        setLocalError(null);
        onSubmit({
          contact_name: contactName,
          kind,
          // datetime-local is zoneless local time; the server wants a Z-suffixed ISO string.
          scheduled_at: date.toISOString(),
          // Blank is omitted: the schema rejects '' (only undefined skips .optional()).
          via: via.trim() || undefined,
          status,
        });
      }}
    >
      <Field label="Contact">
        <Input
          aria-label="Contact"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          required
        />
      </Field>
      <Field label="Kind">
        <Input aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} required />
      </Field>
      <Field label="When">
        <Input
          type="datetime-local"
          aria-label="When"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Via">
          <Input aria-label="Via" value={via} onChange={(e) => setVia(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={(v) => setStatus(v as AppointmentStatus)}>
            <SelectTrigger aria-label="Status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPOINTMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {(localError ?? error) && (
        <p role="alert" className="text-sm text-destructive">
          {localError ?? error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={disabled}>
          Save
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
