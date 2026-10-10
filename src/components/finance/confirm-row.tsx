'use client';

import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';

/** Replaces a table row while asking whether to really go ahead. Never a browser dialog. */
export function ConfirmRow({
  colSpan,
  label,
  children,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  colSpan: number;
  /** Names the question for screen readers, e.g. "Delete Lim Hardware". */
  label: string;
  /** The question itself. */
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <TableRow className="bg-destructive/5 hover:bg-destructive/5">
      <TableCell colSpan={colSpan}>
        <div
          role="group"
          aria-label={label}
          // Stays in view when the table has been scrolled sideways on a phone.
          className="sticky left-2 flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-3 py-1 whitespace-normal md:max-w-none"
        >
          <p className="min-w-48 flex-1 text-sm">{children}</p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="button" variant="destructive" size="sm" onClick={onConfirm} disabled={pending}>
            <Trash2 className="size-4" />
            {pending ? pendingLabel : confirmLabel}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending} autoFocus>
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
